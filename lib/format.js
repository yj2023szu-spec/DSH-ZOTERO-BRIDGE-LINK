/**
 * Formatting helpers for the Zotero link plugin: a conservative Markdown to
 * Zotero-note HTML converter, citation helpers, and the text renderers used by
 * the zotero_* tools.
 */

const INLINE_CODE_PLACEHOLDER = "\u0001";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeUrl(value) {
  const url = String(value || "").trim();
  if (/^zotero:/i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") || url.startsWith("#")) return url;
  return null;
}

function inline(raw) {
  let text = escapeHtml(raw);
  const codeSpans = [];
  text = text.replace(/`([^`]+)`/g, (_match, code) => {
    codeSpans.push(`<code>${code}</code>`);
    return `${INLINE_CODE_PLACEHOLDER}${codeSpans.length - 1}${INLINE_CODE_PLACEHOLDER}`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, url) => {
    const safe = safeUrl(url.replace(/&amp;/g, "&"));
    return safe ? `<a href="${escapeHtml(safe)}">${label}</a>` : label;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  text = text.replace(new RegExp(`${INLINE_CODE_PLACEHOLDER}(\\d+)${INLINE_CODE_PLACEHOLDER}`, "g"), (_match, index) => {
    return codeSpans[Number(index)] || "";
  });
  return text;
}

/**
 * Convert the Markdown the agent writes into conservative Zotero-note HTML.
 * Raw HTML in the Markdown is escaped, never passed through.
 */
export function markdownToHtml(markdown) {
  const text = String(markdown ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "");
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  const isBlank = (line) => /^\s*$/.test(line);

  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
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
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 3);
      const content = inline(heading[2].trim());
      out.push(level <= 3 ? `<h${level}>${content}</h${level}>` : `<p><strong>${content}</strong></p>`);
      i += 1;
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      out.push("<hr>");
      i += 1;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*[-*+]\s+/, "").trim()));
        i += 1;
      }
      out.push(`<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*\d+[.)]\s+/, "").trim()));
        i += 1;
      }
      out.push(`<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const parts = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        parts.push(inline(lines[i].replace(/^\s*>\s?/, "").trim()));
        i += 1;
      }
      out.push(`<blockquote><p>${parts.join("<br>")}</p></blockquote>`);
      continue;
    }
    const paragraph = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^\s*(#{1,6}\s|```|[-*+]\s|\d+[.)]\s|>\s?|---)/.test(lines[i])) {
      paragraph.push(inline(lines[i].trim()));
      i += 1;
    }
    if (paragraph.length) out.push(`<p>${paragraph.join("<br>")}</p>`);
    else i += 1;
  }
  return out.join("\n");
}

export function truncate(value, max = 400) {
  const text = String(value ?? "");
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function extractLinks(markdown) {
  const links = [];
  const pattern = /\[([^\]]+)\]\(((?:zotero|https?):\/\/[^)\s]+)\)/g;
  let match;
  const text = String(markdown ?? "");
  while ((match = pattern.exec(text))) {
    links.push({ label: match[1], url: match[2] });
  }
  return links;
}

function pageLabelOf(annotation) {
  if (!annotation) return "";
  if (annotation.pageLabel) return `p.${annotation.pageLabel}`;
  if (Number.isInteger(annotation.pageIndex)) return `PDF p.${annotation.pageIndex + 1}`;
  return "";
}

function quoteOf(text, max = 160) {
  return truncate(String(text || "").replace(/\s+/g, " ").trim(), max);
}

