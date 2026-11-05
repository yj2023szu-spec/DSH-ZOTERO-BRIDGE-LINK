window.__ModuleLoader__.load({
  id: "@local/dsh-zotero-link",
  factory(require) {
    const React = require("react");
    const h = React.createElement;

    const API = "/zotero-link/api";
    const POLL_MS = 5000;

    // Session-scoped probe (composer dock) keeps the id of the conversation the
    // user is currently looking at; the root-scoped sidebar panel needs it to
    // deliver a question without leaving the panel.
    let activeSessionId = null;
    const STORE = {
      sessions: "zotero-link:sessions",
      workspace: "zotero-link:workspace",
      follow: "zotero-link:follow",
    };
    function readStore(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    }
    function writeStore(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    }
    function readSessionMap() {
      const map = readStore(STORE.sessions, {});
      return map && typeof map === "object" ? map : {};
    }
    try {
      if (typeof localStorage !== "undefined") activeSessionId = localStorage.getItem("zotero-link:session");
    } catch {
      /* ignore */
    }

    function SessionProbe(props) {
      if (props && props.sessionId) {
        activeSessionId = String(props.sessionId);
        try {
          localStorage.setItem("zotero-link:session", activeSessionId);
        } catch {
          /* ignore */
        }
      }
      return null;
    }

    const isZh = (() => {
      try {
        return String(navigator.language || "").toLowerCase().startsWith("zh");
      } catch {
        return true;
      }
    })();

    const TEXT = isZh
      ? {
          tab: "文献",
          connected: "Zotero 已连接",
          disconnected: "Zotero 未连接",
          loading: "正在读取 Zotero…",
          noItem: "未检测到正在阅读的文献",
          noItemHint: "在 Zotero 里打开一篇 PDF，或选中一个条目，这里会自动刷新。",
          open: "打开原文",
          askThis: "提问本文",
          annotations: "摘录",
          notes: "笔记",
          recent: "最近阅读",
          askPlaceholder: "问这篇文献，例如：本文的识别策略是什么？",
          fillComposer: "填入输入框",
          inserted: "已填入输入框，按 Enter 发送",
          copied: "无法写入输入框，已复制到剪贴板",
          copyFailed: "无法写入输入框，请手动复制",
          refresh: "刷新",
          quote: "引用",
          askAbout: "以此提问",
          presetContribution: "核心贡献",
          presetMethod: "方法与识别",
          presetFindings: "主要结论",
          presetLimits: "局限与争议",
          presetOrganize: "整理摘录成笔记",
          noAnnotations: "这篇还没有摘录。",
          noNotes: "这篇还没有笔记。",
          emptyRecent: "还没有阅读记录。",
          installHint: "安装桥接插件后重启 Zotero：工具 → 插件 → 齿轮 → Install Add-on From File → dist/zotero-link.xpi",
          pageText: "页",
          charCount: "条",
          readMode: "阅读器",
          selectedMode: "选中项",
          recentMode: "最近阅读",
          askTitle: "提问",
          statusBad: "桥接连不上",
          copyPrompt: "复制提问",
          copiedToPaste: "已复制，粘贴到对话输入框发送",
          sendToChat: "发送到对话",
          sending: "发送中…",
          sent: "已发送到对话，回答会显示在这里",
          sendFailed: "发送失败",
          recentAnswer: "最近回答",
          copyNote: "复制为笔记",
          noteCopied: "已复制为笔记（Markdown）",
          copyAnswer: "复制回答",
          answerCopied: "已复制回答",
          noAnswer: "还没有回答。在下面提问后，最终回答会显示在这里。",
          youAsked: "你问",
          generating: "正在生成回答…",
          workspace: "工作区",
          selectWorkspace: "选择工作区",
          followPaper: "跟随当前文献",
          openSession: "打开本文对话",
          newSession: "新建本文对话",
          noWorkspace: "请先在右上角选择工作区",
          createFailed: "创建会话失败",
          sessionCreated: "已为本文新建对话",
          turnError: "上次提问失败",
        }
      : {
          tab: "Library",
          connected: "Zotero connected",
          disconnected: "Zotero not connected",
          loading: "Reading Zotero…",
          noItem: "No paper detected",
          noItemHint: "Open a PDF in Zotero or select an item; this view refreshes automatically.",
          open: "Open PDF",
          askThis: "Ask about this",
          annotations: "Highlights",
          notes: "Notes",
          recent: "Recently read",
          askPlaceholder: "Ask about this paper, e.g. what is its identification strategy?",
          fillComposer: "Fill composer",
          inserted: "Inserted into the composer — press Enter to send",
          copied: "Could not insert; copied to the clipboard",
          copyFailed: "Could not insert; please copy manually",
          refresh: "Refresh",
          quote: "Quote",
          askAbout: "Ask about this",
          presetContribution: "Contribution",
          presetMethod: "Method",
          presetFindings: "Findings",
          presetLimits: "Limitations",
          presetOrganize: "Organize into a note",
          noAnnotations: "No highlights yet.",
          noNotes: "No notes yet.",
          emptyRecent: "Nothing read yet.",
          installHint:
            "Install the bridge add-on, then restart Zotero: Tools → Add-ons → gear → Install Add-on From File → dist/zotero-link.xpi",
          pageText: "p.",
          charCount: "",
          readMode: "reader",
          selectedMode: "selection",
          recentMode: "recent",
          askTitle: "Ask",
          statusBad: "Bridge unavailable",
          copyPrompt: "Copy prompt",
          copiedToPaste: "Copied — paste it into the composer",
          sendToChat: "Send to chat",
          sending: "Sending…",
          sent: "Sent to the conversation; the answer appears here",
          sendFailed: "Send failed",
          recentAnswer: "Latest answer",
          copyNote: "Copy as note",
          noteCopied: "Copied note (Markdown)",
          copyAnswer: "Copy answer",
          answerCopied: "Copied answer",
          noAnswer: "No answer yet. Ask below and the final answer will appear here.",
          youAsked: "You asked",
          generating: "Generating…",
          workspace: "Workspace",
          selectWorkspace: "Select workspace",
          followPaper: "Follow current paper",
          openSession: "Open paper chat",
          newSession: "New paper chat",
          noWorkspace: "Pick a workspace in the header first",
          createFailed: "Could not create the chat",
          sessionCreated: "Created a chat for this paper",
          turnError: "Last question failed",
        };

    const CSS = `
.zl-root{display:flex;flex-direction:column;height:100%;min-height:0;overflow:auto;padding:18px 22px 36px;gap:14px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font:14px/1.6 inherit;box-sizing:border-box}
.zl-head{display:flex;align-items:center;gap:10px;justify-content:space-between;flex-wrap:wrap}
.zl-title{font-size:16px;font-weight:600;letter-spacing:.01em}
.zl-sub{color:var(--dsw-alias-label-secondary);font-size:12px}
.zl-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:14px 16px;display:flex;flex-direction:column;gap:8px}
.zl-card-title{font-size:15px;font-weight:600;word-break:break-word}
.zl-meta{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:var(--dsw-alias-label-secondary);align-items:center}
.zl-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.zl-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer;line-height:1.5}
.zl-btn:hover{border-color:var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}
.zl-btn.primary{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.zl-btn:disabled{opacity:.5;cursor:default}
.zl-tabs{display:flex;gap:4px;border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:0}
.zl-tab{appearance:none;background:transparent;border:none;border-bottom:2px solid transparent;color:var(--dsw-alias-label-secondary);padding:6px 10px;font:inherit;font-size:13px;cursor:pointer}
.zl-tab.active{color:var(--dsw-alias-label-primary);border-bottom-color:var(--dsw-alias-brand-primary)}
.zl-tab .count{color:var(--dsw-alias-label-secondary);margin-left:4px;font-size:11px}
.zl-row{display:flex;flex-direction:column;gap:4px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}
.zl-row-head{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.zl-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:var(--dsw-alias-state-idle-primary)}
.zl-quote{white-space:pre-wrap;word-break:break-word;font-size:13px}
.zl-answer{white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:1.7;max-height:420px;overflow:auto;padding:2px 0}
.zl-answer a{color:var(--dsw-alias-brand-primary);text-decoration:underline}
.zl-q{color:var(--dsw-alias-label-secondary);font-size:12px;white-space:pre-wrap;word-break:break-word}
.zl-select{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:2px 6px;font:inherit;font-size:12px;max-width:190px}
.zl-check{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer}
.zl-md-p{white-space:pre-wrap;word-break:break-word;margin:0 0 8px}
.zl-md-p:last-child{margin-bottom:0}
.zl-md-h{margin:12px 0 6px;font-weight:600;line-height:1.4}
.zl-md-h1{font-size:16px}
.zl-md-h2{font-size:15px}
.zl-md-h3{font-size:14px}
.zl-md-ul,.zl-md-ol{margin:0 0 8px 18px;padding:0}
.zl-md-ul li,.zl-md-ol li{margin:2px 0;white-space:pre-wrap;word-break:break-word}
.zl-md-quote{margin:6px 0;padding:6px 10px;border-left:2px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);white-space:pre-wrap;word-break:break-word}
.zl-md-pre{white-space:pre-wrap;word-break:break-word;background:var(--dsw-alias-bg-layer-2);border-radius:8px;padding:8px 10px;overflow:auto;font-size:12px;margin:0 0 8px}
.zl-answer strong{font-weight:600}
.zl-answer em{font-style:italic}
.zl-answer code{background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:0 4px;font-size:12px}
.zl-comment{color:var(--dsw-alias-label-secondary);font-size:12px;border-left:2px solid var(--dsw-alias-border-l2);padding-left:8px;white-space:pre-wrap}
.zl-row .zl-actions{margin-top:2px}
.zl-empty{color:var(--dsw-alias-label-secondary);font-size:13px;padding:8px 2px}
.zl-notice{font-size:12px;color:var(--dsw-alias-state-success-primary)}
.zl-notice.warn{color:var(--dsw-alias-state-warn-primary)}
.zl-status{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.zl-status .dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.zl-status.bad .dot{background:var(--dsw-alias-state-error-primary)}
.zl-ask{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.zl-textarea{width:100%;box-sizing:border-box;resize:vertical;min-height:64px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);padding:8px 10px;font:inherit;font-size:13px;outline:none}
.zl-textarea:focus{border-color:var(--dsw-alias-brand-primary)}
.zl-chip{appearance:none;border:1px dashed var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:3px 10px;font:inherit;font-size:12px;cursor:pointer}
.zl-chip:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.zl-hint{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}
`;

    function inlineMd(text, keyPrefix) {
      const nodes = [];
      const source = String(text ?? "");
      const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\*[^*\n]+\*)/g;
      let last = 0;
      let index = 0;
      let match;
      while ((match = pattern.exec(source))) {
        if (match.index > last) nodes.push(source.slice(last, match.index));
        const token = match[0];
        if (token.startsWith("`")) {
          nodes.push(h("code", { key: `${keyPrefix}-c${index++}` }, token.slice(1, -1)));
        } else if (token.startsWith("**")) {
          nodes.push(h("strong", { key: `${keyPrefix}-b${index++}` }, token.slice(2, -2)));
        } else if (token.startsWith("[")) {
          const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
          if (link) {
            nodes.push(
              h("a", { key: `${keyPrefix}-a${index++}`, href: link[2], target: "_blank", rel: "noreferrer" }, link[1])
            );
          } else {
            nodes.push(token);
          }
        } else if (token.startsWith("*")) {
          nodes.push(h("em", { key: `${keyPrefix}-i${index++}` }, token.slice(1, -1)));
        } else {
          nodes.push(token);
        }
        last = match.index + token.length;
      }
      if (last < source.length) nodes.push(source.slice(last));
      return nodes;
    }

    function renderMarkdown(text) {
      const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
      const blocks = [];
      let i = 0;
      let key = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (/^\s*$/.test(line)) {
          i += 1;
          continue;
        }
        if (/^\s*```/.test(line)) {
          i += 1;
          const code = [];
          while (i < lines.length && !/^\s*```/.test(lines[i])) {
            code.push(lines[i]);
            i += 1;
          }
          i += 1;
          blocks.push(h("pre", { key: `pre-${key++}`, className: "zl-md-pre" }, h("code", null, code.join("\n"))));
          continue;
        }
        const heading = line.match(/^(#{1,6})\s+(.*)$/);
        if (heading) {
          const level = heading[1].length;
          blocks.push(
            h(
              `h${Math.min(level + 1, 6)}`,
              { key: `h-${key++}`, className: `zl-md-h zl-md-h${level}` },
              inlineMd(heading[2], `h${key}`)
            )
          );
          i += 1;
          continue;
        }
        if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
          blocks.push(h("hr", { key: `hr-${key++}` }));
          i += 1;
          continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
          const items = [];
          while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
            i += 1;
          }
          blocks.push(
            h(
              "ul",
              { key: `ul-${key++}`, className: "zl-md-ul" },
              items.map((item, n) => h("li", { key: `li-${n}` }, inlineMd(item, `ul${key}${n}`)))
            )
          );
          continue;
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          const items = [];
          while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
            items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
            i += 1;
          }
          blocks.push(
            h(
              "ol",
              { key: `ol-${key++}`, className: "zl-md-ol" },
              items.map((item, n) => h("li", { key: `li-${n}` }, inlineMd(item, `ol${key}${n}`)))
            )
          );
          continue;
        }
        if (/^\s*>\s?/.test(line)) {
          const parts = [];
          while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
            parts.push(lines[i].replace(/^\s*>\s?/, ""));
            i += 1;
          }
          blocks.push(
            h("blockquote", { key: `bq-${key++}`, className: "zl-md-quote" }, inlineMd(parts.join("\n"), `bq${key}`))
          );
          continue;
        }
        const paragraph = [];
        while (
          i < lines.length &&
          !/^\s*$/.test(lines[i]) &&
          !/^\s*(#{1,6}\s|```|[-*+]\s|\d+[.)]\s|>\s?|---)/.test(lines[i])
        ) {
          paragraph.push(lines[i]);
          i += 1;
        }
        if (paragraph.length) {
          blocks.push(h("p", { key: `p-${key++}`, className: "zl-md-p" }, inlineMd(paragraph.join("\n"), `p${key}`)));
        } else {
          i += 1;
        }
      }
      return blocks;
    }

    function renderInline(text) {
      const nodes = [];
      const source = String(text || "");
      const pattern = /\[([^\]]+)\]\(((?:zotero|https?):\/\/[^)\s]+)\)/g;
      let last = 0;
      let key = 0;
      let match;
      while ((match = pattern.exec(source))) {
        if (match.index > last) nodes.push(source.slice(last, match.index));
        nodes.push(
          h(
            "a",
            { key: `link-${key++}`, href: match[2], target: "_blank", rel: "noreferrer" },
            match[1]
          )
        );
        last = match.index + match[0].length;
      }
      if (last < source.length) nodes.push(source.slice(last));
      return nodes;
    }

    function pageLabelOf(annotation) {
      if (!annotation) return "";
      if (annotation.pageLabel) return `p.${annotation.pageLabel}`;
      if (Number.isInteger(annotation.pageIndex)) return `PDF p.${annotation.pageIndex + 1}`;
      return "";
    }

    function truncate(value, max) {
      const text = String(value || "").replace(/\s+/g, " ").trim();
      return text.length <= max ? text : `${text.slice(0, max)}…`;
    }

    function askPrompt(item, page, question) {
      const title = item && item.title ? item.title : isZh ? "当前文献" : "the current paper";
      const meta = [item && item.creatorsLabel, item && item.year].filter(Boolean).join(" ");
      const label = page && (page.label ? `p.${page.label}` : Number.isInteger(page.index) ? `PDF p.${page.index + 1}` : "");
      const q = String(question || "").trim() || (isZh ? "请介绍这篇文献的研究问题、方法、主要结论与局限。" : "Summarize this paper's question, method, findings and limitations.");
      return `关于 Zotero 当前文献《${title}》${meta ? `（${meta}）` : ""}${label ? `，${label}` : ""}：\n${q}\n（请先用 zotero_current / zotero_pages 定位原文；回答给出印刷页码和 zotero:// 链接，引用要逐字。）`;
    }

    function LiteratureView(props) {
      const inputActions = props && props.inputActions;
      const composerAvailable = Boolean(
        inputActions &&
          typeof inputActions.captureInsertion === "function" &&
          typeof inputActions.insertText === "function"
      );
      const [state, setState] = React.useState({ loading: true, status: null, current: null });
      const [tab, setTab] = React.useState("annotations");
      const [question, setQuestion] = React.useState("");
      const [notice, setNotice] = React.useState(null);
      const [sending, setSending] = React.useState(false);
      const layout = props && props.layout;
      const getService = (props && props.getService) || (() => null);
      const [workspaces, setWorkspaces] = React.useState([]);
      const [workspaceId, setWorkspaceId] = React.useState(() => readStore(STORE.workspace, null));
      const [sessionMapVersion, setSessionMapVersion] = React.useState(0);
      const transcriptSessionRef = React.useRef(null);
      const ensureRef = React.useRef({ key: null, busy: false });
      if (props && props.sessionId) activeSessionId = String(props.sessionId);

      const load = React.useCallback(async () => {
        let status = null;
        let current = null;
        let statusError = null;
        try {
          const response = await fetch(`${API}/status`, { cache: "no-store" });
          status = await response.json();
        } catch (error) {
          statusError = String((error && error.message) || error);
        }
        try {
          const response = await fetch(`${API}/current`, { cache: "no-store" });
          current = await response.json();
        } catch (error) {
          current = { ok: false, code: "ZOTERO_DOWN", message: String((error && error.message) || error) };
        }
        let transcript = null;
        try {
          const sessionForTranscript = transcriptSessionRef.current || activeSessionId;
          const query = sessionForTranscript ? `&sessionId=${encodeURIComponent(sessionForTranscript)}` : "";
          const response = await fetch(`${API}/transcript?limit=8${query}`, { cache: "no-store" });
          transcript = await response.json();
        } catch (error) {
          transcript = { ok: false, code: "TRANSCRIPT_FAILED", message: String((error && error.message) || error) };
        }
        try {
          const sessionForWorkspace = transcriptSessionRef.current || activeSessionId;
          const query = sessionForWorkspace ? `?sessionId=${encodeURIComponent(sessionForWorkspace)}` : "";
          const response = await fetch(`${API}/workspaces${query}`, { cache: "no-store" });
          const workspaceData = await response.json();
          if (workspaceData && workspaceData.ok && workspaceData.data) {
            const list = Array.isArray(workspaceData.data.workspaces) ? workspaceData.data.workspaces : [];
            setWorkspaces(list);
            setWorkspaceId((previous) => previous || workspaceData.data.currentWorkspaceId || (list[0] && list[0].id) || null);
          }
        } catch {
          /* workspace list is optional */
        }
        setState({ loading: false, status, current, statusError, transcript });
      }, []);

      React.useEffect(() => {
        load();
        const timer = window.setInterval(() => {
          if (document.visibilityState !== "hidden") load();
        }, POLL_MS);
        return () => window.clearInterval(timer);
      }, [load]);

      const showNotice = (text, warn) => {
        setNotice({ text, warn: Boolean(warn) });
        window.setTimeout(() => setNotice(null), 4000);
      };

      const copyText = async (text) => {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          return false;
        }
      };

      const insertIntoComposer = async (text) => {
        if (!composerAvailable) {
          const ok = await copyText(text);
          showNotice(ok ? TEXT.copiedToPaste : TEXT.copyFailed, !ok);
          return;
        }
        try {
          const span = inputActions.captureInsertion();
          const applied = inputActions.insertText(text, span);
          if (applied === false) throw new Error("insert rejected");
          showNotice(TEXT.inserted);
          return;
        } catch {
          const ok = await copyText(text);
          showNotice(ok ? TEXT.copied : TEXT.copyFailed, !ok);
        }
      };

      const openTarget = async (target) => {
        try {
          const response = await fetch(`${API}/open`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(target),
          });
          const payload = await response.json();
          if (!payload.ok) showNotice(`${TEXT.statusBad}: ${payload.message || payload.code}`, true);
        } catch (error) {
          showNotice(String((error && error.message) || error), true);
        }
      };

      const status = state.status;
      const bridgeOk = Boolean(status && status.ok);
      const current = state.current && state.current.ok ? state.current.data : null;
      const item = current && current.item;
      const page = current && current.page;

      const attachSession = (sid) => {
        if (!sid || !workspaceId) return;
        fetch(`${API}/session/attach`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: String(sid), workspaceId }),
        }).catch(() => {
          /* visibility best effort */
        });
      };

      const openSession = (sid) => {
        if (!sid) return false;
        attachSession(sid);
        const sessions = getService("sessions");
        if (sessions && typeof sessions.open === "function") {
          try {
            sessions.open(String(sid));
            return true;
          } catch {
            /* fall through */
          }
        }
        const workspace = getService("uiWorkspace");
        if (workspace && typeof workspace.openSession === "function") {
          try {
            workspace.openSession(String(sid));
            return true;
          } catch {
            /* ignore */
          }
        }
        return false;
      };

      const rememberSession = (key, sid) => {
        const map = readSessionMap();
        map[String(key)] = String(sid);
        writeStore(STORE.sessions, map);
        setSessionMapVersion((version) => version + 1);
      };

      const forgetSession = (key) => {
        const map = readSessionMap();
        if (!Object.prototype.hasOwnProperty.call(map, String(key))) return;
        delete map[String(key)];
        writeStore(STORE.sessions, map);
        setSessionMapVersion((version) => version + 1);
      };

      const validateSession = async (sid) => {
        try {
          const response = await fetch(`${API}/session/validate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId: String(sid), workspaceId }),
          });
          const payload = await response.json();
          return Boolean(payload && payload.ok && payload.data && payload.data.exists);
        } catch {
          // Network hiccup: keep the mapping instead of spawning a duplicate.
          return true;
        }
      };

      const createSessionForItem = async (key, options) => {
        const silent = Boolean(options && options.silent);
        if (!workspaceId) {
          if (!silent) showNotice(TEXT.noWorkspace, true);
          return null;
        }
        const workspace = workspaces.find((entry) => String(entry.id) === String(workspaceId));
        try {
          const response = await fetch(`${API}/session/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId, path: workspace && workspace.path }),
          });
          const payload = await response.json();
          if (!payload.ok || !payload.data || !payload.data.sessionId) {
            showNotice(`${TEXT.createFailed}${payload && payload.message ? `：${payload.message}` : ""}`, true);
            return null;
          }
          const sessionId = String(payload.data.sessionId);
          rememberSession(key, sessionId);
          if (!silent) showNotice(TEXT.sessionCreated);
          return sessionId;
        } catch (error) {
          showNotice(`${TEXT.createFailed}：${(error && error.message) || error}`, true);
          return null;
        }
      };

      const sendQuestion = async (text) => {
        let target = null;
        if (item && item.key) {
          const map = readSessionMap();
          if (map[item.key] && (await validateSession(map[item.key]))) {
            target = String(map[item.key]);
          } else {
            forgetSession(item.key);
            target = await createSessionForItem(item.key);
            if (!target) return;
          }
        } else {
          target = activeSessionId;
        }
        if (!target) {
          showNotice(TEXT.noWorkspace, true);
          return;
        }
        activeSessionId = target;
        attachSession(target);
        setSending(true);
        try {
          const response = await fetch(`${API}/ask`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: target,
              question: text,
              context: {
                itemKey: item && item.key,
                title: item && item.title,
                pageLabel: page && page.label,
                pageIndex: page && page.index,
              },
            }),
          });
          const payload = await response.json();
          if (!payload.ok) {
            showNotice(`${TEXT.sendFailed}：${payload.message || payload.code}`, true);
            return;
          }
          showNotice(TEXT.sent);
          window.setTimeout(() => load(), 2500);
        } catch (error) {
          showNotice(`${TEXT.sendFailed}：${String((error && error.message) || error)}`, true);
        } finally {
          setSending(false);
        }
      };

      const deliverAsk = (rawText) => {
        const text =
          String(rawText || "").trim() ||
          (isZh ? "请介绍这篇文献的研究问题、方法、主要结论与局限。" : "Summarize this paper's question, method, findings and limitations.");
        if (composerAvailable) return insertIntoComposer(askPrompt(item, page, text));
        return sendQuestion(text);
      };

      const transcriptMessages =
        (state.transcript && state.transcript.ok && state.transcript.data && state.transcript.data.messages) || [];
      const transcriptRunning = Boolean(
        state.transcript && state.transcript.ok && state.transcript.data && state.transcript.data.running
      );
      const transcriptError =
        state.transcript && state.transcript.ok && state.transcript.data && state.transcript.data.error;
      let lastAnswerIndex = -1;
      for (let i = transcriptMessages.length - 1; i >= 0; i -= 1) {
        if (transcriptMessages[i].role === "assistant") {
          lastAnswerIndex = i;
          break;
        }
      }
      const lastAnswer = lastAnswerIndex >= 0 ? transcriptMessages[lastAnswerIndex] : null;
      let lastQuestion = null;
      for (let i = lastAnswerIndex - 1; i >= 0; i -= 1) {
        if (transcriptMessages[i].role === "user") {
          lastQuestion = transcriptMessages[i];
          break;
        }
      }
      const cleanQuestion = (text) => String(text || "").replace(/（请先用[\s\S]*?）\s*$/, "").trim();
      const buildNote = () => {
        const q = cleanQuestion(lastQuestion && lastQuestion.text);
        const a = String((lastAnswer && lastAnswer.text) || "").trim();
        const title = (item && item.title) || "Zotero 文献";
        const meta = [item && item.creatorsLabel, item && item.year].filter(Boolean).join(" ");
        const pageLabel = page && page.label ? `p.${page.label}` : "";
        const lines = [`# 问答：${title}`];
        if (meta || pageLabel) lines.push(`> ${[meta, pageLabel].filter(Boolean).join("，")}`);
        lines.push("", "## 问", q, "", "## 答", a, "", "---");
        lines.push(`来源：Zotero《${title}》${item && item.link ? ` ${item.link}` : ""}`);
        return lines.join("\n");
      };
      const copyNote = async () => {
        const ok = await copyText(buildNote());
        showNotice(ok ? TEXT.noteCopied : TEXT.copyFailed, !ok);
      };
      const copyAnswer = async () => {
        const ok = await copyText(String((lastAnswer && lastAnswer.text) || ""));
        showNotice(ok ? TEXT.answerCopied : TEXT.copyFailed, !ok);
      };

      const itemKey = item && item.key;
      const boundSession = itemKey ? readSessionMap()[itemKey] : null;
      transcriptSessionRef.current = boundSession || activeSessionId;

      // If the mapped session was deleted (or no longer belongs to this
      // workspace), drop the stale mapping and create a fresh one for this paper.
      // Creation is host-side, so the panel does not navigate away.
      React.useEffect(() => {
        if (!itemKey || !workspaceId) return;
        const sym = `${itemKey}:${workspaceId}`;
        if (ensureRef.current.key === sym || ensureRef.current.busy) return;
        ensureRef.current.busy = true;
        (async () => {
          let sid = readSessionMap()[itemKey];
          if (sid) {
            const ok = await validateSession(sid);
            if (!ok) {
              forgetSession(itemKey);
              sid = null;
            }
          }
          if (!sid) sid = await createSessionForItem(itemKey, { silent: true });
          if (sid) ensureRef.current.key = sym;
        })().finally(() => {
          ensureRef.current.busy = false;
        });
      }, [itemKey, workspaceId]);
      const modeLabel = current
        ? current.mode === "reader"
          ? TEXT.readMode
          : current.mode === "selected"
            ? TEXT.selectedMode
            : TEXT.recentMode
        : "";
      const annotations = (current && current.annotations) || [];
      const notes = (current && current.notes) || [];
      const recent = (current && current.recent) || [];

      const tabs = [
        { id: "annotations", label: TEXT.annotations, count: annotations.length },
        { id: "notes", label: TEXT.notes, count: notes.length },
        { id: "recent", label: TEXT.recent, count: recent.length },
      ];

      const renderRow = (row, kind) => {
        const label = pageLabelOf(row);
        const color = row.color || "var(--dsw-alias-state-idle-primary)";
        const quote = kind === "annotation" ? row.text || row.comment || "" : row.title || "";
        const comment = kind === "annotation" ? row.comment : row.text;
        return h(
          "div",
          { className: "zl-row", key: `${kind}-${row.key || row.attachmentKey || row.title}` },
          h(
            "div",
            { className: "zl-row-head" },
            h("span", { className: "zl-dot", style: { background: color } }),
            h("span", null, kind === "annotation" ? label || TEXT.annotations : label || ""),
            h("span", null, kind === "annotation" ? row.type || "highlight" : "")
          ),
          h("div", { className: "zl-quote" }, truncate(quote, 360)),
          comment
            ? h("div", { className: "zl-comment" }, truncate(comment, 260))
            : null,
          h(
            "div",
            { className: "zl-actions" },
            h(
              "button",
              {
                className: "zl-btn",
                type: "button",
                onClick: () =>
                  openTarget(
                    kind === "annotation"
                      ? { attachmentKey: row.attachmentKey, page: (row.pageIndex || 0) + 1, annotationKey: row.key }
                      : { itemKey: row.itemKey || row.key }
                  ),
              },
              TEXT.open
            ),
            h(
              "button",
              {
                className: "zl-btn",
                type: "button",
                onClick: () =>
                  insertIntoComposer(
                    kind === "annotation"
                      ? `请结合下面这段原文回答（《${item && item.title}》${label}）：\n> ${row.text}\n\n我的问题：`
                      : `请阅读我的 Zotero 笔记《${row.title || "无标题笔记"}》并提炼要点，需要时引用对应原文：\n> ${truncate(row.text, 400)}\n\n`
                  ),
              },
              kind === "annotation" ? TEXT.quote : TEXT.askAbout
            )
          )
        );
      };

      const renderBody = () => {
        if (state.loading) return h("div", { className: "zl-empty" }, TEXT.loading);
        if (!bridgeOk) {
          return h(
            "div",
            { className: "zl-card" },
            h("div", { className: "zl-card-title" }, TEXT.statusBad),
            h("div", { className: "zl-hint" }, (status && (status.message || status.code)) || state.statusError || ""),
            h("div", { className: "zl-hint" }, TEXT.installHint)
          );
        }
        if (!item) {
          return h(
            "div",
            { className: "zl-card" },
            h("div", { className: "zl-card-title" }, TEXT.noItem),
            h("div", { className: "zl-hint" }, TEXT.noItemHint)
          );
        }
        if (tab === "notes") {
          if (!notes.length) return h("div", { className: "zl-empty" }, TEXT.noNotes);
          return notes.slice(0, 40).map((note) => renderRow(note, "note"));
        }
        if (tab === "recent") {
          if (!recent.length) return h("div", { className: "zl-empty" }, TEXT.emptyRecent);
          return recent.slice(0, 20).map((row) =>
            h(
              "div",
              { className: "zl-row", key: `recent-${row.attachmentKey || row.itemKey}` },
              h(
                "div",
                { className: "zl-row-head" },
                h("span", { className: "zl-dot", style: { background: "var(--dsw-alias-brand-primary)" } }),
                h("span", null, row.pageLabel ? `p.${row.pageLabel}` : ""),
                h("span", null, row.creatorsLabel || "")
              ),
              h("div", { className: "zl-quote" }, row.title || "(untitled)"),
              h(
                "div",
                { className: "zl-actions" },
                h(
                  "button",
                  {
                    className: "zl-btn",
                    type: "button",
                    onClick: () => openTarget({ attachmentKey: row.attachmentKey, page: (row.pageIndex || 0) + 1 }),
                  },
                  TEXT.open
                ),
                h(
                  "button",
                  {
                    className: "zl-btn",
                    type: "button",
                    onClick: () =>
                      insertIntoComposer(
                        `请基于 Zotero 条目《${row.title}》${row.year ? `（${row.year}）` : ""}（key ${row.itemKey}）回答，引用时给出页码与 zotero:// 链接：\n`
                      ),
                  },
                  TEXT.askAbout
                )
              )
            )
          );
        }
        if (!annotations.length) return h("div", { className: "zl-empty" }, TEXT.noAnnotations);
        return annotations.slice(0, 40).map((annotation) => renderRow(annotation, "annotation"));
      };

      return h(
        "div",
        { className: "zl-root" },
        h("style", null, CSS),
        h(
          "div",
          { className: "zl-head" },
          h("div", { className: "zl-title" }, TEXT.tab),
          h(
            "div",
            { className: "zl-actions" },
            h(
              "div",
              { className: `zl-status${bridgeOk ? "" : " bad"}` },
              h("span", { className: "dot" }),
              h(
                "span",
                null,
                bridgeOk
                  ? `${TEXT.connected}${status && status.info && status.info.version ? ` v${status.info.version}` : ""}`
                  : TEXT.disconnected
              )
            ),
            h(
              "label",
              { className: "zl-meta" },
              h("span", null, TEXT.workspace),
              h(
                "select",
                {
                  className: "zl-select",
                  value: workspaceId || "",
                  onChange: (event) => {
                    const value = event.target.value || null;
                    setWorkspaceId(value);
                    writeStore(STORE.workspace, value);
                  },
                },
                h("option", { value: "" }, TEXT.selectWorkspace),
                workspaces.map((workspace) =>
                  h(
                    "option",
                    { key: workspace.id, value: workspace.id },
                    workspace.title || workspace.path || workspace.id
                  )
                )
              )
            ),
            h("button", { className: "zl-btn", type: "button", onClick: load }, TEXT.refresh)
          )
        ),
        item
          ? h(
              "div",
              { className: "zl-card" },
              h("div", { className: "zl-card-title" }, item.title || "(untitled)"),
              h(
                "div",
                { className: "zl-meta" },
                h("span", null, item.creatorsLabel || ""),
                h("span", null, item.year || ""),
                h("span", null, item.itemType || ""),
                h("span", null, modeLabel),
                h(
                  "span",
                  null,
                  page && (page.label || Number.isInteger(page.index))
                    ? `${page.label ? `p.${page.label}` : `PDF p.${page.index + 1}`}`
                    : ""
                ),
                h("span", null, `${annotations.length} ${TEXT.annotations} · ${notes.length} ${TEXT.notes}`)
              ),
              h(
                "div",
                { className: "zl-actions" },
                h(
                  "button",
                  {
                    className: "zl-btn primary",
                    type: "button",
                    onClick: () =>
                      openTarget({
                        attachmentKey: current && current.attachments && current.attachments[0] ? current.attachments[0].key : undefined,
                        itemKey: item.key,
                        page: page && Number.isInteger(page.index) ? page.index + 1 : undefined,
                      }),
                  },
                  TEXT.open
                ),
                h(
                  "button",
                  {
                    className: "zl-btn",
                    type: "button",
                    onClick: () => deliverAsk(question),
                  },
                  TEXT.askThis
                ),
                h(
                  "button",
                  {
                    className: "zl-btn",
                    type: "button",
                    onClick: async () => {
                      if (boundSession) {
                        openSession(boundSession);
                        return;
                      }
                      const sid = await createSessionForItem(itemKey);
                      if (sid) openSession(sid);
                    },
                  },
                  boundSession ? TEXT.openSession : TEXT.newSession
                )
              )
            )
          : renderBody(),
        h(
          "div",
          { className: "zl-card" },
          h(
            "div",
            { className: "zl-actions", style: { justifyContent: "space-between" } },
            h("div", { className: "zl-card-title" }, TEXT.recentAnswer),
            transcriptRunning ? h("span", { className: "zl-notice" }, TEXT.generating) : null,
            lastAnswer
              ? h(
                  "div",
                  { className: "zl-actions" },
                  h("button", { className: "zl-btn", type: "button", onClick: copyNote }, TEXT.copyNote),
                  h("button", { className: "zl-btn", type: "button", onClick: copyAnswer }, TEXT.copyAnswer)
                )
              : null
          ),
          lastQuestion
            ? h("div", { className: "zl-q" }, `${TEXT.youAsked}：${truncate(cleanQuestion(lastQuestion.text), 140)}`)
            : null,
          lastAnswer
            ? h("div", { className: "zl-answer" }, renderMarkdown(lastAnswer.text))
            : transcriptError
              ? h("div", { className: "zl-empty" }, `${TEXT.turnError}：${transcriptError}`)
              : h("div", { className: "zl-empty" }, TEXT.noAnswer),
          transcriptError && lastAnswer
            ? h("div", { className: "zl-notice warn" }, `${TEXT.turnError}：${transcriptError}`)
            : null
        ),
        item
          ? h(
              "div",
              { className: "zl-tabs" },
              tabs.map((entry) =>
                h(
                  "button",
                  {
                    key: entry.id,
                    type: "button",
                    className: `zl-tab${tab === entry.id ? " active" : ""}`,
                    onClick: () => setTab(entry.id),
                  },
                  entry.label,
                  h("span", { className: "count" }, entry.count ? String(entry.count) : "")
                )
              )
            )
          : null,
        item ? h("div", { className: "zl-list" }, renderBody()) : null,
        h(
          "div",
          { className: "zl-ask" },
          h("div", { className: "zl-card-title" }, TEXT.askTitle),
          h("textarea", {
            className: "zl-textarea",
            rows: 3,
            placeholder: TEXT.askPlaceholder,
            value: question,
            onChange: (event) => setQuestion(event.target.value),
          }),
          h(
            "div",
            { className: "zl-actions" },
            [
              [TEXT.presetContribution, isZh ? "本文的核心贡献是什么？请给出原文依据。" : "What is this paper's core contribution? Cite the text."],
              [TEXT.presetMethod, isZh ? "本文用了什么方法与识别策略？关键假设是什么？" : "What method and identification strategy does it use? Key assumptions?"],
              [TEXT.presetFindings, isZh ? "本文的主要结论有哪些？请逐条给出页码与原文。" : "What are the main findings? Give page numbers and quotes."],
              [TEXT.presetLimits, isZh ? "本文的局限与可能的争议是什么？" : "What are the limitations and likely criticisms?"],
            ].map(([label, text]) =>
              h(
                "button",
                { key: label, className: "zl-chip", type: "button", onClick: () => setQuestion(text) },
                label
              )
            ),
            h(
              "button",
              {
                className: "zl-chip",
                type: "button",
                onClick: () =>
                  deliverAsk(
                    item && item.key
                      ? `请用 zotero_item 读取《${item.title}》（key ${item.key}）的全部摘录与笔记，按主题整理成结构化笔记（要点 + 逐字原文 + zotero:// 链接），先给我 preview，不要直接写入。`
                      : `请把 Zotero 当前文献的摘录与笔记按主题整理成结构化笔记，先给我 preview。`
                  ),
              },
              TEXT.presetOrganize
            )
          ),
          h(
            "div",
            { className: "zl-actions" },
            h(
              "button",
              {
                className: "zl-btn primary",
                type: "button",
                disabled: sending,
                onClick: () => deliverAsk(question),
              },
              composerAvailable ? TEXT.fillComposer : sending ? TEXT.sending : TEXT.sendToChat
            ),
            notice ? h("span", { className: `zl-notice${notice.warn ? " warn" : ""}` }, notice.text) : null
          )
        )
      );
    }

    function ZoteroIcon(props) {
      const size = (props && props.size) || 20;
      const color = props && props.active ? "var(--dsw-alias-brand-primary)" : "currentColor";
      return h(
        "svg",
        { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true, style: { display: "block" } },
        h("path", {
          d: "M5 3.5h9.5L19 8v12.5H5z",
          fill: "none",
          stroke: color,
          strokeWidth: 1.5,
          strokeLinejoin: "round",
        }),
        h("path", {
          d: "M14.5 3.5V8H19",
          fill: "none",
          stroke: color,
          strokeWidth: 1.5,
          strokeLinejoin: "round",
        }),
        h("path", {
          d: "M8 12.5h7M8 16h5",
          fill: "none",
          stroke: color,
          strokeWidth: 1.5,
          strokeLinecap: "round",
        })
      );
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        let layout = null;
        try {
          layout = ctx.get("layout");
        } catch {
          layout = null;
        }
        const getService = (name) => {
          try {
            return ctx.get(name);
          } catch {
            return null;
          }
        };
        const View = (props) => h(LiteratureView, Object.assign({}, props, { layout, getService }));
        ctx.slots.inject("conversation.view", () =>
          ctx.slots.register(
            {
              name: "conversation.view",
              id: "zotero-literature",
              order: 15,
              label: () => TEXT.tab,
            },
            View
          )
        );
        ctx.slots.inject("sidebar.panellist", () =>
          ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: "zotero-literature",
              order: 20,
              label: () => TEXT.tab,
            },
            ZoteroIcon
          )
        );
        ctx.slots.inject("main", () =>
          ctx.slots.register({ name: "main", key: "zotero-literature" }, View)
        );
        ctx.slots.inject("conversation.composer.dock", () =>
          ctx.slots.register(
            { name: "conversation.composer.dock", id: "zotero-session-probe", order: 90 },
            SessionProbe
          )
        );
      },
    };
  },
});
