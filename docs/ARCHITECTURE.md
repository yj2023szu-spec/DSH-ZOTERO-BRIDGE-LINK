# 架构与接口契约

## 1. 组件与信任边界

```text
Zotero 主进程                               DSH Host 进程                         DSH 浏览器
┌──────────────────────────────┐          ┌───────────────────────────┐        ┌──────────────────┐
│ zotero-link XPI (bootstrap)  │          │ @local/dsh-zotero-link    │        │ 左侧「文献」面板   │
│  - 端点 /zoterolink/*        │◀──HTTP──│  - lib/bridge.js (客户端)  │        │ 会话「文献」视图   │
│  - PDFWorker / Items / Notes │  127.0.0.1│  - 7 个 zotero_* 工具      │◀─fetch─│ 同源 /zotero-link │
│  - zoterolink.json (token)   │          │  - /zotero-link/api/*      │        │ /api/*            │
└──────────────────────────────┘          └───────────────────────────┘        └──────────────────┘
```

- **信任边界**：只有 Zotero 主进程能访问 Zotero 数据；DSH 不碰 `zotero.sqlite`。
- **凭据**：写端点需要 token；token 由插件生成并写入 Zotero 配置目录，DSH 只读该文件。
- **网络**：全部本机回环，无外联。

## 2. Zotero 桥接端点

所有成功响应：`{ ok: true, data, meta: { api: 1, version, fetchedAt } }`
失败响应：`{ ok: false, code, message }`，HTTP 状态按 `code` 映射（`TOKEN_INVALID` 403、`INVALID_ARG` 400、`NOT_FOUND` 404、其余 500）。

| 方法 | 路径 | 参数 | data 要点 |
|---|---|---|---|
| GET | `/zoterolink/health` | — | `zoteroVersion, port, writable, tokenPresent, profileDir, dataDir, uptimeSeconds` |
| GET | `/zoterolink/current` | `limit?` | `mode, page{index,label,source}, item, attachments, annotations, pageAnnotations, notes, annotationCount, noteCount, recent` |
| GET | `/zoterolink/item` | `key`, `libraryID?`, `include?` | `item, attachments, annotations, notes, links` |
| GET | `/zoterolink/annotations` | `itemKey?`, `attachmentKey?`, `libraryID?` | `itemKey, annotations[]`（含 `pageLabel/pageIndex/link`） |
| GET | `/zoterolink/notes` | `itemKey?`, `collectionKey?` | `notes[]`（key/title/text/html/updated/link） |
| GET | `/zoterolink/fulltext` | `attachmentKey?`, `itemKey?`, `pageStart?`, `pageEnd?`, `query?`, `maxPages?` | 分页 `{pages[], totalPages, truncated}` 或定位 `{matches[], totalPages}` |
| GET | `/zoterolink/search` | `q`, `scope=all\|title\|annotation\|note\|fulltext`, `collectionKey?`, `tag?`, `itemKey?`, `limit?` | `hits[]`（`kind, title, year, pageLabel/pageIndex, snippet, link`） |
| GET | `/zoterolink/collections` | — | `collections[]`, `recent[]` |
| GET | `/zoterolink/collection/items` | `collectionKey`, `limit?` | `collection, items[], total` |
| GET | `/zoterolink/tags` | `libraryID?`, `limit?` | `tags[{name,count}]` |
| POST | `/zoterolink/note` | `{ parentItemKey?, collectionKey?, tags?, html }` + token | `noteKey, link, title, parentKey, collectionKey` |
| POST | `/zoterolink/note/append` | `{ noteKey, html }` + token | `noteKey, link, title` |
| POST | `/zoterolink/open` | `{ itemKey?\|attachmentKey?, page?, annotationKey? }` + token | `attachmentKey, itemKey, page, link` |

### 错误码

`BRIDGE_MISSING`（DSH 侧发现失败）、`ZOTERO_DOWN`、`TIMEOUT`、`TOKEN_INVALID`、`NOT_FOUND`、`NO_PDF`、`PDF_NO_TEXT`、`PDF_ERROR`、`INVALID_ARG`、`BAD_RESPONSE`、`INTERNAL`。

### 当前文献判定（`/current`）

1. **活动 PDF 阅读器**：`Zotero.getMainWindow().Zotero_Tabs`（`selectedType === 'reader'`）→ `Zotero.Reader.getByTabID(id)` → 附件 → 父条目；页码取 reader 内部 `pageIndex`，取不到回退 `attachment.getAttachmentLastPageIndex()`。
2. **库内选中项**：`Zotero.getActiveZoteroPane().getSelectedItems()`；附件取父条目，页码取 lastRead。
3. **最近阅读**：`itemAttachments.lastRead` 最大者。

### 全文与页码

- `Zotero.PDFWorker.getFullText(attachmentID, null)` 返回整篇文本，按 `\f` 分页；缓存 5 分钟/附件。
- 单次最多返回 30 页，默认 8 页；超出标记 `truncated`。
- **页码语义**：`pageIndex` 为 0 基 PDF 页序号；`pageLabel` 为印刷页码（仅能从该页注解获得）。二者不可混用：
  - 链接参数 `page` = `pageIndex + 1`（Zotero 协议处理源码：`location.pageIndex = parseInt(page) - 1`）
  - 正文展示优先 `pageLabel`，缺失时显示 `PDF p.N`

