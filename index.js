/**
 * @local/dsh-zotero-link — Zotero literature integration for DeepSeek Harness.
 *
 * Exposes seven `zotero_*` tools and a small web API for the "文献" conversation
 * view. All Zotero access goes through the local zotero-link bridge addon on
 * 127.0.0.1:23119; this plugin never opens zotero.sqlite.
 */
import { randomUUID } from "node:crypto";
import { Bridge, BridgeError, errorResult } from "./lib/bridge.js";
import { PreviewStore } from "./lib/preview.js";
import * as fmt from "./lib/format.js";

export const inject = ["tools", "systemPrompt"];

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: true,
  properties: {
    ok: { type: "boolean" },
    code: { type: "string" },
    message: { type: "string" },
    data: { type: "object", additionalProperties: true },
  },
  required: ["ok"],
};

const SYSTEM_PROMPT = `【Zotero 文献联动】用户说「这篇/本文/当前文献」时，先调用 zotero_current 确认真实条目与页码，不要凭记忆猜标题或内容。
引用原文时必须同时给出：印刷页码（工具返回的 pageLabel 或 page.label）、逐字片段、以及工具返回的 zotero:// 链接；不要改写页码或链接。
用户问「原文在哪/哪一段」时，用 zotero_pages 的 query 模式定位并引用上下文。
写 Zotero 笔记前必须先 zotero_note action=preview，把预览与目标展示给用户；用户明确同意后才 action=commit（previewId 10 分钟内有效）。
生成文献综述时，每一句都要带 citation 链接（摘录/笔记/页码级均可）；无法定位到原文的句子写「（未落到原文：待补）」，禁止编造页码、引文或文献条目。`;

function sessionIdOf(exec) {
  return exec?.agent?.id ?? exec?.agent?.session?.id ?? "unknown";
}

function textResult(text) {
  return [{ type: "text", text: String(text ?? "") }];
}

function defineTool({ name, description, parameters, run, render }) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => textResult(value && value.ok ? render(value.data) : fmt.renderError(value)),
    },
    async execute(args, exec) {
      try {
        return { ok: true, data: await run(args || {}, exec || {}) };
      } catch (error) {
        return errorResult(error);
      }
    },
  };
}

function describeNoteTarget(payload) {
  if (payload.mode === "append") return `追加到现有笔记 ${payload.noteKey}`;
  const parts = ["新建笔记"];
  if (payload.parentItemKey) parts.push(`挂到条目 ${payload.parentItemKey}`);
  if (payload.collectionKey) parts.push(`加入集合 ${payload.collectionKey}`);
  return parts.join(" · ");
}

