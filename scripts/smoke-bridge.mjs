/**
 * Live smoke test against the running Zotero bridge addon.
 * Requires Zotero to be running with zotero-link.xpi installed and restarted.
 *
 * Run: node scripts/smoke-bridge.mjs
 */
import { Bridge, errorResult } from "../lib/bridge.js";

const bridge = new Bridge();
const results = [];
function record(name, detail) {
  results.push(`ok   ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  process.exitCode = 1;
}

const status = await bridge.status();
if (!status.ok) {
  console.error("bridge status:", status);
  process.exit(1);
}
record("health", `Zotero ${status.health.zoteroVersion} on port ${status.info.port}, token present=${status.health.tokenPresent}`);

let current;
try {
  current = await bridge.current(5);
  record("current", `${current.mode} · ${current.item ? current.item.title : "no item"}`);
} catch (error) {
  fail("current", errorResult(error).message);
}

let annotationWord = null;
if (current && current.item) {
  try {
    const detail = await bridge.item(current.item.key);
    record(
      "item",
      `${detail.item.title} · annotations=${(detail.annotations || []).length} notes=${(detail.notes || []).length} attachments=${(detail.attachments || []).length}`
    );
    const firstAnnotation = (detail.annotations || []).find((entry) => entry.text && entry.text.length > 10);
    if (firstAnnotation) {
      annotationWord = String(firstAnnotation.text).split(/\s+/).slice(0, 3).join(" ");
      record("annotation link", firstAnnotation.link);
    }
  } catch (error) {
    fail("item", errorResult(error).message);
  }

  const attachment = (current.attachments || []).find((entry) => entry.isPDF);
  if (attachment) {
    try {
      const pages = await bridge.fulltext({ attachmentKey: attachment.key, pageStart: 0, maxPages: 2 });
      record("fulltext pages", `${pages.pages.length}/${pages.totalPages} pages, first page ${pages.pages[0].text.length} chars`);
      const located = await bridge.fulltext({ attachmentKey: attachment.key, query: pages.pages[0].text.split(/\s+/).find((word) => word.length > 5) || "the" });
      record("fulltext locate", `${located.matches.length} matches`);
    } catch (error) {
      fail("fulltext", errorResult(error).message);
    }
  } else {
    results.push("skip fulltext — current item has no PDF attachment");
  }
}

try {
  const collections = await bridge.collections();
  record("collections", `${(collections.collections || []).length} collections`);
  if ((collections.collections || []).length) {
    const first = collections.collections[0];
    const items = await bridge.collectionItems(first.key, 5);
    record("collection items", `${items.items.length} items in ${items.collection.name}`);
  }
} catch (error) {
  fail("collections", errorResult(error).message);
}

if (annotationWord) {
  try {
    const search = await bridge.search({ q: annotationWord, scope: "annotation", limit: 3 });
    record("annotation search", `${search.hits.length} hits for "${annotationWord}"`);
  } catch (error) {
    fail("search", errorResult(error).message);
  }
}

try {
  const info = bridge.info();
  const response = await fetch(`${info.baseUrl}/zoterolink/note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html: "<p>token check</p>" }),
  });
  const payload = await response.json();
  if (response.status === 403 && payload.code === "TOKEN_INVALID") record("write token enforcement", "unauthenticated write rejected");
  else fail("write token enforcement", `unexpected ${response.status} ${payload.code}`);
} catch (error) {
  fail("write token enforcement", errorResult(error).message);
}

for (const line of results) console.log(line);
console.log(results.some((line) => line.startsWith("FAIL")) ? "BRIDGE SMOKE FAILED" : "BRIDGE SMOKE OK");
