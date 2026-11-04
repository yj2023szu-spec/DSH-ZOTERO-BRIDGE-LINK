/**
 * Offline end-to-end test of the Zotero addon code against a stubbed Zotero
 * runtime. Catches registration/handler errors before a real Zotero restart.
 *
 * Run: node scripts/test-addon.mjs
 */
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../zotero-addon/content/zoterolink.js", import.meta.url), "utf8");

const logs = [];
const written = {};
const items = new Map();
const byKey = new Map();

let nextID = 100;

function fakeItem(options) {
  const item = {
    id: options.id,
    key: options.key,
    libraryID: options.libraryID ?? 1,
    parentItemID: options.parentItemID ?? null,
    deleted: false,
    dateModified: new Date("2026-10-30T10:00:00Z"),
    attachmentFilename: options.filename || "",
    attachmentContentType: options.contentType || "",
    annotationText: options.annotationText || "",
    annotationComment: options.annotationComment || "",
    annotationColor: options.color || "",
    annotationPageLabel: options.pageLabel || "",
    annotationPageIndex: options.pageIndex,
    annotationSortIndex: options.sortIndex || "",
    annotationPosition: options.position || "",
    annotationType: options.annotationType || "highlight",
    itemTypeID: 1,
    _note: options.noteHtml || "",
    _type: options.type,
    _annotations: options.annotations || [],
    _notes: options.notes || [],
    _attachments: options.attachments || [],
    _fields: options.fields || {},
    _creators: options.creators || [],
    _tags: options.tags || [],
    _collections: options.collections || [],
    getField(name) {
      if (name === "title") return this._fields.title || this.attachmentFilename || "";
      return this._fields[name] || "";
    },
    getCreators() {
      return this._creators;
    },
    getTags() {
      return this._tags.map((tag) => ({ tag, type: 1 }));
    },
    getCollections() {
      return this._collections;
    },
    getAttachments() {
      return this._attachments;
    },
    getAnnotations() {
      return this._annotations;
    },
    getNotes() {
      return this._notes;
    },
    getNote() {
      return this._note;
    },
    setNote(html) {
      this._note = html;
    },
    getAttachmentLastPageIndex() {
      return 1;
    },
    isFileAttachment() {
      return this._type === "attachment";
    },
    isPDFAttachment() {
      return this._type === "attachment" && this.attachmentContentType === "application/pdf";
    },
    isAttachment() {
      return this._type === "attachment" || this._type === "note";
    },
    isNote() {
      return this._type === "note";
    },
    isAnnotation() {
      return this._type === "annotation";
    },
    isRegularItem() {
      return this._type === "regular";
    },
    addToCollection(collectionID) {
      if (!this._collections.includes(collectionID)) this._collections.push(collectionID);
    },
    addTag(tag) {
      this._tags.push(String(tag));
    },
    async saveTx() {
      if (!this.key) this.key = `NOTE${String(nextID++).slice(-4)}`;
      items.set(this.id, this);
      byKey.set(`${this.libraryID}/${this.key}`, this);
    },
  };
  return item;
}

const parent = fakeItem({
  id: 1,
  key: "ABCD1234",
  type: "regular",
  fields: {
    title: "Placebo tests and identification: a practical guide",
    date: "2021-05-01 2021-05-01",
    publicationTitle: "Journal of Applied Econometrics",
    DOI: "10.1000/mock.2021.001",
    abstractNote: "We discuss placebo tests as a diagnostic for identification strategies.",
  },
  creators: [{ firstName: "Jane", lastName: "Smith", creatorTypeID: 1 }],
  tags: ["identification", "placebo"],
  collections: [10],
  attachments: [2],
  notes: [3],
});

const pdf = fakeItem({
  id: 2,
  key: "PDF00001",
  type: "attachment",
  parentItemID: 1,
  filename: "smith-2021-placebo.pdf",
  contentType: "application/pdf",
  annotations: [4],
});

const note = fakeItem({
  id: 3,
  key: "NOTE0001",
  type: "note",
  parentItemID: 1,
  noteHtml: '<div class="zotero-note znv1"><p>为什么安慰剂检验有说服力？</p></div>',
});

const annotation = fakeItem({
  id: 4,
  key: "ANN00001",
  type: "annotation",
  parentItemID: 2,
  annotationText: "Placebo tests are a widely used diagnostic for the credibility of an identification strategy.",
  annotationComment: "核心定义",
  className: "highlight",
  pageLabel: "1",
  pageIndex: 0,
  position: '{"pageIndex":0,"rects":[[1,2,3,4]]}',
  sortIndex: "00000|000010|00010",
});

