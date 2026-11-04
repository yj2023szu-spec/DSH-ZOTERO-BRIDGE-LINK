/**
 * A stand-in for the zotero-link addon, used by scripts/smoke.mjs and for
 * developing the Harness plugin while Zotero is not restarted yet.
 *
 * Usage: node scripts/mock-bridge.mjs [port]
 */
import { createServer } from "node:http";

export const TOKEN = "mock-token-0123456789abcdef";

const ITEM = {
  key: "ABCD1234",
  libraryID: 1,
  itemType: "journalArticle",
  title: "Placebo Tests and Identification: A Practical Guide",
  date: "2021-05-01 2021-05-01",
  year: "2021",
  creators: [
    { firstName: "Jane", lastName: "Smith", creatorType: "author" },
    { firstName: "Wei", lastName: "Chen", creatorType: "author" },
  ],
  creatorsLabel: "Smith 等",
  tags: ["identification", "placebo"],
  collections: [{ key: "COLL0001", name: "方法论文献" }],
  publicationTitle: "Journal of Applied Econometrics",
  DOI: "10.1000/mock.2021.001",
  abstractNote: "We discuss placebo tests as a diagnostic for identification strategies.",
  link: "zotero://select/library/items/ABCD1234",
};

const ATTACHMENT = {
  key: "PDF00001",
  libraryID: 1,
  filename: "smith-2021-placebo.pdf",
  contentType: "application/pdf",
  isPDF: true,
  lastPageIndex: 3,
  parentKey: "ABCD1234",
  link: "zotero://open-pdf/library/items/PDF00001",
};

const PAGES = [
  "1\nIntroduction\nPlacebo tests are a widely used diagnostic for the credibility of an identification strategy. The core idea is to apply the same research design to a setting where the treatment should not matter.\n",
  "2\nA placebo test that rejects the null suggests that the design is picking up something other than the treatment effect. This is not a formal proof of bias, but it is a useful warning sign.\n",
  "3\nWe recommend reporting the placebo estimate alongside the main estimate, with the same specification and the same sample restrictions. Transparency matters more than the number of tests.\n",
  "4\nLimitations\nA passing placebo test does not establish identification. Researchers should also argue for exclusion restrictions and report sensitivity to bandwidth and controls.\n",
];

const ANNOTATIONS = [
  {
    key: "ANN00001",
    type: "highlight",
    text: "Placebo tests are a widely used diagnostic for the credibility of an identification strategy.",
    comment: "核心定义，写进综述时直接用。",
    color: "#ffd400",
    pageLabel: "1",
    pageIndex: 0,
    sortIndex: "00000|000010|00010",
    attachmentKey: "PDF00001",
    libraryID: 1,
    link: "zotero://open-pdf/library/items/PDF00001?page=1&annotation=ANN00001",
    selectLink: "zotero://select/library/items/ANN00001",
  },
  {
    key: "ANN00002",
    type: "highlight",
    text: "A placebo test that rejects the null suggests that the design is picking up something other than the treatment effect.",
    comment: "",
    color: "#5fb236",
    pageLabel: "2",
    pageIndex: 1,
    sortIndex: "00001|000020|00020",
    attachmentKey: "PDF00001",
    libraryID: 1,
    link: "zotero://open-pdf/library/items/PDF00001?page=2&annotation=ANN00002",
    selectLink: "zotero://select/library/items/ANN00002",
  },
];

const NOTES = [
  {
    key: "NOTE0001",
    libraryID: 1,
    parentKey: "ABCD1234",
    title: "阅读笔记：安慰剂检验与识别",
    text: "为什么安慰剂检验有说服力？关键在于：设计在“不该有效”的地方应当无效。",
    html: "<div class=\"zotero-note znv1\"><p>为什么安慰剂检验有说服力？</p></div>",
    updated: "2026-10-30T10:00:00.000Z",
    link: "zotero://select/library/items/NOTE0001",
  },
];

const COLLECTIONS = [
  { key: "COLL0001", name: "方法论文献", libraryID: 1, parentKey: null, groupID: null },
  { key: "COLL0002", name: "实证研究", libraryID: 1, parentKey: null, groupID: null },
];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function ok(res, data) {
  json(res, 200, { ok: true, data, meta: { api: 1, version: "0.1.0-mock", fetchedAt: new Date().toISOString() } });
}

