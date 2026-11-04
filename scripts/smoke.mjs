/**
 * Contract smoke test for the plugin's offline layers: Markdown->Zotero HTML,
 * citation links, renderers, the preview store, and the bridge client against
 * the mock addon. Run: node scripts/smoke.mjs
 */
import assert from "node:assert/strict";
import { createMockBridge, TOKEN } from "./mock-bridge.mjs";
import { Bridge, errorResult } from "../lib/bridge.js";
import { PreviewStore } from "../lib/preview.js";
import * as fmt from "../lib/format.js";

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push(`ok   ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------- formatting
check("markdown escapes raw HTML", () => {
  const html = fmt.markdownToHtml("hello <script>alert(1)</script>");
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

check("markdown keeps zotero links and rejects javascript:", () => {
  const html = fmt.markdownToHtml(
    "[p.2](zotero://open-pdf/library/items/PDF00001?page=2&annotation=ANN1) [bad](javascript:alert(1))"
  );
  assert.ok(html.includes('href="zotero://open-pdf/library/items/PDF00001?page=2&amp;annotation=ANN1"'));
  assert.ok(!html.includes("javascript:"));
});

check("markdown headings, lists, blockquote, code", () => {
  const html = fmt.markdownToHtml("# T\n\n- a\n- b\n\n> quote\n\n```\ncode\n```\n\n**bold** and *em*");
  assert.ok(html.includes("<h1>T</h1>"));
  assert.ok(html.includes("<ul><li>a</li><li>b</li></ul>"));
  assert.ok(html.includes("<blockquote>"));
  assert.ok(html.includes("<pre><code>code</code></pre>"));
  assert.ok(html.includes("<strong>bold</strong>"));
});

check("renderers do not throw", () => {
  fmt.renderCurrent({ item: null, recent: [] });
  fmt.renderCurrent({
    item: { key: "ABCD1234", libraryID: 1, title: "T", itemType: "journalArticle", creatorsLabel: "Smith", year: "2021", collections: [] },
    page: { index: 1, label: "2", source: "reader" },
    annotationCount: 2,
    noteCount: 1,
    attachments: [],
    pageAnnotations: [],
    recent: [],
  });
  fmt.renderItem({
    item: { key: "ABCD1234", libraryID: 1, title: "T" },
    attachments: [{ key: "PDF00001", isPDF: true, link: "zotero://x" }],
    annotations: [{ key: "A", text: "x", pageLabel: "1", pageIndex: 0, link: "zotero://x" }],
    notes: [{ key: "N", title: "n", link: "zotero://y" }],
  });
  fmt.renderSearch({ query: "q", scope: "all", hits: [{ kind: "annotation", title: "t", snippet: "s", link: "zotero://z" }] });
  fmt.renderPages({ totalPages: 2, pageStart: 0, pageEnd: 1, truncated: false, pages: [{ index: 0, text: "x" }] });
  fmt.renderPages({ query: "q", totalPages: 2, matches: [{ pageIndex: 0, context: "c", link: "zotero://z" }] });
  fmt.renderCollections({ collections: [{ key: "C", name: "n" }] });
  fmt.renderNotePreview({ previewId: "p", target: "t", mode: "create", chars: 10, text: "x", links: [] });
  fmt.renderNoteCommit({ noteKey: "N", link: "zotero://y", mode: "create" });
  fmt.renderOpen({ attachmentKey: "PDF00001", link: "zotero://z" });
  fmt.renderError({ code: "BRIDGE_MISSING", message: "m" });
});

check("extractLinks finds zotero links", () => {
  const links = fmt.extractLinks("a [p.1](zotero://open-pdf/x) b [web](https://example.com)");
  assert.equal(links.length, 2);
  assert.equal(links[0].url, "zotero://open-pdf/x");
});

// -------------------------------------------------------------- preview store
const previewStore = new PreviewStore({ ttlMs: 60 });
const previewId = previewStore.create("s1", { html: "<p>x</p>" });
check("preview store rejects another session", () => {
  assert.equal(previewStore.resolve(previewId, "s2").code, "PREVIEW_INVALID");
  assert.ok(previewStore.resolve(previewId, "s1").ok);
});
await new Promise((resolve) => setTimeout(resolve, 90));
check("preview store expires", () => {
  assert.equal(previewStore.resolve(previewId, "s1").code, "PREVIEW_EXPIRED");
});

// ------------------------------------------------------------- bridge client
const server = createMockBridge();
await new Promise((resolve) => server.listen(23199, "127.0.0.1", resolve));
process.env.ZOTERO_LINK_URL = "http://127.0.0.1:23199";
process.env.ZOTERO_LINK_TOKEN = TOKEN;

const bridge = new Bridge();
try {
  const health = await bridge.health();
  assert.equal(health.zoteroVersion, "10.0.7");
  results.push("ok   bridge health");

  const current = await bridge.current(5);
  assert.equal(current.item.key, "ABCD1234");
  assert.equal(current.page.label, "2");
  results.push("ok   bridge current");

  const item = await bridge.item("ABCD1234");
  assert.equal(item.annotations.length, 2);
  results.push("ok   bridge item");

  const pages = await bridge.fulltext({ attachmentKey: "PDF00001", pageStart: 0, pageEnd: 1 });
  assert.equal(pages.pages.length, 2);
  assert.ok(pages.pages[0].text.includes("Placebo"));
  results.push("ok   bridge fulltext pages");

  const located = await bridge.fulltext({ attachmentKey: "PDF00001", query: "diagnostic" });
  assert.ok(located.matches.length >= 1);
  results.push("ok   bridge fulltext locate");

  const search = await bridge.search({ q: "placebo", scope: "annotation" });
  assert.equal(search.hits[0].pageLabel, "1");
  results.push("ok   bridge search");

  const collections = await bridge.collections();
  assert.equal(collections.collections.length, 2);
  assert.equal(await bridge.resolveCollectionKey("方法论文献"), "COLL0001");
  results.push("ok   bridge collections + name resolution");

  const note = await bridge.createNote({ parentItemKey: "ABCD1234", html: "<p>hello</p>" });
  assert.equal(note.noteKey, "NOTE0002");
  results.push("ok   bridge note create");

  const appended = await bridge.appendNote({ noteKey: "NOTE0001", html: "<p>more</p>" });
  assert.equal(appended.noteKey, "NOTE0001");
  results.push("ok   bridge note append");

  const opened = await bridge.open({ attachmentKey: "PDF00001", page: 2 });
  assert.equal(opened.page, 2);
  results.push("ok   bridge open");
} catch (error) {
  results.push(`FAIL bridge: ${error.stack || error}`);
  process.exitCode = 1;
}

// Token enforcement must be visible as TOKEN_INVALID.
try {
  const badBridge = new Bridge();
  process.env.ZOTERO_LINK_TOKEN = "wrong";
  await badBridge.createNote({ html: "<p>x</p>" });
  results.push("FAIL token enforcement: expected failure");
  process.exitCode = 1;
} catch (error) {
  const result = errorResult(error);
  if (result.code === "TOKEN_INVALID") results.push("ok   token enforcement");
  else {
    results.push(`FAIL token enforcement: got ${result.code}`);
    process.exitCode = 1;
  }
}

server.close();
for (const line of results) console.log(line);
console.log(results.some((line) => line.startsWith("FAIL")) ? "SMOKE FAILED" : "SMOKE OK");