parent._collections = [10];
note._note = '<div class="zotero-note znv1"><p>为什么安慰剂检验有说服力？关键在于设计在“不该有效”的地方应当无效。</p></div>';
annotation.annotationType = "highlight";

for (const item of [parent, pdf, note, annotation]) {
  items.set(item.id, item);
  byKey.set(`${item.libraryID}/${item.key}`, item);
}

const collections = new Map([
  [
    10,
    {
      id: 10,
      key: "COLL0001",
      name: "方法论文献",
      libraryID: 1,
      parentID: false,
      getChildItems: (asIDs) => (asIDs ? [1] : [parent]),
    },
  ],
]);

const Zotero = {
  version: "10.0.7",
  debug: (...args) => logs.push(args.join(" ")),
  Profile: { dir: "C:\\fake\\zotero\\profile" },
  Prefs: { get: () => true },
  Server: { port: 23119, init: async () => {}, Endpoints: {} },
  File: {
    getContentsAsync: async () => {
      throw new Error("no info file yet");
    },
    putContentsAsync: async (path, data) => {
      written[path] = data;
    },
  },
  Utilities: { randomString: (length) => "t".repeat(length) },
  Libraries: {
    userLibraryID: 1,
    getAll: () => [
      { libraryID: 1, libraryType: "user" },
      { libraryID: 2, libraryType: "group", groupID: 424242 },
    ],
    get: (libraryID) =>
      libraryID === 1
        ? { libraryID: 1, libraryType: "user" }
        : { libraryID: 2, libraryType: "group", groupID: 424242 },
  },
  Items: {
    get: (id) => items.get(id),
    getByLibraryAndKeyAsync: async (libraryID, key) => byKey.get(`${libraryID}/${key}`) || null,
  },
  Collections: {
    get: (id) => collections.get(id),
    getByLibrary: () => [...collections.values()],
    getByLibraryAndKey: (libraryID, key) => [...collections.values()].find((entry) => entry.key === key) || null,
  },
  DB: {
    queryAsync: async (sql) => {
      if (sql.includes("itemAttachments")) return [{ attachmentID: 2, lastRead: 1793791992 }];
      if (sql.includes("itemAnnotations")) {
        return [
          {
            annotationID: 4,
            text: annotation.annotationText,
            comment: annotation.annotationComment,
            pageLabel: "1",
            position: '{"pageIndex":0}',
            sortIndex: "1",
            attachmentKey: "PDF00001",
            libraryID: 1,
            parentItemID: 1,
          },
        ];
      }
      if (sql.includes("itemNotes")) {
        return [{ noteID: 3, parentItemID: 1, note: note._note, noteKey: "NOTE0001" }];
      }
      if (sql.includes("FROM tags")) return [{ name: "identification", count: 3 }];
      return [];
    },
    columnQueryAsync: async (sql) => {
      if (sql.includes("itemCreators")) return [];
      return [1];
    },
  },
  PDFWorker: {
    getFullText: async () => ({
      text: "Placebo tests are a widely used diagnostic.\n\n\fA placebo test that rejects the null is a warning sign.",
      extractedPages: 2,
      totalPages: 2,
    }),
  },
  Fulltext: {
    findItemsWithContent: async () => [2],
  },
  Reader: {
    getByTabID: () => ({ itemID: 2, _internalReader: { _state: { pageIndex: 1 } } }),
    open: async () => {},
  },
  getMainWindow: () => ({ Zotero_Tabs: { selectedID: "tab-1", selectedType: "reader" } }),
  getActiveZoteroPane: () => ({ getSelectedItems: () => [] }),
  ItemTypes: { getName: () => "journalArticle" },
  CreatorTypes: { getName: () => "author" },
  Notes: {
    notePrefix: '<div class="zotero-note znv1">',
    noteSuffix: "</div>",
    defaultNote: '<div class="zotero-note znv1"></div>',
  },
  Item: function Item(type) {
    return fakeItem({ id: nextID++, key: null, type: type === "note" ? "note" : type, noteHtml: "" });
  },
};

// -------------------------------------------------------------- load addon
const factory = new Function("Zotero", "Services", "PathUtils", `${source}\nreturn ZoteroLink;`);
const ZoteroLink = factory(Zotero, { scriptloader: {} }, { join: (...parts) => parts.join("\\") });
await ZoteroLink.startup({ version: "0.1.0", rootURI: "fake://" });

const infoPath = Object.keys(written).find((path) => path.endsWith("zoterolink.json"));
const info = JSON.parse(written[infoPath]);
const token = info.token;