### 笔记写入

- 新建：`new Zotero.Item('note')` → `setNote('<div class="zotero-note znv1">' + html + '</div>')`（`setNote` 不自动包裹，必须手动）→ 可选 `addToCollection` / `addTag` → `saveTx()`。
- 追加：取 `getNote()`，在末尾 `</div>` 前插入 `<hr>` + 新 HTML，再 `setNote` + `saveTx`。
- HTML 白名单/拒绝：`<script|iframe|style|object|embed>`、`javascript:`、`on*=` 直接拒绝 `INVALID_ARG`。

## 3. DSH 插件

### 工具

| 工具 | 主要参数 | 返回/行为 |
|---|---|---|
| `zotero_current` | `scope=auto\|recent`, `limit?` | 当前文献与页；用户说“这篇”时必须先调 |
| `zotero_library` | `action=collections\|collection-items\|recent-items\|tags`, `collection?`, `limit?` | 语料范围 |
| `zotero_search` | `query`, `scope?`, `collection?`, `tag?`, `itemKey?`, `limit?` | 命中 + 页码 + 上下文 |
| `zotero_item` | `key`, `include?` | 单篇全貌 |
| `zotero_pages` | `attachmentKey?`, `itemKey?`, `pageStart?`(1-based), `pageEnd?`, `query?`, `maxPages?` | 分页文本 / 定位 |
| `zotero_note` | `action=preview\|commit`, `previewId?`, `parentItemKey?`, `noteKey?`, `collectionKey?`, `tags?`, `markdown?` | 两段式写笔记 |
| `zotero_open` | `itemKey?`, `attachmentKey?`, `page?`, `annotationKey?` | 在 Zotero 定位 |

### 笔记预览状态机

```text
preview(markdown, target) ──▶ PreviewStore{ id, sessionId, payload, expiresAt=+10min }
        │                                   │
        │ 展示预览给用户                      │ commit(previewId)
        ▼                                   ▼
   用户确认 ───────────────────────▶ 校验：存在? 同会话? 未过期? --否--> PREVIEW_EXPIRED / PREVIEW_INVALID
                                            │是
                                            ▼
                                  调桥接写入 → 成功后删除预览
                                            │失败
                                            ▼
                                  保留预览可重试（错误上抛）
```

### Web API（给「文献」面板/视图）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/zotero-link/api/status` | 桥接状态（含 `BRIDGE_MISSING / ZOTERO_DOWN / OK`） |
| GET | `/zotero-link/api/current` | 当前文献 + 本页摘录 + 最近阅读（页面 5s 轮询） |
| GET | `/zotero-link/api/item?key=` | 摘录/笔记列表 |
| GET | `/zotero-link/api/transcript?sessionId=&limit=` | 最近问答；只取最后一个**已完成 turn** 的最终 assistant 文本（过滤 reasoning / tool-call / 中间叙述） |
| POST | `/zotero-link/api/ask` | 把问题作为用户消息投递到当前会话（`agent.followup`）；`sessionId` 缺省时取最近活跃 root agent，支持 `dryRun` |
| POST | `/zotero-link/api/open` | 打开原文（转发桥接 `open`） |

面板是 root 作用域，拿不到会话输入框的写入权限，因此「发送到对话」走 Host 投递；回答由 `/transcript` 从会话日志读取并回显。客户端通过 `conversation.composer.dock` 的会话探测组件记录当前 `sessionId`（并缓存到 localStorage）供面板使用。

### 系统提示契约（摘要）

- 用户说「这篇/本文」→ 先 `zotero_current`，禁止猜测。
- 引用必须给：印刷页码 + 逐字片段 + `zotero://` 链接。
- 写笔记必须 `preview` → 用户同意 → `commit`。
- 综述每句带 citation；无法定位写「（未落到原文：待补）」；禁止编造页码/引文/条目。

## 4. 引用契约

```markdown
[Smith 2021, p.2](zotero://open-pdf/library/items/PDF00001?page=2&annotation=ANN00002)
```

- 分组库前缀由桥接生成：`zotero://open-pdf/groups/<groupID>/items/<key>?page=...`
- 来自笔记：`zotero://select/library/items/<noteKey>`
- 多来源一句用 `；` 分隔，逐条可点。
- 交付前自检：逐条验证条目/注解/页码存在；统计无源句，必须为 0 或已显式标注。

## 5. 已知限制

- 文本层缺失（扫描件）只能依据摘录/笔记回答（`PDF_NO_TEXT`）。
- 超大 PDF 首次抽取较慢：分页窗口 + 5 分钟缓存 + 单次 30 页上限。
- 分组库只做只读与单篇写入；不做跨库批量综述。
- 不写注解/高亮，只写笔记。
- 不做 Zotero 内部聊天面板（Zotero 侧是纯后台桥接）。