export function apply(ctx) {
  const bridge = new Bridge();
  const previews = new PreviewStore();

  const tools = [
    defineTool({
      name: "zotero_current",
      description:
        "读取 Zotero 当前正在阅读的文献：优先当前 PDF 阅读器标签页，其次库内选中项，最后最近阅读。返回条目元数据、当前页码、本页摘录、摘录/笔记数量与最近阅读列表。用户说“这篇/本文/当前文献”时必须先调用。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          scope: {
            type: "string",
            enum: ["auto", "recent"],
            description: "auto=当前文献（默认）；recent=只返回最近阅读列表",
          },
          limit: { type: "number", description: "最近阅读条数，默认 5，最大 30" },
        },
      },
      async run(args) {
        const data = await bridge.current(args.limit || 5);
        if (args.scope === "recent") {
          return { mode: "recent", item: null, page: null, recent: data.recent || [], annotations: [], notes: [] };
        }
        return data;
      },
      render: (data) => fmt.renderCurrent(data),
    }),

    defineTool({
      name: "zotero_library",
      description:
        "浏览 Zotero 库：列出集合树、某个集合里的文献、最近阅读条目或标签。用于确定文献综述的语料范围。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: {
            type: "string",
            enum: ["collections", "collection-items", "recent-items", "tags"],
            description: "collections=集合树；collection-items=集合内文献；recent-items=最近阅读；tags=标签",
          },
          collection: { type: "string", description: "集合名或 8 位 key（collection-items 时必填）" },
          limit: { type: "number", description: "条数上限，默认 60" },
        },
        required: ["action"],
      },
      async run(args) {
        if (args.action === "collections") return bridge.collections();
        if (args.action === "recent-items") {
          const data = await bridge.current(args.limit || 10);
          return { recent: data.recent || [] };
        }
        if (args.action === "tags") return bridge.tags(args.limit || 120);
        const collectionKey = await bridge.resolveCollectionKey(args.collection);
        if (!collectionKey) throw new BridgeError("NOT_FOUND", `找不到集合：${args.collection || "(空)"}`);
        return bridge.collectionItems(collectionKey, args.limit || 60);
      },
      render: (data) => fmt.renderCollections(data),
    }),

    defineTool({
      name: "zotero_search",
      description:
        "在 Zotero 库中检索：标题/摘要/作者（title）、我的摘录（annotation）、我的笔记（note）或全文（fulltext）。全文命中会返回页码、上下文与链接。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", description: "检索词" },
          scope: {
            type: "string",
            enum: ["all", "title", "annotation", "note", "fulltext"],
            description: "检索范围，默认 all（标题+摘录+笔记）",
          },
          collection: { type: "string", description: "限定集合（名称或 key），可选" },
          tag: { type: "string", description: "限定标签，可选" },
          itemKey: { type: "string", description: "fulltext 模式下限定单篇条目，可选" },
          limit: { type: "number", description: "命中上限，默认 10" },
        },
        required: ["query"],
      },
      async run(args) {
        const collectionKey = args.collection ? await bridge.resolveCollectionKey(args.collection) : null;
        if (args.collection && !collectionKey) {
          throw new BridgeError("NOT_FOUND", `找不到集合：${args.collection}`);
        }
        return bridge.search({
          q: args.query,
          scope: args.scope || "all",
          collectionKey,
          tag: args.tag,
          itemKey: args.itemKey,
          limit: args.limit || 10,
        });
      },
      render: (data) => fmt.renderSearch(data),
    }),

    defineTool({
      name: "zotero_item",
      description:
        "读取单篇文献/附件的完整资料：元数据、摘要、标签、集合、附件、我的摘录（含页码与链接）与我的笔记。key 可以是父条目或附件。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string", description: "Zotero 条目或附件 key（8 位）" },
          include: {
            type: "array",
            items: { type: "string", enum: ["attachments", "annotations", "notes"] },
            description: "包含的子数据，默认三项全含",
          },
        },
        required: ["key"],
      },
      async run(args) {
        const key = args.key || args.itemKey || args.attachmentKey;
        if (!key) throw new BridgeError("INVALID_ARG", "key 为空");
        const include = (args.include || ["attachments", "annotations", "notes"]).join(",");
        return bridge.item(key, include);
      },
      render: (data) => fmt.renderItem(data),
    }),

    defineTool({
      name: "zotero_pages",
      description:
        "读取某个 PDF 附件的全文页文本，或用关键词在全文里定位到具体页与上下文。页码参数从 1 开始（PDF 页序号）。用于回答“原文在哪”并给出逐字引用。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          attachmentKey: { type: "string", description: "PDF 附件 key（优先）" },
          itemKey: { type: "string", description: "父条目 key（自动取最佳 PDF）" },
          pageStart: { type: "number", description: "起始 PDF 页序号，从 1 开始" },
          pageEnd: { type: "number", description: "结束 PDF 页序号，从 1 开始" },
          query: { type: "string", description: "关键词定位模式：返回命中页、上下文与链接" },
          maxPages: { type: "number", description: "单次最多返回页数，默认 8，最大 30" },
        },
      },
      async run(args) {
        const params = {
          attachmentKey: args.attachmentKey,
          itemKey: args.itemKey,
          query: args.query,
          maxPages: args.maxPages || 8,
        };
        if (Number.isFinite(Number(args.pageStart))) params.pageStart = Math.max(0, Number(args.pageStart) - 1);
        if (Number.isFinite(Number(args.pageEnd))) params.pageEnd = Math.max(0, Number(args.pageEnd) - 1);
        return bridge.fulltext(params);
      },
      render: (data) => fmt.renderPages(data),
    }),

    defineTool({
      name: "zotero_note",
      description:
        "写 Zotero 笔记，分两步：action=preview 生成预览（不写入），把预览给用户看；用户确认后 action=commit 带 previewId 真正写入。可新建子笔记（parentItemKey）、新建独立笔记并加入集合（collectionKey），或追加到现有笔记（noteKey）。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["preview", "commit"], description: "preview=预览；commit=确认写入" },
          previewId: { type: "string", description: "commit 时必填，来自 preview" },
          parentItemKey: { type: "string", description: "挂到该条目下的子笔记（可选）" },
          noteKey: { type: "string", description: "追加到该现有笔记（可选）" },
          collectionKey: { type: "string", description: "新建独立笔记并加入该集合（可选）" },
          tags: { type: "array", items: { type: "string" }, description: "新笔记标签（可选）" },
          markdown: { type: "string", description: "笔记内容（Markdown；preview 时必填）" },
        },
        required: ["action"],
      },
      async run(args, exec) {
        if (args.action === "preview") {
          const markdown = String(args.markdown || "").trim();
          if (!markdown) throw new BridgeError("INVALID_ARG", "markdown 为空：请先写好笔记内容");
          if (!args.parentItemKey && !args.noteKey && !args.collectionKey) {
            throw new BridgeError(
              "INVALID_ARG",
              "请给出 parentItemKey（挂到文献下）、noteKey（追加）或 collectionKey（独立笔记入库）之一"
            );
          }
          const payload = {
            mode: args.noteKey ? "append" : "create",
            parentItemKey: args.parentItemKey || null,
            noteKey: args.noteKey || null,
            collectionKey: args.collectionKey || null,
            tags: Array.isArray(args.tags) ? args.tags : [],
            html: fmt.markdownToHtml(markdown),
            markdown,
          };
          const previewId = previews.create(sessionIdOf(exec), payload);
          return {
            previewId,
            mode: payload.mode,
            target: describeNoteTarget(payload),
            text: markdown,
            links: fmt.extractLinks(markdown),
            chars: payload.html.length,
          };
        }
        if (args.action === "commit") {
          const previewId = String(args.previewId || "").trim();
          if (!previewId) throw new BridgeError("INVALID_ARG", "previewId 为空");
          const resolved = previews.resolve(previewId, sessionIdOf(exec));
          if (!resolved.ok) {
            throw new BridgeError(
              resolved.code,
              resolved.code === "PREVIEW_EXPIRED" ? "预览已过期，请重新 preview" : "预览不属于当前会话，请重新 preview"
            );
          }
          const payload = resolved.payload;
          const result =
            payload.mode === "append"
              ? await bridge.appendNote({ noteKey: payload.noteKey, html: payload.html })
              : await bridge.createNote({
                  parentItemKey: payload.parentItemKey,
                  collectionKey: payload.collectionKey,
                  tags: payload.tags,
                  html: payload.html,
                });
          resolved.remove();
          return {
            noteKey: result.noteKey,
            link: result.link,
            title: result.title,
            mode: payload.mode,
          };
        }
        throw new BridgeError("INVALID_ARG", "action 必须是 preview 或 commit");
      },
      render: (data) => (data && data.previewId ? fmt.renderNotePreview(data) : fmt.renderNoteCommit(data)),
    }),

    defineTool({
      name: "zotero_open",
      description: "在 Zotero 中打开条目的 PDF 到指定页或高亮，便于核对原文。",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          itemKey: { type: "string", description: "父条目 key（自动取最佳 PDF）" },
          attachmentKey: { type: "string", description: "PDF 附件 key（优先）" },
          page: { type: "number", description: "PDF 页序号，从 1 开始" },
          annotationKey: { type: "string", description: "要高亮定位的注解 key，可选" },
        },
      },
      async run(args) {
        return bridge.open({
          itemKey: args.itemKey,
          attachmentKey: args.attachmentKey,
          page: args.page,
          annotationKey: args.annotationKey,
        });
      },
      render: (data) => fmt.renderOpen(data),
    }),
  ];

  for (const definition of tools) {
    ctx.effect(() => ctx.tools.register(definition), `zotero-link: ${definition.name}`);
  }

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: "zotero-link",
        order: 55,
        text: SYSTEM_PROMPT,
      }),
    "zotero-link: system prompt"
  );

  ctx.inject(["webServer"], (webCtx) => {
    webCtx.effect(
      () =>
        webCtx.webServer.register({
          kind: "prefix",
          path: "/zotero-link",
          handler: createWebHandler(bridge, () => ctx.get("agents")),
        }),
      "zotero-link: web api"
    );
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function extractText(content) {
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") parts.push(block.text);
  }
  return parts.join("\n").trim();
}

function transcriptOf(agent, limit) {
  const session = agent && agent.session;
  if (!session) return { messages: [], running: false, turn: null };
  let events = [];
  try {
    events = (typeof session.ownEvents === "function" ? session.ownEvents() : null) || session.events || [];
  } catch {
    events = [];
  }

  // Only surface the final assistant text of a completed turn: intermediate
  // assistant messages in the same turn are progress narration or tool calls.
  const endedTurns = new Set();
  let lastCompletedTurn = null;
  let lastStartedTurn = null;
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const data = event.data || {};
    if (event.type === "turn/end" && Number.isInteger(data.turn)) {
      endedTurns.add(data.turn);
      lastCompletedTurn = data.turn;
    } else if (event.type === "turn/start" && Number.isInteger(data.turn)) {
      lastStartedTurn = data.turn;
    }
  }
  const running = Number.isInteger(lastStartedTurn) && !endedTurns.has(lastStartedTurn);
  const allowedTurn = running ? lastCompletedTurn : lastStartedTurn;

  const messages = [];
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const data = event.data || {};
    if (event.type === "user/message") {
      const text = extractText(data.content);
      if (text) messages.push({ role: "user", text, seq: event.seq, time: event.time });
    } else if (event.type === "assistant/message") {
      if (Number.isInteger(allowedTurn) && Number.isInteger(data.turn) && data.turn !== allowedTurn) continue;
      const text = extractText(data.message && data.message.content);
      if (text) messages.push({ role: "assistant", text, seq: event.seq, time: event.time, turn: data.turn });
    }
  }
  return {
    messages: messages.slice(-Math.max(1, Math.min(limit, 20))),
    running,
    turn: Number.isInteger(lastStartedTurn) ? lastStartedTurn : null,
  };
}

