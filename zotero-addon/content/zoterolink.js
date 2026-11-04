/* global Zotero, Services */

/**
 * Zotero Link Bridge
 *
 * Registers /zoterolink/* endpoints on Zotero's built-in HTTP server so DeepSeek
 * Harness can read the item being read right now, page-accurate PDF text, the
 * user's annotations/notes, and write Zotero notes back.
 *
 * Read endpoints are local-only and unauthenticated. Write/action endpoints
 * require the X-Zotero-Link-Token header; the token is stored in the Zotero
 * profile directory as zoterolink.json, which the Harness host reads.
 */
var ZoteroLink = (function () {
  "use strict";

  var API_VERSION = 1;
  var PREFIX = "/zoterolink/";
  var INFO_FILE = "zoterolink.json";
  var FULLTEXT_TTL_MS = 5 * 60 * 1000;
  var registered = [];
  var token = null;
  var pluginVersion = "0.0.0";
  var startedAt = 0;
  var infoPath = null;
  var fulltextCache = new Map();
  var labelCache = new Map();

  // ------------------------------------------------------------------ helpers

  function fail(code, message) {
    var error = new Error(message || code);
    error.code = code;
    return error;
  }

  function clamp(value, min, max) {
    var n = parseInt(value, 10);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function intOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    var n = parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }

  function qp(request, name, fallback) {
    var value = request && request.searchParams ? request.searchParams.get(name) : null;
    if (value === null || value === "") return fallback === undefined ? null : fallback;
    return value;
  }

  function meta() {
    return { api: API_VERSION, version: pluginVersion, fetchedAt: new Date().toISOString() };
  }

  function response(status, payload) {
    return [status, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify(payload)];
  }

  function zoteroDebug(message) {
    try {
      Zotero.debug("[zotero-link] " + message);
    } catch (e) {
      /* ignore */
    }
  }

  /**
   * Build a native path. OS.File (used by Zotero.File) rejects paths that mix
   * "/" and "\" on Windows, so always join with PathUtils.
   */
  function joinPath(dir, name) {
    try {
      if (typeof PathUtils !== "undefined" && PathUtils.join) {
        return PathUtils.join(dir, name);
      }
    } catch (e) {
      /* fall through */
    }
    var base = String(dir || "").replace(/[\\/]+$/, "");
    var separator = base.indexOf("\\") !== -1 ? "\\" : "/";
    return base + separator + name;
  }

  function requireToken(request) {
    var headers = (request && request.headers) || {};
    var provided = headers["x-zotero-link-token"] || "";
    if (!token || provided !== token) {
      throw fail("TOKEN_INVALID", "Missing or invalid X-Zotero-Link-Token header");
    }
  }

  function endpoint(path, methods, handler, options) {
    options = options || {};
    var Endpoint = class {
      supportedMethods = methods;
      supportedDataTypes = ["application/json"];
      async init(request) {
        try {
          if (options.write) requireToken(request);
          var data = await handler(request);
          return response(200, { ok: true, data: data, meta: meta() });
        } catch (error) {
          var code = (error && error.code) || "INTERNAL";
          var status = code === "TOKEN_INVALID" ? 403 : code === "INVALID_ARG" ? 400 : code === "NOT_FOUND" ? 404 : 500;
          zoteroDebug(path + " failed: " + code + " " + (error && error.message ? error.message : error));
          return response(status, { ok: false, code: code, message: String((error && error.message) || error) });
        }
      }
    };
    Zotero.Server.Endpoints[PREFIX + path] = Endpoint;
    registered.push(PREFIX + path);
  }

  // ------------------------------------------------------------ zotero lookups

  function safeField(item, field) {
    try {
      return item.getField(field) || "";
    } catch (e) {
      return "";
    }
  }

  function yearOf(date) {
    var match = String(date || "").match(/(\d{4})/);
    return match ? match[1] : null;
  }

  function creatorsOf(item) {
    var out = [];
    try {
      var creators = item.getCreators();
      for (var i = 0; i < creators.length; i++) {
        var creator = creators[i];
        var type = "";
        try {
          type = Zotero.CreatorTypes.getName(creator.creatorTypeID);
        } catch (e) {
          type = "";
        }
        out.push({ firstName: creator.firstName || "", lastName: creator.lastName || "", creatorType: type });
      }
    } catch (e) {
      /* ignore */
    }
    return out;
  }

  function creatorsLabel(item) {
    var creators = creatorsOf(item);
    if (!creators.length) return "";
    var first = creators[0];
    var name = first.lastName || first.firstName || "";
    if (creators.length > 1) return name + " 等";
    return name;
  }

  function librarySegment(libraryID) {
    try {
      var library = Zotero.Libraries.get(libraryID);
      if (library && library.libraryType === "group" && library.groupID) {
        return "groups/" + library.groupID;
      }
    } catch (e) {
      /* ignore */
    }
    return "library";
  }

  function itemLink(item) {
    return "zotero://select/" + librarySegment(item.libraryID) + "/items/" + item.key;
  }

  function pdfLink(attachment, pageIndex, annotationKey) {
    var url = "zotero://open-pdf/" + librarySegment(attachment.libraryID) + "/items/" + attachment.key;
    var params = [];
    if (Number.isInteger(pageIndex) && pageIndex >= 0) params.push("page=" + (pageIndex + 1));
    if (annotationKey) params.push("annotation=" + annotationKey);
    return params.length ? url + "?" + params.join("&") : url;
  }

  async function resolveItem(key, libraryID) {
    if (!key) return null;
    try {
      if (Number.isFinite(libraryID)) {
        var direct = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, key);
        if (direct) return direct;
      }
    } catch (e) {
      /* fall through */
    }
    var libraries = [];
    try {
      libraries = Zotero.Libraries.getAll();
    } catch (e) {
      libraries = [];
    }
    for (var i = 0; i < libraries.length; i++) {
      var library = libraries[i];
      try {
        var found = await Zotero.Items.getByLibraryAndKeyAsync(library.libraryID, key);
        if (found) return found;
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  }

  async function resolveCollection(key, libraryID) {
    if (!key) return null;
    var libraries = Number.isFinite(libraryID) ? [libraryID] : [];
    if (!libraries.length) {
      libraries.push(Zotero.Libraries.userLibraryID);
      try {
        Zotero.Libraries.getAll().forEach(function (library) {
          if (library.libraryID !== Zotero.Libraries.userLibraryID) libraries.push(library.libraryID);
        });
      } catch (e) {
        /* ignore */
      }
    }
    for (var i = 0; i < libraries.length; i++) {
      try {
        var collection = Zotero.Collections.getByLibraryAndKey(libraries[i], key);
        if (collection) return collection;
      } catch (e) {
        /* ignore */
      }
      try {
        var list = Zotero.Collections.getByLibrary(libraries[i], true) || [];
        for (var j = 0; j < list.length; j++) {
          if (list[j].key === key) return list[j];
        }
      } catch (e) {
        /* ignore */
      }
    }
    return null;
  }

  function parentOf(item) {
    if (!item) return null;
    try {
      if (item.isAttachment() && item.parentItemID) return Zotero.Items.get(item.parentItemID) || null;
      if (item.isAnnotation && item.isAnnotation() && item.parentItemID) {
        var attachment = Zotero.Items.get(item.parentItemID);
        if (attachment && attachment.parentItemID) return Zotero.Items.get(attachment.parentItemID) || attachment;
        return attachment;
      }
    } catch (e) {
      /* ignore */
    }
    return item;
  }

  function attachmentsOf(item) {
    if (!item) return [];
    try {
      if (item.isFileAttachment()) return [item];
      return item
        .getAttachments()
        .map(function (id) {
          return Zotero.Items.get(id);
        })
        .filter(function (attachment) {
          return attachment && !attachment.deleted;
        });
    } catch (e) {
      return [];
    }
  }

  function bestPDF(item) {
    if (!item) return null;
    if (item.isFileAttachment()) return item.isPDFAttachment() ? item : null;
    var attachments = attachmentsOf(item).filter(function (attachment) {
      return attachment.isPDFAttachment && attachment.isPDFAttachment();
    });
    if (!attachments.length) return null;
    attachments.sort(function (a, b) {
      var ta = a.dateModified ? new Date(a.dateModified).getTime() : 0;
      var tb = b.dateModified ? new Date(b.dateModified).getTime() : 0;
      return tb - ta;
    });
    return attachments[0];
  }

  function safePageIndex(attachment) {
    try {
      var index = attachment.getAttachmentLastPageIndex();
      if (Number.isInteger(index) && index >= 0) return index;
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function parsePosition(annotation) {
    try {
      return JSON.parse(annotation.annotationPosition || "{}");
    } catch (e) {
      return null;
    }
  }

  function pageLabelFor(attachment, pageIndex) {
    if (!attachment || !Number.isInteger(pageIndex)) return null;
    var cacheKey = attachment.libraryID + "/" + attachment.key;
    var labels = labelCache.get(cacheKey);
    if (!labels) {
      labels = {};
      try {
        var ids = attachment.getAnnotations();
        for (var i = 0; i < ids.length; i++) {
          var annotation = Zotero.Items.get(ids[i]);
          if (!annotation) continue;
          var position = parsePosition(annotation);
          if (position && Number.isInteger(position.pageIndex) && annotation.annotationPageLabel) {
            labels[position.pageIndex] = annotation.annotationPageLabel;
          }
        }
      } catch (e) {
        /* ignore */
      }
      labelCache.set(cacheKey, labels);
    }
    return labels[pageIndex] || null;
  }

  function annotationJSON(annotation, attachment) {
    var position = parsePosition(annotation) || {};
    var pageIndex = Number.isInteger(position.pageIndex) ? position.pageIndex : null;
    return {
      key: annotation.key,
      originKey: annotation.key,
      type: annotation.annotationType || "highlight",
      text: annotation.annotationText || "",
      comment: annotation.annotationComment || "",
      color: annotation.annotationColor || null,
      pageLabel: annotation.annotationPageLabel || null,
      pageIndex: pageIndex,
      sortIndex: annotation.annotationSortIndex || null,
      attachmentKey: attachment.key,
      libraryID: attachment.libraryID,
      link: pdfLink(attachment, pageIndex, annotation.key),
      selectLink: itemLink(annotation),
    };
  }

  function annotationsFor(item) {
    var out = [];
    var attachments = attachmentsOf(item);
    for (var i = 0; i < attachments.length; i++) {
      var attachment = attachments[i];
      if (!attachment.isFileAttachment || !attachment.isFileAttachment()) continue;
      var ids = [];
      try {
        ids = attachment.getAnnotations();
      } catch (e) {
        ids = [];
      }
      for (var j = 0; j < ids.length; j++) {
        var annotation = Zotero.Items.get(ids[j]);
        if (!annotation || annotation.deleted) continue;
        out.push(annotationJSON(annotation, attachment));
      }
    }
    out.sort(function (a, b) {
      var pa = a.pageIndex === null ? 1000000 : a.pageIndex;
      var pb = b.pageIndex === null ? 1000000 : b.pageIndex;
      if (pa !== pb) return pa - pb;
      return String(a.sortIndex || "").localeCompare(String(b.sortIndex || ""));
    });
    return out;
  }

  function htmlToText(html) {
    if (!html) return "";
    var text = String(html);
    text = text.replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/blockquote|\/tr|\/pre)\s*>/gi, "\n");
    text = text.replace(/<[^>]+>/g, "");
    text = text
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    return text
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function noteTitle(html) {
    var text = htmlToText(html);
    var first = text.split("\n")[0] || "";
    return first.slice(0, 120);
  }

  function notesFor(item) {
    var out = [];
    if (!item) return out;
    var ids = [];
    try {
      ids = item.getNotes();
    } catch (e) {
      return out;
    }
    for (var i = 0; i < ids.length; i++) {
      var note = Zotero.Items.get(ids[i]);
      if (!note || note.deleted) continue;
      var html = note.getNote();
      out.push({
        key: note.key,
        libraryID: note.libraryID,
        parentKey: item.key,
        title: noteTitle(html),
        text: htmlToText(html),
        html: html,
        updated: note.dateModified ? new Date(note.dateModified).toISOString() : null,
        link: itemLink(note),
      });
    }
    return out;
  }

  function itemJSON(item) {
    if (!item) return null;
    var json = {
      key: item.key,
      libraryID: item.libraryID,
      itemType: (function () {
        try {
          return Zotero.ItemTypes.getName(item.itemTypeID);
        } catch (e) {
          return "";
        }
      })(),
      title: safeField(item, "title") || safeField(item, "caseName"),
      date: safeField(item, "date"),
      year: yearOf(safeField(item, "date")),
      creators: creatorsOf(item),
      creatorsLabel: creatorsLabel(item),
      tags: (function () {
        try {
          return item.getTags().map(function (entry) {
            return entry.tag;
          });
        } catch (e) {
          return [];
        }
      })(),
      collections: (function () {
        try {
          return item
            .getCollections()
            .map(function (id) {
              var collection = Zotero.Collections.get(id);
              return collection ? { key: collection.key, name: collection.name } : null;
            })
            .filter(Boolean);
        } catch (e) {
          return [];
        }
      })(),
      link: itemLink(item),
    };
    ["publicationTitle", "proceedingsTitle", "bookTitle", "publisher", "DOI", "url", "abstractNote", "volume", "issue", "pages", "language", "edition", "place"].forEach(
      function (field) {
        var value = safeField(item, field);
        if (value) json[field] = value;
      }
    );
    return json;
  }

  function itemLite(item) {
    return {
      key: item.key,
      libraryID: item.libraryID,
      itemType: (function () {
        try {
          return Zotero.ItemTypes.getName(item.itemTypeID);
        } catch (e) {
          return "";
        }
      })(),
      title: safeField(item, "title"),
      year: yearOf(safeField(item, "date")),
      creators: creatorsOf(item).slice(0, 5),
      creatorsLabel: creatorsLabel(item),
      link: itemLink(item),
    };
  }

  function attachmentJSON(attachment) {
    var parent = null;
    try {
      parent = parentOf(attachment);
    } catch (e) {
      parent = null;
    }
    return {
      key: attachment.key,
      libraryID: attachment.libraryID,
      filename: attachment.attachmentFilename || "",
      contentType: attachment.attachmentContentType || "",
      isPDF: attachment.isPDFAttachment ? attachment.isPDFAttachment() : false,
      lastPageIndex: safePageIndex(attachment),
      parentKey: parent ? parent.key : null,
      link: pdfLink(attachment, null),
    };
  }

  function attachmentsJSON(item) {
    return attachmentsOf(item).map(attachmentJSON);
  }

  async function recentItems(limit) {
    var rows = [];
    try {
      rows = await Zotero.DB.queryAsync(
        "SELECT ia.itemID AS attachmentID, ia.lastRead AS lastRead FROM itemAttachments ia " +
          "WHERE ia.lastRead IS NOT NULL ORDER BY ia.lastRead DESC LIMIT " +
          clamp(limit, 1, 50)
      );
    } catch (e) {
      return [];
    }
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var attachment = Zotero.Items.get(rows[i].attachmentID);
      if (!attachment || attachment.deleted) continue;
      var parent = parentOf(attachment) || attachment;
      var pageIndex = safePageIndex(attachment);
      out.push({
        attachmentKey: attachment.key,
        libraryID: attachment.libraryID,
        itemKey: parent.key,
        title: safeField(parent, "title") || attachment.attachmentFilename || parent.key,
        year: yearOf(safeField(parent, "date")),
        creatorsLabel: creatorsLabel(parent),
        pageIndex: pageIndex,
        pageLabel: pageLabelFor(attachment, pageIndex),
        lastRead: rows[i].lastRead,
        link: pdfLink(attachment, pageIndex),
        select: itemLink(parent),
      });
    }
    return out;
  }

  // --------------------------------------------------------------- current item

  function readerPageIndex(reader, attachment) {
    var candidates = [];
    try {
      candidates.push(reader._internalReader && reader._internalReader._state && reader._internalReader._state.pageIndex);
      candidates.push(reader._internalReader && reader._internalReader.state && reader._internalReader.state.pageIndex);
      candidates.push(reader.state && reader.state.pageIndex);
      candidates.push(reader._state && reader._state.pageIndex);
    } catch (e) {
      /* ignore */
    }
    for (var i = 0; i < candidates.length; i++) {
      if (Number.isInteger(candidates[i]) && candidates[i] >= 0) return candidates[i];
    }
    var lastRead = safePageIndex(attachment);
    return Number.isInteger(lastRead) ? lastRead : null;
  }

  async function currentSelection() {
    // 1. Active reader tab.
    try {
      var win = Zotero.getMainWindow();
      var tabs = win && win.Zotero_Tabs;
      if (tabs && tabs.selectedType === "reader") {
        var reader = Zotero.Reader.getByTabID(tabs.selectedID);
        if (reader && reader.itemID) {
          var attachment = Zotero.Items.get(reader.itemID);
          if (attachment) {
            var pageIndex = readerPageIndex(reader, attachment);
            return {
              mode: "reader",
              item: parentOf(attachment) || attachment,
              attachment: attachment,
              page: { index: pageIndex, label: pageLabelFor(attachment, pageIndex), source: "reader" },
            };
          }
        }
      }
    } catch (e) {
      zoteroDebug("reader detection failed: " + e);
    }

    // 2. Library selection.
    try {
      var pane = Zotero.getActiveZoteroPane();
      var selected = pane && pane.getSelectedItems ? pane.getSelectedItems() : [];
      if (selected && selected.length) {
        var item = selected[0];
        var pdf = item && item.isFileAttachment() ? item : bestPDF(item);
        var parent = parentOf(pdf || item) || item;
        var index = pdf ? safePageIndex(pdf) : null;
        return {
          mode: "selected",
          item: parent,
          attachment: pdf,
          page: { index: index, label: pdf ? pageLabelFor(pdf, index) : null, source: "lastRead" },
        };
      }
    } catch (e) {
      zoteroDebug("selection detection failed: " + e);
    }

    // 3. Most recently read attachment.
    var recent = await recentItems(1);
    if (recent.length) {
      var latest = recent[0];
      var resolved = await resolveItem(latest.attachmentKey, latest.libraryID);
      return {
        mode: "recent",
        item: parentOf(resolved) || resolved,
        attachment: resolved,
        page: { index: latest.pageIndex, label: latest.pageLabel, source: "lastRead" },
      };
    }

    return { mode: "none", item: null, attachment: null, page: null };
  }

  // ------------------------------------------------------------------- fulltext

  async function fulltextPages(attachment) {
    var cacheKey = attachment.libraryID + "/" + attachment.key;
    var cached = fulltextCache.get(cacheKey);
    if (cached && Date.now() - cached.at < FULLTEXT_TTL_MS) return cached;

    var result;
    try {
      result = await Zotero.PDFWorker.getFullText(attachment.id, null);
    } catch (e) {
      throw fail("PDF_ERROR", "无法抽取该 PDF 的文字：" + (e && e.message ? e.message : e));
    }
    var text = result && typeof result.text === "string" ? result.text : "";
    if (!text.trim()) {
      throw fail("PDF_NO_TEXT", "该 PDF 没有可抽取的文字层（可能是扫描件），只能依据你的高亮与笔记回答。");
    }
    var pages = text.split("\f");
    var entry = {
      at: Date.now(),
      pages: pages,
      totalPages: Number.isInteger(result.totalPages) ? result.totalPages : pages.length,
      extractedPages: Number.isInteger(result.extractedPages) ? result.extractedPages : pages.length,
    };
    fulltextCache.set(cacheKey, entry);
    return entry;
  }

  function contextAround(text, needle, radius) {
    var haystack = String(text || "").toLowerCase();
    var index = haystack.indexOf(String(needle).toLowerCase());
    if (index === -1) return String(text || "").slice(0, Math.max(80, radius * 2));
    var start = Math.max(0, index - radius);
    var end = Math.min(text.length, index + String(needle).length + radius);
    return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ") + (end < text.length ? "…" : "");
  }

  async function pagesPayload(attachment, options) {
    options = options || {};
    var store = await fulltextPages(attachment);
    var totalPages = store.pages.length;

    if (options.query) {
      var needle = String(options.query);
      var matches = [];
      for (var i = 0; i < store.pages.length && matches.length < 20; i++) {
        if (store.pages[i].toLowerCase().indexOf(needle.toLowerCase()) === -1) continue;
        matches.push({
          pageIndex: i,
          label: pageLabelFor(attachment, i),
          context: contextAround(store.pages[i], needle, 160),
          link: pdfLink(attachment, i),
        });
      }
      return { query: needle, matches: matches, totalPages: totalPages, pageCount: totalPages };
    }

    var start = Number.isInteger(options.pageStart) ? options.pageStart : 0;
    var maxPages = clamp(options.maxPages || 8, 1, 30);
    var end = Number.isInteger(options.pageEnd) ? options.pageEnd : Math.min(totalPages - 1, start + maxPages - 1);
    start = Math.max(0, Math.min(start, totalPages - 1));
    end = Math.max(start, Math.min(end, totalPages - 1));

    var pages = [];
    for (var page = start; page <= end; page++) {
      pages.push({
        index: page,
        label: pageLabelFor(attachment, page),
        text: store.pages[page] || "",
        link: pdfLink(attachment, page),
      });
    }
    return {
      attachmentKey: attachment.key,
      libraryID: attachment.libraryID,
      totalPages: totalPages,
      pageStart: start,
      pageEnd: end,
      truncated: end < totalPages - 1,
      pages: pages,
    };
  }

  // -------------------------------------------------------------------- search

  function escapeLike(value) {
    return String(value).replace(/[\\%_]/g, function (match) {
      return "\\" + match;
    });
  }

  function collectionItemIDs(collection) {
    var ids = new Set();
    try {
      var childIDs = collection.getChildItems(true);
      for (var i = 0; i < childIDs.length; i++) {
        var item = Zotero.Items.get(childIDs[i]);
        if (!item) continue;
        var top = item.isAttachment() && item.parentItemID ? item.parentItemID : item.id;
        ids.add(top);
        ids.add(item.id);
      }
    } catch (e) {
      /* ignore */
    }
    return ids;
  }

  function matchesTag(item, tag) {
    if (!tag) return true;
    try {
      return item.getTags().some(function (entry) {
        return entry.tag === tag;
      });
    } catch (e) {
      return false;
    }
  }

  async function searchItemsByText(text, limit, collection, tag) {
    var like = "%" + escapeLike(text) + "%";
    var ids = [];
    try {
      var titleRows = await Zotero.DB.columnQueryAsync(
        "SELECT DISTINCT i.itemID FROM items i " +
          "JOIN itemData d ON d.itemID=i.itemID " +
          "JOIN fieldsCombined f ON f.fieldID=d.fieldID " +
          "JOIN itemDataValues v ON v.valueID=d.valueID " +
          "WHERE f.fieldName IN ('title','abstractNote') AND v.value LIKE ? ESCAPE '\\' " +
          "ORDER BY i.itemID DESC LIMIT " +
          clamp(limit * 2, 5, 100),
        [like]
      );
      ids = titleRows || [];
    } catch (e) {
      zoteroDebug("title search failed: " + e);
    }
    try {
      var creatorRows = await Zotero.DB.columnQueryAsync(
        "SELECT DISTINCT i.itemID FROM items i " +
          "JOIN itemCreators ic ON ic.itemID=i.itemID " +
          "JOIN creators c ON c.creatorID=ic.creatorID " +
          "WHERE c.lastName LIKE ? ESCAPE '\\' OR c.firstName LIKE ? ESCAPE '\\' " +
          "LIMIT " +
          clamp(limit * 2, 5, 100),
        [like, like]
      );
      for (var i = 0; i < (creatorRows || []).length; i++) {
        if (ids.indexOf(creatorRows[i]) === -1) ids.push(creatorRows[i]);
      }
    } catch (e) {
      zoteroDebug("creator search failed: " + e);
    }

    var scope = collection ? collectionItemIDs(collection) : null;
    var hits = [];
    for (var j = 0; j < ids.length && hits.length < limit; j++) {
      var item = Zotero.Items.get(ids[j]);
      if (!item || item.deleted || item.isAttachment() || item.isNote()) continue;
      if (scope && !scope.has(item.id)) continue;
      if (tag && !matchesTag(item, tag)) continue;
      hits.push(Object.assign(itemLite(item), { kind: "item", snippet: safeField(item, "abstractNote").slice(0, 160) }));
    }
    return hits;
  }

  async function searchAnnotations(text, limit, collection, tag) {
    var like = "%" + escapeLike(text) + "%";
    var rows = [];
    try {
      rows = await Zotero.DB.queryAsync(
        "SELECT a.itemID AS annotationID, a.text AS text, a.comment AS comment, a.pageLabel AS pageLabel, " +
          "a.position AS position, a.sortIndex AS sortIndex, ai.key AS attachmentKey, ai.libraryID AS libraryID, " +
          "ia.parentItemID AS parentItemID " +
          "FROM itemAnnotations a " +
          "JOIN items ai ON ai.itemID = a.parentItemID " +
          "LEFT JOIN itemAttachments ia ON ia.itemID = a.parentItemID " +
          "WHERE a.text LIKE ? ESCAPE '\\' OR a.comment LIKE ? ESCAPE '\\' " +
          "LIMIT " +
          clamp(limit * 3, 10, 120),
        [like, like]
      );
    } catch (e) {
      zoteroDebug("annotation search failed: " + e);
      return [];
    }

    var scope = collection ? collectionItemIDs(collection) : null;
    var hits = [];
    for (var i = 0; i < rows.length && hits.length < limit; i++) {
      var row = rows[i];
      var attachment = Zotero.Items.get(row.attachmentID);
      if (!attachment) continue;
      var parent = row.parentItemID ? Zotero.Items.get(row.parentItemID) : parentOf(attachment);
      if (parent && scope && !scope.has(parent.id)) continue;
      if (parent && tag && !matchesTag(parent, tag)) continue;
      var position = null;
      try {
        position = JSON.parse(row.position || "{}");
      } catch (e) {
        position = null;
      }
      var pageIndex = position && Number.isInteger(position.pageIndex) ? position.pageIndex : null;
      hits.push({
        kind: "annotation",
        annotationKey: attachment && row.annotationID ? Zotero.Items.get(row.annotationID).key : null,
        attachmentKey: row.attachmentKey,
        libraryID: row.libraryID,
        itemKey: parent ? parent.key : null,
        title: parent ? safeField(parent, "title") : row.attachmentKey,
        year: parent ? yearOf(safeField(parent, "date")) : null,
        creatorsLabel: parent ? creatorsLabel(parent) : "",
        text: row.text || "",
        comment: row.comment || "",
        pageLabel: row.pageLabel || null,
        pageIndex: pageIndex,
        snippet: (row.text || row.comment || "").slice(0, 200),
        link: attachment ? pdfLink(attachment, pageIndex, Zotero.Items.get(row.annotationID) ? Zotero.Items.get(row.annotationID).key : null) : null,
      });
    }
    return hits;
  }

  async function searchNotes(text, limit, collection, tag) {
    var like = "%" + escapeLike(text) + "%";
    var rows = [];
    try {
      rows = await Zotero.DB.queryAsync(
        "SELECT n.itemID AS noteID, n.parentItemID AS parentItemID, n.note AS note, i.key AS noteKey " +
          "FROM itemNotes n JOIN items i ON i.itemID = n.itemID " +
          "WHERE n.note LIKE ? ESCAPE '\\' LIMIT " +
          clamp(limit * 2, 10, 80),
        [like]
      );
    } catch (e) {
      zoteroDebug("note search failed: " + e);
      return [];
    }

    var scope = collection ? collectionItemIDs(collection) : null;
    var hits = [];
    for (var i = 0; i < rows.length && hits.length < limit; i++) {
      var row = rows[i];
      var parent = row.parentItemID ? Zotero.Items.get(row.parentItemID) : null;
      if (parent && scope && !scope.has(parent.id)) continue;
      if (parent && tag && !matchesTag(parent, tag)) continue;
      var plain = htmlToText(row.note);
      var index = plain.toLowerCase().indexOf(String(text).toLowerCase());
      hits.push({
        kind: "note",
        noteKey: row.noteKey,
        itemKey: parent ? parent.key : null,
        title: parent ? safeField(parent, "title") : "Standalone note",
        year: parent ? yearOf(safeField(parent, "date")) : null,
        creatorsLabel: parent ? creatorsLabel(parent) : "",
        snippet: index >= 0 ? plain.slice(Math.max(0, index - 80), index + 200) : plain.slice(0, 200),
        link: "zotero://select/library/items/" + row.noteKey,
      });
    }
    return hits;
  }

  async function searchFulltext(text, limit, collection, tag) {
    var ids = null;
    try {
      ids = await Zotero.Fulltext.findItemsWithContent(text, null);
    } catch (e) {
      zoteroDebug("fulltext index search failed: " + e);
      return [];
    }
    if (!ids || !ids.length) return [];

    var scope = collection ? collectionItemIDs(collection) : null;
    var hits = [];
    for (var i = 0; i < ids.length && hits.length < limit; i++) {
      var attachment = Zotero.Items.get(ids[i]);
      if (!attachment || !attachment.isFileAttachment || !attachment.isFileAttachment()) continue;
      var parent = parentOf(attachment) || attachment;
      if (scope && !scope.has(parent.id)) continue;
      if (tag && !matchesTag(parent, tag)) continue;
      var store;
      try {
        store = await fulltextPages(attachment);
      } catch (e) {
        continue;
      }
      var needle = String(text).toLowerCase();
      for (var page = 0; page < store.pages.length && page < 2000; page++) {
        if (store.pages[page].toLowerCase().indexOf(needle) === -1) continue;
        hits.push({
          kind: "fulltext",
          attachmentKey: attachment.key,
          libraryID: attachment.libraryID,
          itemKey: parent.key,
          title: safeField(parent, "title"),
          year: yearOf(safeField(parent, "date")),
          creatorsLabel: creatorsLabel(parent),
          pageIndex: page,
          pageLabel: pageLabelFor(attachment, page),
          snippet: contextAround(store.pages[page], text, 120),
          link: pdfLink(attachment, page),
        });
        break;
      }
    }
    return hits;
  }

  // ------------------------------------------------------------------ handlers

  function healthData() {
    return {
      zoteroVersion: Zotero.version,
      port: Zotero.Server.port,
      writable: true,
      tokenPresent: Boolean(token),
      profileDir: Zotero.Profile.dir,
      dataDir: Zotero.DataDirectory && Zotero.DataDirectory.dir,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
  }

  async function handlerCurrent(request) {
    var limit = clamp(qp(request, "limit", "5"), 1, 30);
    var selected = await currentSelection();
    var item = selected.item;
    var data = {
      mode: selected.mode,
      page: selected.page,
      item: item ? itemJSON(item) : null,
      attachments: item ? attachmentsJSON(item) : [],
      annotations: [],
      pageAnnotations: [],
      notes: [],
      recent: await recentItems(limit),
    };
    if (item) {
      data.annotations = annotationsFor(item);
      data.notes = notesFor(item).map(function (note) {
        return {
          key: note.key,
          libraryID: note.libraryID,
          title: note.title,
          text: note.text,
          updated: note.updated,
          link: note.link,
        };
      });
      data.annotationCount = data.annotations.length;
      data.noteCount = data.notes.length;
      if (selected.page && Number.isInteger(selected.page.index)) {
        data.pageAnnotations = data.annotations
          .filter(function (annotation) {
            return annotation.pageIndex === selected.page.index;
          })
          .slice(0, 30);
      }
    }
    return data;
  }

  async function handlerItem(request) {
    var key = qp(request, "key");
    if (!key) throw fail("INVALID_ARG", "key is required");
    var libraryID = intOrNull(qp(request, "libraryID"));
    var item = await resolveItem(key, libraryID);
    if (!item) throw fail("NOT_FOUND", "Item not found: " + key);
    var include = String(
      qp(request, "include", "attachments,annotations,notes")
    ).split(",");

    var data = { item: itemJSON(item), links: { select: itemLink(item) } };
    if (item.isAttachment && item.isAttachment()) {
      var parent = parentOf(item);
      data.attachment = attachmentJSON(item);
      data.parent = parent ? itemJSON(parent) : null;
    }
    if (include.indexOf("attachments") !== -1) data.attachments = attachmentsJSON(item);
    if (include.indexOf("annotations") !== -1) data.annotations = annotationsFor(item);
    if (include.indexOf("notes") !== -1) data.notes = notesFor(item);
    return data;
  }

  async function handlerAnnotations(request) {
    var itemKey = qp(request, "itemKey");
    var attachmentKey = qp(request, "attachmentKey");
    var target = null;
    if (attachmentKey) target = await resolveItem(attachmentKey, intOrNull(qp(request, "libraryID")));
    else if (itemKey) target = await resolveItem(itemKey, intOrNull(qp(request, "libraryID")));
    else target = (await currentSelection()).item;
    if (!target) throw fail("NOT_FOUND", "No item or attachment for annotation lookup");
    return { itemKey: target.key, annotations: annotationsFor(target) };
  }

  async function handlerNotes(request) {
    var itemKey = qp(request, "itemKey");
    if (itemKey) {
      var item = await resolveItem(itemKey, intOrNull(qp(request, "libraryID")));
      if (!item) throw fail("NOT_FOUND", "Item not found: " + itemKey);
      return { itemKey: item.key, notes: notesFor(item) };
    }
    var collectionKey = qp(request, "collectionKey");
    if (collectionKey) {
      var collection = await resolveCollection(collectionKey, intOrNull(qp(request, "libraryID")));
      if (!collection) throw fail("NOT_FOUND", "Collection not found: " + collectionKey);
      var ids = collection.getChildItems(true) || [];
      var notes = [];
      for (var i = 0; i < ids.length && notes.length < 200; i++) {
        var item2 = Zotero.Items.get(ids[i]);
        if (!item2) continue;
        notes = notes.concat(notesFor(item2));
      }
      return { collectionKey: collection.key, notes: notes };
    }
    throw fail("INVALID_ARG", "itemKey or collectionKey is required");
  }

  async function handlerFulltext(request) {
    var libraryID = intOrNull(qp(request, "libraryID"));
    var attachmentKey = qp(request, "attachmentKey");
    var itemKey = qp(request, "itemKey");
    var attachment = null;
    if (attachmentKey) attachment = await resolveItem(attachmentKey, libraryID);
    else if (itemKey) {
      var item = await resolveItem(itemKey, libraryID);
      attachment = item ? bestPDF(item) : null;
    }
    if (!attachment) throw fail("NOT_FOUND", "No attachment found");
    if (!attachment.isPDFAttachment || !attachment.isPDFAttachment()) throw fail("NO_PDF", "Attachment is not a PDF");

    return pagesPayload(attachment, {
      pageStart: intOrNull(qp(request, "pageStart")),
      pageEnd: intOrNull(qp(request, "pageEnd")),
      query: qp(request, "query"),
      maxPages: intOrNull(qp(request, "maxPages")),
    });
  }

  async function handlerSearch(request) {
    var text = qp(request, "q");
    if (!text) throw fail("INVALID_ARG", "q is required");
    var scope = qp(request, "scope", "all");
    var limit = clamp(qp(request, "limit", "10"), 1, 40);
    var tag = qp(request, "tag");
    var collectionKey = qp(request, "collectionKey");
    var collection = collectionKey ? await resolveCollection(collectionKey, null) : null;
    if (collectionKey && !collection) throw fail("NOT_FOUND", "Collection not found: " + collectionKey);

    if (scope === "fulltext") {
      var itemKey = qp(request, "itemKey");
      var attachmentKey = qp(request, "attachmentKey");
      if (itemKey || attachmentKey) {
        var target = attachmentKey
          ? await resolveItem(attachmentKey, null)
          : bestPDF(await resolveItem(itemKey, null));
        if (!target) throw fail("NOT_FOUND", "Item has no PDF attachment");
        var payload = await pagesPayload(target, { query: text });
        return {
          query: text,
          scope: "fulltext",
          hits: payload.matches.map(function (match) {
            return {
              kind: "fulltext",
              attachmentKey: target.key,
              libraryID: target.libraryID,
              itemKey: (parentOf(target) || target).key,
              title: safeField(parentOf(target) || target, "title"),
              pageIndex: match.pageIndex,
              pageLabel: match.label,
              snippet: match.context,
              link: match.link,
            };
          }),
        };
      }
      var hits = await searchFulltext(text, limit, collection, tag);
      return { query: text, scope: "fulltext", hits: hits };
    }

    if (scope === "annotation") {
      return { query: text, scope: "annotation", hits: await searchAnnotations(text, limit, collection, tag) };
    }
    if (scope === "note") {
      return { query: text, scope: "note", hits: await searchNotes(text, limit, collection, tag) };
    }
    var itemHits = await searchItemsByText(text, limit, collection, tag);
    var extra = [];
    if (scope === "all") {
      extra = (await searchAnnotations(text, Math.max(2, Math.floor(limit / 2)), collection, tag)).concat(
        await searchNotes(text, Math.max(2, Math.floor(limit / 3)), collection, tag)
      );
    }
    return { query: text, scope: scope, hits: itemHits.concat(extra).slice(0, limit + 6) };
  }

  async function handlerCollections() {
    var collections = [];
    var libraries = [];
    try {
      libraries = Zotero.Libraries.getAll();
    } catch (e) {
      libraries = [];
    }
    for (var i = 0; i < libraries.length; i++) {
      var libraryID = libraries[i].libraryID;
      try {
        var list = Zotero.Collections.getByLibrary(libraryID, true) || [];
        for (var j = 0; j < list.length; j++) {
          var collection = list[j];
          var parent = collection.parentID ? Zotero.Collections.get(collection.parentID) : null;
          collections.push({
            key: collection.key,
            name: collection.name,
            libraryID: libraryID,
            parentKey: parent ? parent.key : null,
            groupID: libraries[i].libraryType === "group" ? libraries[i].groupID : null,
          });
        }
      } catch (e) {
        /* ignore */
      }
    }
    return { collections: collections, recent: await recentItems(10) };
  }

  async function handlerTags(request) {
    var libraryID = intOrNull(qp(request, "libraryID"));
    if (libraryID === null) libraryID = Zotero.Libraries.userLibraryID;
    var limit = clamp(qp(request, "limit", "100"), 1, 500);
    var rows = [];
    try {
      rows = await Zotero.DB.queryAsync(
        "SELECT t.name AS name, COUNT(it.itemID) AS count FROM tags t " +
          "JOIN itemTags it ON it.tagID = t.tagID JOIN items i ON i.itemID = it.itemID " +
          "WHERE i.libraryID = ? GROUP BY t.name ORDER BY count DESC LIMIT " +
          limit,
        [libraryID]
      );
    } catch (e) {
      zoteroDebug("tag listing failed: " + e);
    }
    return {
      libraryID: libraryID,
      tags: (rows || []).map(function (row) {
        return { name: row.name, count: row.count };
      }),
    };
  }

  async function handlerCollectionItems(request) {
    var key = qp(request, "collectionKey");
    if (!key) throw fail("INVALID_ARG", "collectionKey is required");
    var limit = clamp(qp(request, "limit", "50"), 1, 200);
    var collection = await resolveCollection(key, intOrNull(qp(request, "libraryID")));
    if (!collection) throw fail("NOT_FOUND", "Collection not found: " + key);
    var ids = collection.getChildItems(true) || [];
    var items = [];
    for (var i = 0; i < ids.length && items.length < limit; i++) {
      var item = Zotero.Items.get(ids[i]);
      if (!item || item.isNote() || item.isAttachment() || item.isAnnotation()) continue;
      items.push(itemLite(item));
    }
    return { collection: { key: collection.key, name: collection.name, libraryID: collection.libraryID }, items: items, total: ids.length };
  }

  function sanitizeNoteHtml(html) {
    if (typeof html !== "string" || !html.trim()) throw fail("INVALID_ARG", "html is required");
    if (/<\s*(script|iframe|style|object|embed)\b|javascript\s*:|on[a-z]+\s*=/i.test(html)) {
      throw fail("INVALID_ARG", "Unsafe HTML rejected");
    }
    return html.trim();
  }

  async function handlerNoteCreate(request) {
    var body = request.data || {};
    var html = sanitizeNoteHtml(body.html);
    var parent = body.parentItemKey ? await resolveItem(body.parentItemKey, intOrNull(body.libraryID)) : null;
    if (body.parentItemKey && !parent) throw fail("NOT_FOUND", "Parent item not found: " + body.parentItemKey);
    var collection = body.collectionKey ? await resolveCollection(body.collectionKey, intOrNull(body.libraryID)) : null;
    if (body.collectionKey && !collection) throw fail("NOT_FOUND", "Collection not found: " + body.collectionKey);

    var note = new Zotero.Item("note");
    if (parent) {
      note.libraryID = parent.libraryID;
      note.parentItemID = parent.id;
    } else if (collection) {
      note.libraryID = collection.libraryID;
    } else {
      note.libraryID = Zotero.Libraries.userLibraryID;
    }
    note.setNote(Zotero.Notes.notePrefix + html + Zotero.Notes.noteSuffix);
    if (collection) note.addToCollection(collection.id);
    var tags = Array.isArray(body.tags) ? body.tags : [];
    for (var i = 0; i < tags.length; i++) {
      try {
        note.addTag(String(tags[i]), 1);
      } catch (e) {
        /* ignore invalid tag */
      }
    }
    await note.saveTx();
    return {
      noteKey: note.key,
      libraryID: note.libraryID,
      parentKey: parent ? parent.key : null,
      collectionKey: collection ? collection.key : null,
      title: noteTitle(note.getNote()),
      link: itemLink(note),
    };
  }

  async function handlerNoteAppend(request) {
    var body = request.data || {};
    var html = sanitizeNoteHtml(body.html);
    var note = await resolveItem(body.noteKey, intOrNull(body.libraryID));
    if (!note || !note.isNote()) throw fail("NOT_FOUND", "Note not found: " + body.noteKey);
    var current = note.getNote() || Zotero.Notes.defaultNote;
    var insertion = "<hr>" + html;
    var closing = current.lastIndexOf("</div>");
    var next = closing >= 0 ? current.slice(0, closing) + insertion + current.slice(closing) : current + insertion;
    note.setNote(next);
    await note.saveTx();
    return { noteKey: note.key, title: noteTitle(note.getNote()), link: itemLink(note) };
  }

  async function handlerOpen(request) {
    var body = request.data || {};
    var attachment = null;
    if (body.attachmentKey) attachment = await resolveItem(body.attachmentKey, intOrNull(body.libraryID));
    else if (body.itemKey) {
      var item = await resolveItem(body.itemKey, intOrNull(body.libraryID));
      attachment = item ? (item.isFileAttachment() ? item : bestPDF(item)) : null;
    }
    if (!attachment) throw fail("NO_PDF", "No PDF attachment found for the given item");
    if (!attachment.isPDFAttachment || !attachment.isPDFAttachment()) throw fail("NO_PDF", "Attachment is not a PDF");

    var location = {};
    var page = intOrNull(body.page);
    if (page !== null) location.pageIndex = Math.max(0, page - 1);
    if (body.annotationKey) {
      var annotation = await resolveItem(body.annotationKey, attachment.libraryID);
      if (annotation) location.annotationID = annotation.id;
    }
    await Zotero.Reader.open(attachment.id, location, {});
    return {
      attachmentKey: attachment.key,
      itemKey: (parentOf(attachment) || attachment).key,
      page: page,
      annotationKey: body.annotationKey || null,
      link: pdfLink(attachment, location.pageIndex, body.annotationKey || null),
    };
  }

  // -------------------------------------------------------------- registration

  function registerEndpoints() {
    endpoint("health", ["GET"], function () {
      return healthData();
    });
    endpoint("current", ["GET"], handlerCurrent);
    endpoint("item", ["GET"], handlerItem);
    endpoint("annotations", ["GET"], handlerAnnotations);
    endpoint("notes", ["GET"], handlerNotes);
    endpoint("fulltext", ["GET"], handlerFulltext);
    endpoint("search", ["GET"], handlerSearch);
    endpoint("collections", ["GET"], handlerCollections);
    endpoint("collection/items", ["GET"], handlerCollectionItems);
    endpoint("tags", ["GET"], handlerTags);
    endpoint("note", ["POST"], handlerNoteCreate, { write: true });
    endpoint("note/append", ["POST"], handlerNoteAppend, { write: true });
    endpoint("open", ["POST"], handlerOpen, { write: true });
  }

  async function ensureServer() {
    try {
      if (!Zotero.Server.port) {
        zoteroDebug("HTTP server is not running; starting it");
        await Zotero.Server.init();
      }
    } catch (e) {
      zoteroDebug("could not start HTTP server: " + e);
    }
  }

  async function loadOrCreateToken() {
    infoPath = joinPath(Zotero.Profile.dir, INFO_FILE);
    try {
      var existing = await Zotero.File.getContentsAsync(infoPath, "utf-8");
      var parsed = JSON.parse(existing);
      if (parsed && typeof parsed.token === "string" && parsed.token.length >= 16) return parsed.token;
    } catch (e) {
      /* no file yet */
    }
    try {
      return Zotero.Utilities.randomString(32);
    } catch (e) {
      return String(Date.now()) + Math.random().toString(36).slice(2);
    }
  }

  async function writeInfo() {
    var info = {
      api: API_VERSION,
      port: Zotero.Server.port,
      token: token,
      version: pluginVersion,
      zoteroVersion: Zotero.version,
      profileDir: Zotero.Profile.dir,
      updatedAt: Date.now(),
    };
    try {
      await Zotero.File.putContentsAsync(infoPath, JSON.stringify(info, null, 2), "utf-8");
    } catch (e) {
      zoteroDebug("could not write " + infoPath + ": " + e);
    }
  }

  async function startup(options) {
    options = options || {};
    pluginVersion = options.version || pluginVersion;
    startedAt = Date.now();
    await ensureServer();
    token = await loadOrCreateToken();
    registerEndpoints();
    await writeInfo();
    zoteroDebug("started v" + pluginVersion + " on port " + Zotero.Server.port + " (profile " + Zotero.Profile.dir + ")");
  }

  function shutdown() {
    for (var i = 0; i < registered.length; i++) {
      try {
        delete Zotero.Server.Endpoints[registered[i]];
      } catch (e) {
        /* ignore */
      }
    }
    registered = [];
    fulltextCache.clear();
    labelCache.clear();
    zoteroDebug("stopped");
  }

  return {
    startup: startup,
    shutdown: shutdown,
    health: healthData,
    version: function () {
      return pluginVersion;
    },
  };
})();

// Expose the API on the Zotero namespace too, so bootstrap can find it even if
// the loadSubScript global scope differs from the bootstrap scope.
if (typeof Zotero !== "undefined") {
  Zotero.ZoteroLink = ZoteroLink;
}
