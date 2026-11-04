/**
 * HTTP client for the local Zotero Link bridge (the zotero-link Zotero addon).
 *
 * The addon writes {port, token, version} to zoterolink.json in the active
 * Zotero profile directory; this module discovers the newest one. Environment
 * variables ZOTERO_LINK_URL / ZOTERO_LINK_TOKEN override discovery.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const INFO_TTL_MS = 30_000;
const READ_TIMEOUT_MS = 15_000;
const FULLTEXT_TIMEOUT_MS = 60_000;
const WRITE_TIMEOUT_MS = 30_000;

export class BridgeError extends Error {
  constructor(code, message, detail) {
    super(message || code);
    this.name = "BridgeError";
    this.code = code;
    this.detail = detail;
  }
}

export function errorResult(error) {
  if (error instanceof BridgeError) {
    return { ok: false, code: error.code, message: error.message };
  }
  return { ok: false, code: "INTERNAL", message: String((error && error.message) || error) };
}

function profileRoots() {
  const roots = [];
  const appData = process.env.APPDATA;
  if (appData) roots.push(join(appData, "Zotero", "Zotero", "Profiles"));
  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    roots.push(join(home, "AppData", "Roaming", "Zotero", "Zotero", "Profiles"));
    roots.push(join(home, ".zotero", "zotero", "Profiles"));
  }
  return [...new Set(roots)];
}

function newestBridgeInfo() {
  let best = null;
  for (const root of profileRoots()) {
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const file = join(root, entry.name, "zoterolink.json");
      let raw;
      try {
        raw = JSON.parse(readFileSync(file, "utf8"));
      } catch {
        continue;
      }
      if (!raw || !Number.isFinite(Number(raw.port))) continue;
      if (!best || Number(raw.updatedAt || 0) > Number(best.updatedAt || 0)) {
        best = { ...raw, file };
      }
    }
  }
  if (!best) return null;
  return {
    port: Number(best.port),
    token: String(best.token || ""),
    version: String(best.version || ""),
    zoteroVersion: String(best.zoteroVersion || ""),
    updatedAt: Number(best.updatedAt || 0),
    file: best.file,
    baseUrl: `http://127.0.0.1:${Number(best.port)}`,
  };
}

export class Bridge {
  constructor() {
    this._info = null;
    this._infoAt = 0;
    this._cache = new Map();
  }

  info(force = false) {
    if (!force && this._info && Date.now() - this._infoAt < INFO_TTL_MS) return this._info;
    const envUrl = process.env.ZOTERO_LINK_URL;
    const envToken = process.env.ZOTERO_LINK_TOKEN;
    let info;
    if (envUrl) {
      info = {
        baseUrl: String(envUrl).replace(/\/+$/, ""),
        token: String(envToken || ""),
        port: Number((String(envUrl).match(/:(\d+)/) || [])[1] || 0),
        version: "env",
        zoteroVersion: "",
        updatedAt: 0,
        file: null,
      };
    } else {
      info = newestBridgeInfo();
    }
    if (!info) {
      throw new BridgeError(
        "BRIDGE_MISSING",
        "未发现 Zotero 桥接插件：请安装 dist/zotero-link.xpi，并在安装后重启 Zotero"
      );
    }
    this._info = info;
    this._infoAt = Date.now();
    return info;
  }

  async request(path, options = {}) {
    const {
      method = "GET",
      query,
      body,
      write = false,
      timeoutMs = READ_TIMEOUT_MS,
    } = options;
    const info = this.info();
    const url = new URL(path, info.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === "") continue;
        url.searchParams.set(key, String(value));
      }
    }
    const headers = {};
    if (write) headers["X-Zotero-Link-Token"] = info.token || "";
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new BridgeError("TIMEOUT", "Zotero 在预期时间内没有响应");
      }
      throw new BridgeError(
        "ZOTERO_DOWN",
        `连不上 Zotero（127.0.0.1:${info.port || "?"}）：请确认 Zotero 正在运行`
      );
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!payload || typeof payload !== "object") {
      throw new BridgeError("BAD_RESPONSE", `Zotero 桥接返回了无法解析的响应（HTTP ${response.status}）`);
    }
    if (!payload.ok) {
      throw new BridgeError(payload.code || "BRIDGE_ERROR", payload.message || "Zotero 桥接调用失败");
    }
    return payload.data;
  }

  async cached(key, ttlMs, loader) {
    const hit = this._cache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await loader();
    this._cache.set(key, { at: Date.now(), value });
    if (this._cache.size > 64) {
      const oldest = this._cache.keys().next().value;
      this._cache.delete(oldest);
    }
    return value;
  }

  async status() {
    try {
      const info = this.info(true);
      const health = await this.request("/zoterolink/health", { timeoutMs: 4000 });
      return { ok: true, info, health };
    } catch (error) {
      const result = errorResult(error);
      return { ...result, ok: false };
    }
  }

  health() {
    return this.request("/zoterolink/health", { timeoutMs: 4000 });
  }

  current(limit = 5) {
    return this.cached(`current:${limit}`, 2_000, () =>
      this.request("/zoterolink/current", { query: { limit } })
    );
  }

  item(key, include = "attachments,annotations,notes", libraryID) {
    return this.cached(`item:${key}:${include}:${libraryID || ""}`, 30_000, () =>
      this.request("/zoterolink/item", { query: { key, include, libraryID } })
    );
  }

  annotations(params = {}) {
    return this.request("/zoterolink/annotations", { query: params });
  }

  notes(params = {}) {
    return this.request("/zoterolink/notes", { query: params });
  }

  fulltext(params = {}) {
    return this.request("/zoterolink/fulltext", {
      query: params,
      timeoutMs: FULLTEXT_TIMEOUT_MS,
    });
  }

  search(params = {}) {
    return this.request("/zoterolink/search", { query: params });
  }

  collections() {
    return this.cached("collections", 20_000, () => this.request("/zoterolink/collections"));
  }

  collectionItems(collectionKey, limit = 60) {
    return this.request("/zoterolink/collection/items", {
      query: { collectionKey, limit },
    });
  }

  tags(limit = 120) {
    return this.request("/zoterolink/tags", { query: { limit } });
  }

  createNote(payload) {
    return this.request("/zoterolink/note", {
      method: "POST",
      body: payload,
      write: true,
      timeoutMs: WRITE_TIMEOUT_MS,
    });
  }

  appendNote(payload) {
    return this.request("/zoterolink/note/append", {
      method: "POST",
      body: payload,
      write: true,
      timeoutMs: WRITE_TIMEOUT_MS,
    });
  }

  open(payload) {
    return this.request("/zoterolink/open", {
      method: "POST",
      body: payload,
      write: true,
      timeoutMs: WRITE_TIMEOUT_MS,
    });
  }

  /** Accept either an 8-char collection key or a collection name. */
  async resolveCollectionKey(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    if (/^[A-Z0-9]{8}$/.test(text)) return text;
    const data = await this.collections();
    const collections = Array.isArray(data?.collections) ? data.collections : [];
    const exact = collections.find((entry) => entry.name === text);
    if (exact) return exact.key;
    const lower = text.toLowerCase();
    const partial = collections.find((entry) => String(entry.name || "").toLowerCase() === lower);
    if (partial) return partial.key;
    const includes = collections.find((entry) =>
      String(entry.name || "").toLowerCase().includes(lower)
    );
    return includes ? includes.key : null;
  }
}