function buildAskText(question, context) {
  const title = context.title ? `《${context.title}》` : "Zotero 当前文献";
  const page = context.pageLabel
    ? `（p.${context.pageLabel}）`
    : Number.isInteger(context.pageIndex)
      ? `（PDF p.${context.pageIndex + 1}）`
      : "";
  const key = context.itemKey ? `（key ${context.itemKey}）` : "";
  return `${title}${page}${key}：\n${question}\n\n（请先用 zotero_current / zotero_pages 定位原文；回答给出印刷页码与 zotero:// 链接，引用逐字。）`;
}

function createWebHandler(bridge, getAgents) {
  return async function handler(req, res) {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname;
    try {
      if (req.method === "GET" && path === "/zotero-link/api/status") {
        return sendJson(res, 200, await bridge.status());
      }
      if (req.method === "GET" && path === "/zotero-link/api/current") {
        try {
          return sendJson(res, 200, { ok: true, data: await bridge.current(5) });
        } catch (error) {
          return sendJson(res, 200, errorResult(error));
        }
      }
      if (req.method === "GET" && path === "/zotero-link/api/item") {
        const key = url.searchParams.get("key");
        if (!key) return sendJson(res, 400, { ok: false, code: "INVALID_ARG", message: "key is required" });
        try {
          return sendJson(res, 200, { ok: true, data: await bridge.item(key) });
        } catch (error) {
          return sendJson(res, 200, errorResult(error));
        }
      }
      if (req.method === "POST" && path === "/zotero-link/api/open") {
        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          return sendJson(res, 400, { ok: false, code: "INVALID_ARG", message: "invalid JSON body" });
        }
        try {
          const data = await bridge.open({
            itemKey: body.itemKey,
            attachmentKey: body.attachmentKey,
            page: body.page,
            annotationKey: body.annotationKey,
          });
          return sendJson(res, 200, { ok: true, data });
        } catch (error) {
          return sendJson(res, 200, errorResult(error));
        }
      }
      if (req.method === "GET" && path === "/zotero-link/api/transcript") {
        const agents = getAgents();
        if (!agents) {
          return sendJson(res, 200, { ok: false, code: "NO_AGENT_SERVICE", message: "当前 DSH 没有可用的 Agent 服务" });
        }
        const sessionId = url.searchParams.get("sessionId");
        const limit = Number(url.searchParams.get("limit") || 8);
        let agent = null;
        if (sessionId) {
          try {
            agent = agents.get(String(sessionId));
          } catch {
            agent = null;
          }
        }
        if (!agent) {
          let roots = [];
          try {
            roots = agents.roots() || [];
          } catch {
            roots = [];
          }
          agent = roots.find((entry) => entry.status === "running") || roots[roots.length - 1] || null;
        }
        if (!agent) {
          return sendJson(res, 200, { ok: false, code: "NO_SESSION", message: "当前没有打开的对话会话" });
        }
        const transcript = transcriptOf(agent, Number.isFinite(limit) ? limit : 8);
        return sendJson(res, 200, {
          ok: true,
          data: { sessionId: agent.id, messages: transcript.messages, running: transcript.running, turn: transcript.turn },
        });
      }
      if (req.method === "POST" && path === "/zotero-link/api/ask") {
        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          return sendJson(res, 400, { ok: false, code: "INVALID_ARG", message: "invalid JSON body" });
        }
        const question = String(body.question || "").trim();
        if (!question) {
          return sendJson(res, 400, { ok: false, code: "INVALID_ARG", message: "question is required" });
        }
        const agents = getAgents();
        if (!agents) {
          return sendJson(res, 200, {
            ok: false,
            code: "NO_AGENT_SERVICE",
            message: "当前 DSH 没有可用的 Agent 服务",
          });
        }
        let agent = null;
        let resolvedBy = "session";
        if (body.sessionId) {
          try {
            agent = agents.get(String(body.sessionId));
          } catch {
            agent = null;
          }
        }
        if (!agent) {
          resolvedBy = "roots";
          let roots = [];
          try {
            roots = agents.roots() || [];
          } catch {
            roots = [];
          }
          agent = roots.find((entry) => entry.status === "running") || roots[roots.length - 1] || null;
        }
        if (!agent) {
          return sendJson(res, 200, {
            ok: false,
            code: "NO_SESSION",
            message: "当前没有打开的对话会话，请先在左侧打开一个会话再发送",
          });
        }
        const text = buildAskText(question, body.context || {});
        if (body.dryRun) {
          return sendJson(res, 200, {
            ok: true,
            data: { sessionId: agent.id, resolvedBy, status: agent.status, preview: text },
          });
        }
        try {
          agent.followup({
            id: randomUUID(),
            role: "user",
            content: [{ type: "text", text }],
            source: { kind: "user" },
          });
        } catch (error) {
          return sendJson(res, 200, {
            ok: false,
            code: "DELIVER_FAILED",
            message: `投递失败：${(error && error.message) || error}`,
          });
        }
        return sendJson(res, 200, {
          ok: true,
          data: { sessionId: agent.id, resolvedBy, status: agent.status },
        });
      }
      return sendJson(res, 404, { ok: false, code: "NOT_FOUND", message: "unknown route" });
    } catch (error) {
      return sendJson(res, 500, errorResult(error));
    }
  };
}