export function renderCurrent(data) {
  const lines = [];
  if (!data || !data.item) {
    lines.push("当前没有检测到 Zotero 正在阅读或选中的文献。");
    if (Array.isArray(data?.recent) && data.recent.length) {
      lines.push("最近阅读：");
      for (const row of data.recent.slice(0, 5)) {
        lines.push(`- ${row.title}${row.year ? ` (${row.year})` : ""}${row.pageLabel ? ` p.${row.pageLabel}` : ""} — ${row.link}`);
      }
    }
    return lines.join("\n");
  }

  const item = data.item;
  const page = data.page || {};
  lines.push(`当前文献：${item.title || "(无标题)"}`);
  lines.push(`条目 key：${item.key} · libraryID：${item.libraryID} · 类型：${item.itemType || ""}`);
  const meta = [item.creatorsLabel, item.year].filter(Boolean).join(" · ");
  if (meta) lines.push(`作者/年份：${meta}`);
  if (Array.isArray(item.collections) && item.collections.length) {
    lines.push(`集合：${item.collections.map((entry) => entry.name).join(" / ")}`);
  }
  if (data.page) {
    const label = page.label ? `p.${page.label}` : Number.isInteger(page.index) ? `PDF p.${page.index + 1}` : "未知页码";
    lines.push(`当前位置：${label}（${page.source || "reader"}）`);
  }
  lines.push(`摘录 ${data.annotationCount ?? 0} 条 · 笔记 ${data.noteCount ?? 0} 条 · 附件 ${(data.attachments || []).length} 个`);
  lines.push(`整条链接：${item.link}`);

  if (Array.isArray(data.pageAnnotations) && data.pageAnnotations.length) {
    lines.push("", "本页摘录：");
    for (const annotation of data.pageAnnotations.slice(0, 5)) {
      lines.push(`- ${pageLabelOf(annotation)} 高亮：${quoteOf(annotation.text)} — ${annotation.link}`);
    }
  }
  if (Array.isArray(data.recent) && data.recent.length) {
    lines.push("", "最近阅读：");
    for (const row of data.recent.slice(0, 3)) {
      lines.push(`- ${row.title}${row.year ? ` (${row.year})` : ""}${row.pageLabel ? ` p.${row.pageLabel}` : ""} — ${row.link}`);
    }
  }
  return lines.join("\n");
}

export function renderItem(data) {
  const item = data.item || {};
  const lines = [`条目：${item.title || "(无标题)"}`, `key：${item.key} · libraryID：${item.libraryID} · 类型：${item.itemType || ""}`];
  const meta = [item.creatorsLabel, item.year, item.publicationTitle].filter(Boolean).join(" · ");
  if (meta) lines.push(meta);
  if (item.DOI) lines.push(`DOI：${item.DOI}`);
  if (item.url) lines.push(`URL：${item.url}`);
  if (item.link) lines.push(`链接：${item.link}`);

  if (Array.isArray(item.collections) && item.collections.length) {
    lines.push(`集合：${item.collections.map((entry) => entry.name).join(" / ")}`);
  }
  if (Array.isArray(item.tags) && item.tags.length) lines.push(`标签：${item.tags.join(", ")}`);
  if (item.abstractNote) lines.push("", "摘要：", truncate(item.abstractNote, 900));

  if (Array.isArray(data.attachments) && data.attachments.length) {
    lines.push("", "附件：");
    for (const attachment of data.attachments) {
      lines.push(`- ${attachment.filename || attachment.key}${attachment.isPDF ? "（PDF）" : ""} — ${attachment.link}`);
    }
  }
  if (Array.isArray(data.annotations) && data.annotations.length) {
    lines.push("", `摘录（${data.annotations.length} 条，显示前 12 条）：`);
    for (const annotation of data.annotations.slice(0, 12)) {
      const comment = annotation.comment ? ` —— 我的评论：${truncate(annotation.comment, 120)}` : "";
      lines.push(`- ${pageLabelOf(annotation)} ${annotation.type || "highlight"}：${quoteOf(annotation.text, 200)}${comment} — ${annotation.link}`);
    }
  }
  if (Array.isArray(data.notes) && data.notes.length) {
    lines.push("", `笔记（${data.notes.length} 条，显示前 6 条）：`);
    for (const note of data.notes.slice(0, 6)) {
      lines.push(`- ${note.title || "(无标题笔记)"} — ${note.link}`);
      if (note.text) lines.push(`  ${quoteOf(note.text, 240)}`);
    }
  }
  return lines.join("\n");
}

export function renderSearch(data) {
  const lines = [`搜索「${data.query}」（${data.scope || "all"}）：${(data.hits || []).length} 条命中`];
  for (const hit of (data.hits || []).slice(0, 20)) {
    const where = hit.pageLabel ? `p.${hit.pageLabel}` : Number.isInteger(hit.pageIndex) ? `PDF p.${hit.pageIndex + 1}` : "";
    const title = hit.title || hit.itemKey || "(未知条目)";
    const kind = hit.kind || "item";
    lines.push(`- [${kind}] ${title}${hit.year ? ` (${hit.year})` : ""}${where ? ` ${where}` : ""}`);
    if (hit.snippet) lines.push(`  ${quoteOf(hit.snippet, 260)}`);
    if (hit.link) lines.push(`  ${hit.link}`);
  }
  return lines.join("\n");
}

