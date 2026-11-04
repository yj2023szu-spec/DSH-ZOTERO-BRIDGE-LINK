/**
 * One-shot note previews. A preview stores the exact HTML that will be written,
 * bound to the creating session; commit only accepts the opaque previewId, so a
 * different or regenerated draft can never be written by mistake.
 */
import { randomUUID } from "node:crypto";

export class PreviewStore {
  constructor({ ttlMs = 10 * 60 * 1000, max = 32 } = {}) {
    this.ttlMs = ttlMs;
    this.max = max;
    this._map = new Map();
  }

  _purge() {
    const now = Date.now();
    for (const [id, entry] of this._map) {
      if (entry.expiresAt <= now) this._map.delete(id);
    }
    while (this._map.size > this.max) {
      this._map.delete(this._map.keys().next().value);
    }
  }

  create(sessionId, payload) {
    this._purge();
    const id = randomUUID();
    this._map.set(id, {
      sessionId: String(sessionId || "unknown"),
      payload,
      expiresAt: Date.now() + this.ttlMs,
    });
    return id;
  }

  /** Look up without consuming; callers remove only after a successful write. */
  resolve(id, sessionId) {
    this._purge();
    const entry = this._map.get(String(id || ""));
    if (!entry) return { ok: false, code: "PREVIEW_EXPIRED" };
    if (entry.sessionId !== String(sessionId || "unknown")) {
      return { ok: false, code: "PREVIEW_INVALID" };
    }
    return {
      ok: true,
      payload: entry.payload,
      expiresAt: entry.expiresAt,
      remove: () => this._map.delete(String(id)),
    };
  }
}