function fail(res, status, code, message) {
  json(res, status, { ok: false, code, message });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function createMockBridge() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const path = url.pathname;
    const write = req.method === "POST";
    if (write && req.headers["x-zotero-link-token"] !== TOKEN) {
      return fail(res, 403, "TOKEN_INVALID", "mock: missing token");
    }
    try {
      if (req.method === "GET" && path === "/zoterolink/health") {
        return ok(res, { zoteroVersion: "10.0.7", port: url.port || 0, writable: true, tokenPresent: true, uptimeSeconds: 42 });
      }
      if (req.method === "GET" && path === "/zoterolink/current") {
        return ok(res, {
          mode: "reader",
          page: { index: 1, label: "2", source: "reader" },
          item: ITEM,
          attachments: [ATTACHMENT],
          annotations: ANNOTATIONS,
          pageAnnotations: [ANNOTATIONS[1]],
          notes: NOTES,
          annotationCount: ANNOTATIONS.length,
          noteCount: NOTES.length,
          recent: [
            {
              attachmentKey: "PDF00001",
              libraryID: 1,
              itemKey: "ABCD1234",
              title: ITEM.title,
              year: "2021",
              creatorsLabel: "Smith 等",
              pageIndex: 1,
              pageLabel: "2",
              lastRead: 1793791992,
              link: "zotero://open-pdf/library/items/PDF00001?page=2",
              select: ITEM.link,
            },
          ],
        });
      }
      if (req.method === "GET" && path === "/zoterolink/item") {
        const key = url.searchParams.get("key");
        if (key !== ITEM.key && key !== ATTACHMENT.key) return fail(res, 404, "NOT_FOUND", "mock: no such item");
        const include = String(url.searchParams.get("include") || "attachments,annotations,notes").split(",");
        return ok(res, {
          item: ITEM,
          links: { select: ITEM.link },
          attachments: include.includes("attachments") ? [ATTACHMENT] : undefined,
          annotations: include.includes("annotations") ? ANNOTATIONS : undefined,
          notes: include.includes("notes") ? NOTES : undefined,
        });
      }
      if (req.method === "GET" && path === "/zoterolink/fulltext") {
        const query = url.searchParams.get("query");
        if (query) {
          const matches = [];
          PAGES.forEach((text, index) => {
            if (text.toLowerCase().includes(query.toLowerCase())) {
              matches.push({
                pageIndex: index,
                label: String(index + 1),
                context: text.slice(0, 200),
                link: `zotero://open-pdf/library/items/PDF00001?page=${index + 1}`,
              });
            }
          });
          return ok(res, { query, matches, totalPages: PAGES.length, pageCount: PAGES.length });
        }
        const start = Number(url.searchParams.get("pageStart") || 0);
        const maxPages = Number(url.searchParams.get("maxPages") || 8);
        const endParam = url.searchParams.get("pageEnd");
        const end = endParam !== null ? Math.min(PAGES.length - 1, Number(endParam)) : Math.min(PAGES.length - 1, start + maxPages - 1);
        const pages = PAGES.slice(start, end + 1).map((text, offset) => ({
          index: start + offset,
          label: String(start + offset + 1),
          text,
          link: `zotero://open-pdf/library/items/PDF00001?page=${start + offset + 1}`,
        }));
        return ok(res, {
          attachmentKey: ATTACHMENT.key,
          libraryID: 1,
          totalPages: PAGES.length,
          pageStart: start,
          pageEnd: end,
          truncated: end < PAGES.length - 1,
          pages,
        });
      }
      if (req.method === "GET" && path === "/zoterolink/search") {
        const query = url.searchParams.get("q") || "";
        return ok(res, {
          query,
          scope: url.searchParams.get("scope") || "all",
          hits: [
            {
              kind: "annotation",
              annotationKey: "ANN00001",
              attachmentKey: "PDF00001",
              libraryID: 1,
              itemKey: "ABCD1234",
              title: ITEM.title,
              year: "2021",
              creatorsLabel: "Smith 等",
              text: ANNOTATIONS[0].text,
              comment: ANNOTATIONS[0].comment,
              pageLabel: "1",
              pageIndex: 0,
              snippet: ANNOTATIONS[0].text,
              link: ANNOTATIONS[0].link,
            },
          ],
        });
      }
      if (req.method === "GET" && path === "/zoterolink/collections") {
        return ok(res, { collections: COLLECTIONS, recent: [] });
      }
      if (req.method === "GET" && path === "/zoterolink/collection/items") {
        return ok(res, {
          collection: { key: "COLL0001", name: "方法论文献", libraryID: 1 },
          items: [{ key: ITEM.key, libraryID: 1, itemType: "journalArticle", title: ITEM.title, year: "2021", creators: ITEM.creators, creatorsLabel: "Smith 等", link: ITEM.link }],
          total: 1,
        });
      }
      if (req.method === "GET" && path === "/zoterolink/tags") {
        return ok(res, { libraryID: 1, tags: [{ name: "identification", count: 3 }] });
      }
      if (req.method === "POST" && path === "/zoterolink/note") {
        const body = await readBody(req);
        if (!body.html) return fail(res, 400, "INVALID_ARG", "html required");
        return ok(res, {
          noteKey: "NOTE0002",
          libraryID: 1,
          parentKey: body.parentItemKey || null,
          collectionKey: body.collectionKey || null,
          title: String(body.html).replace(/<[^>]+>/g, "").slice(0, 40),
          link: "zotero://select/library/items/NOTE0002",
        });
      }
      if (req.method === "POST" && path === "/zoterolink/note/append") {
        const body = await readBody(req);
        return ok(res, { noteKey: body.noteKey || "NOTE0001", title: "appended", link: "zotero://select/library/items/NOTE0001" });
      }
      if (req.method === "POST" && path === "/zoterolink/open") {
        return ok(res, { attachmentKey: "PDF00001", itemKey: "ABCD1234", page: 2, annotationKey: null, link: "zotero://open-pdf/library/items/PDF00001?page=2" });
      }
      return fail(res, 404, "NOT_FOUND", "mock: unknown route");
    } catch (error) {
      return fail(res, 500, "INTERNAL", String(error && error.message ? error.message : error));
    }
  });
}

if (process.argv[1] && process.argv[1].endsWith("mock-bridge.mjs")) {
  const port = Number(process.argv[2] || 23199);
  createMockBridge().listen(port, "127.0.0.1", () => {
    console.log(`mock zotero bridge on http://127.0.0.1:${port} token=${TOKEN}`);
  });
}