export function renderPages(data) {
  if (data && Array.isArray(data.matches)) {
    const lines = [`「${data.query}」在全文中的命中：${data.matches.length} 处（共 ${data.totalPages} 页）`];
    for (const match of data.matches.slice(0, 20)) {
      const label = match.label ? `p.${match.label}` : `PDF p.${match.pageIndex + 1}`;
      lines.push(`- ${label}：${quoteOf(match.context, 300)} — ${match.link}`);
    }
    return lines.join("\n");
  }
  const lines = [`全文第 ${data.pageStart + 1}–${data.pageEnd + 1} 页 / 共 ${data.totalPages} 页${data.truncated ? "（已截断，可继续取下一页段）" : ""}`];
  for (const page of data.pages || []) {
    const label = page.label ? `p.${page.label}` : `PDF p.${page.index + 1}`;
    lines.push("", `—— ${label} ——`, truncate(page.text, 6000), page.link ? `链接：${page.link}` : "");
  }
  return lines.join("\n");
}

export function renderCollections(data) {
  const lines = [`集合 ${(data.collections || []).length} 个`];
  for (const collection of (data.collections || []).slice(0, 80)) {
    lines.push(`- ${collection.name}（key ${collection.key}${collection.groupID ? `，组 ${collection.groupID}` : ""}）`);
  }
  if (Array.isArray(data.items)) {
    lines.push("", `集合内文献 ${data.items.length} 篇：`);
    for (const item of data.items.slice(0, 80)) {
      lines.push(`- ${item.title}${item.year ? ` (${item.year})` : ""} — key ${item.key}`);
    }
  }
  if (Array.isArray(data.tags)) {
    lines.push("");
    for (const tag of data.tags.slice(0, 80)) lines.push(`- ${tag.name}（${tag.count}）`);
  }
  if (Array.isArray(data.recent)) {
    lines.push("", "最近阅读：");
    for (const row of data.recent.slice(0, 10)) {
      lines.push(`- ${row.title}${row.pageLabel ? ` p.${row.pageLabel}` : ""} — ${row.link}`);
    }
  }
  return lines.join("\n");
}

export function renderNotePreview(data) {
  const lines = [
    "Zotero 笔记预览（尚未写入）",
    `previewId：${data.previewId}`,
    `目标：${data.target}`,
    `模式：${data.mode === "append" ? "追加到现有笔记" : "新建笔记"}`,
    `字符数：${data.chars}`,
    "",
    "—— 正文预览 ——",
    truncate(data.text, 4000),
  ];
  if (Array.isArray(data.links) && data.links.length) {
    lines.push("", `引文链接（${data.links.length} 条）：`);
    for (const link of data.links.slice(0, 40)) lines.push(`- [${link.label}](${link.url})`);
  }
  lines.push("", `确认写入：调用 zotero_note，action=commit，previewId=${data.previewId}（10 分钟内有效）。`);
  return lines.join("\n");
}

export function renderNoteCommit(data) {
  return [
    `已写入 Zotero 笔记：${data.title || data.noteKey}`,
    `noteKey：${data.noteKey}`,
    `模式：${data.mode === "append" ? "追加" : "新建"}`,
    `链接：${data.link}`,
  ].join("\n");
}

export function renderOpen(data) {
  return [
    "已在 Zotero 中打开。",
    `附件：${data.attachmentKey}${data.page ? ` · 第 ${data.page} 页` : ""}${data.annotationKey ? ` · 高亮 ${data.annotationKey}` : ""}`,
    `链接：${data.link}`,
  ].join("\n");
}

export function renderError(result) {
  const code = result?.code || "ERROR";
  const message = result?.message || "未知错误";
  const hints = {
    BRIDGE_MISSING: "请安装 Zotero 桥接插件（dist/zotero-link.xpi）并重启 Zotero。",
    ZOTERO_DOWN: "请先打开 Zotero；Zotero 运行后会自动重连。",
    TIMEOUT: "Zotero 响应超时；大 PDF 首次抽取全文可能较慢，可缩小页码范围重试。",
    TOKEN_INVALID: "桥接 token 失效：重装或更新 Zotero 桥接插件后重试。",
    PDF_NO_TEXT: "该 PDF 没有文字层（扫描件），只能依据摘录与笔记回答。",
    NO_PDF: "该条目没有 PDF 附件。",
    NOT_FOUND: "没有找到对应条目或附件，请核对 key。",
    PREVIEW_EXPIRED: "笔记预览已过期（10 分钟），请重新 preview。",
    PREVIEW_INVALID: "笔记预览不属于当前会话，请重新 preview。",
  };
  return [ `调用失败（${code}）：${message}`, hints[code] || "" ].filter(Boolean).join("\n");
}