// --------------------------------------------------------------- call helper
async function call(path, { method = "GET", query = {}, body, token: useToken } = {}) {
  const Endpoint = Zotero.Server.Endpoints[`/zoterolink/${path}`];
  if (!Endpoint) throw new Error(`endpoint /zoterolink/${path} is not registered`);
  const instance = new Endpoint();
  const url = new URL(`http://127.0.0.1/zoterolink/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const request = {
    method,
    pathname: url.pathname,
    pathParams: {},
    searchParams: url.searchParams,
    headers: useToken ? { "x-zotero-link-token": useToken } : {},
    data: body,
  };
  const [status, , text] = await instance.init(request);
  return { status, payload: JSON.parse(text) };
}

const checks = [];
if (!infoPath || infoPath.includes("/")) {
  checks.push(`FAIL info path uses native separators: ${infoPath}`);
  process.exitCode = 1;
} else {
  checks.push(`ok   info path native: ${infoPath}`);
}
async function expectOk(name, promise) {
  try {
    const { status, payload } = await promise;
    if (!payload.ok) throw new Error(`${payload.code}: ${payload.message}`);
    checks.push(`ok   ${name}`);
    return payload.data;
  } catch (error) {
    checks.push(`FAIL ${name}: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

// -------------------------------------------------------------------- assert
const health = await expectOk("health", call("health"));
if (!health || health.zoteroVersion !== "10.0.7" || health.port !== 23119) {
  checks.push("FAIL health payload");
  process.exitCode = 1;
}

const current = await expectOk("current", call("current", { query: { limit: 5 } }));
if (!current || current.mode !== "reader" || current.page.index !== 1 || current.item.key !== "ABCD1234") {
  checks.push("FAIL current payload");
  process.exitCode = 1;
}

await expectOk("item", call("item", { query: { key: "ABCD1234" } }));
await expectOk("item by attachment key", call("item", { query: { key: "PDF00001" } }));
await expectOk("annotations", call("annotations", { query: { attachmentKey: "PDF00001" } }));
await expectOk("notes", call("notes", { query: { itemKey: "ABCD1234" } }));
await expectOk("collections", call("collections"));
await expectOk("collection items", call("collection/items", { query: { collectionKey: "COLL0001" } }));
await expectOk("tags", call("tags"));

const pages = await expectOk("fulltext pages", call("fulltext", { query: { attachmentKey: "PDF00001", pageStart: 0, maxPages: 2 } }));
if (!pages || pages.pages.length !== 2 || !pages.pages[0].text.includes("Placebo")) {
  checks.push("FAIL fulltext pages payload");
  process.exitCode = 1;
}
const located = await expectOk("fulltext query", call("fulltext", { query: { attachmentKey: "PDF00001", query: "diagnostic" } }));
if (!located || located.matches.length !== 1 || located.matches[0].pageIndex !== 0) {
  checks.push("FAIL fulltext query payload");
  process.exitCode = 1;
}
await expectOk("search annotation", call("search", { query: { q: "placebo", scope: "annotation" } }));
await expectOk("search title", call("search", { query: { q: "placebo", scope: "title" } }));
await expectOk("search fulltext", call("search", { query: { q: "placebo", scope: "fulltext" } }));

// Writes must reject without the token, then succeed with it.
const rejected = await call("note", {
  method: "POST",
  body: { parentItemKey: "ABCD1234", html: "<p>hello</p>" },
});
if (rejected.status === 403 && rejected.payload.code === "TOKEN_INVALID") checks.push("ok   write rejects missing token");
else {
  checks.push(`FAIL write token guard: ${rejected.status} ${rejected.payload.code}`);
  process.exitCode = 1;
}

const created = await expectOk(
  "note create",
  call("note", {
    method: "POST",
    token,
    body: { parentItemKey: "ABCD1234", tags: ["综述"], html: '<div class="zotero-note znv1"><h1>笔记标题</h1><p>内容</p></div>' },
  })
);
if (!created || !created.noteKey) {
  checks.push("FAIL note create payload");
  process.exitCode = 1;
}
await expectOk(
  "note append",
  call("note/append", {
    method: "POST",
    token,
    body: { noteKey: "NOTE0001", html: "<p>追加内容</p>" },
  })
);
await expectOk(
  "open",
  call("open", { method: "POST", token, body: { attachmentKey: "PDF00001", page: 2 } })
);

// Unsafe HTML must be rejected.
const unsafe = await call("note", {
  method: "POST",
  token,
  body: { parentItemKey: "ABCD1234", html: '<p onclick="alert(1)">x</p>' },
});
if (unsafe.payload.code === "INVALID_ARG") checks.push("ok   rejects unsafe HTML");
else {
  checks.push(`FAIL unsafe HTML guard: ${unsafe.payload.code}`);
  process.exitCode = 1;
}

for (const line of checks) console.log(line);
console.log(checks.some((line) => line.startsWith("FAIL")) ? "ADDON STUB TEST FAILED" : "ADDON STUB TEST OK");
