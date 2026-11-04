---
name: zotero-literature
description: 通过 Zotero 文献联动插件（zotero_* 工具）读取当前在读文献、定位原文页码、整理摘录与思考笔记并写回 Zotero，生成每句都能链接回原文的文献综述初稿。Use when the user asks about "this paper" in Zotero, wants exact quotes with page numbers, wants annotations and notes organized into a Zotero note, or wants a literature-review draft traceable to source.
---

# Zotero 文献工作流

这个技能把 Zotero 里的“你正在读的这篇”“你的高亮与笔记”“一组同主题文献”变成可核对、可回溯的写作材料。所有事实只能来自 `zotero_*` 工具返回的数据。

## 一、工具速查

| 需求 | 调用 |
|---|---|
| 我现在读的是哪篇？在哪一页？ | `zotero_current`（先调它；用户说“这篇/本文/当前文献”时必调） |
| 只想要最近读过什么 | `zotero_current` `scope=recent` |
| 找文献（标题/作者/摘要） | `zotero_search` `scope=title` 或 `all` |
| 找我的某条高亮 | `zotero_search` `scope=annotation` |
| 找我的某条笔记 | `zotero_search` `scope=note` |
| 在全文里找原句 | `zotero_search` `scope=fulltext`（带 `collection` 可限集合） |
| 单篇全貌（摘录+笔记+附件） | `zotero_item` `key=<条目/附件 key>` |
| 某篇某几页的原文 | `zotero_pages` `attachmentKey` + `pageStart`/`pageEnd`（页码从 1 开始） |
| “这句话在哪一页？” | `zotero_pages` `query="原句关键词"` → 返回页 + 上下文 + 链接 |
| 看集合/集合里有什么/标签 | `zotero_library` `action=collections|collection-items|tags` |
| 写笔记（先预览） | `zotero_note` `action=preview` → 用户确认 → `action=commit` `previewId` |
| 在 Zotero 打开原文核对 | `zotero_open`（`page` 从 1 开始，可带 `annotationKey`） |

失败码含义：`BRIDGE_MISSING` 未装桥接插件；`ZOTERO_DOWN` Zotero 没开；`PDF_NO_TEXT` 扫描件无文字层；`NO_PDF` 该条目没有 PDF；`PREVIEW_EXPIRED` 预览过期需重新 preview。遇到失败先解释原因，不要改用猜测继续。

## 二、硬规则（引用契约）

1. 每个引用原文的句子都必须带：**印刷页码**（`pageLabel` / `page.label`；没有就写 `PDF p.N`）、**逐字片段**、**`zotero://` 链接**（用工具返回的 `link`，不要自己拼）。
2. 链接里的 `page` 是 PDF 页序号，显示给用户的页码是印刷页码——两者不一致时以工具返回为准。
3. 逐字引用必须能在工具返回文本中匹配（忽略空白/连字符差异）。匹配不上就改成转述并去掉引号。
4. 无法定位到原文的句子写「（未落到原文：待补）」，禁止编造页码、引文、条目或 DOI。
5. 写 Zotero 笔记只能走 `preview → 用户明确同意 → commit`；不得跳过 preview，也不得自行改写 preview 里的内容再 commit。
6. 回答中文，文献原文保持原语言逐字引用；译述不加引号。

引用格式：

```
[Smith 2021, p.2](zotero://open-pdf/library/items/PDF00001?page=2&annotation=ANN00002)
```

来自笔记的内容用 `zotero://select/library/items/<noteKey>`。

## 三、流程 1：就当前文献提问

1. `zotero_current` → 拿到条目、当前页、本页摘录、摘录/笔记数量。若 `mode=recent` 而用户明确说“正在读的”，先说明“检测到的是最近阅读，请确认是不是这篇”。
2. 判断问题属于哪类：
   - 概念/结论：`zotero_pages` `query=<关键词>` → 取命中页与上下文；
   - 方法/数据/识别：`zotero_pages` 读相关页段，必要时 `zotero_item` 看摘要与摘录；
   - “我高亮过什么”：`zotero_item`（默认含 annotations/notes）。
3. 回答结构：**结论一句** → **逐字原文**（页码 + 链接）→ 解释与边界 → 不确定处明说。
4. 若全文抽不出来（`PDF_NO_TEXT`）：明确说明只能依据摘录/笔记回答，并把依据的高亮逐条列出。

## 四、流程 2：整理摘录与思考笔记（写回 Zotero）

1. `zotero_item` 读全量摘录与笔记（注意每条 annotation 的 `pageLabel`、`comment`、`link`）。
2. 按主题聚类，而不是按页码罗列。推荐结构：
   - `## 核心论点`：3–5 条，每条后跟原文引用（页码 + 链接）；
   - `## 方法与证据`：设计、数据、关键假设；引用对应页；
   - `## 我的思考`：把用户 `comment` 与笔记观点归并，保留原话，标注来源高亮；
   - `## 疑问与待核查`：没被原文支持的点。
3. 生成 Markdown 草稿后调用 `zotero_note`：
   `action=preview`、`parentItemKey=<当前条目 key>`（子笔记）或 `collectionKey`（独立笔记入库）、`markdown=<草稿>`。
4. 把工具返回的预览与目标（挂到哪、还是独立笔记）完整展示给用户；**等用户明确说“写入/可以”**再 `action=commit` `previewId=<返回的 id>`。
5. commit 成功后把 `link` 给用户，并提示可在 Zotero 里继续编辑。失败则保留预览、报告错误、不要重复写入。

## 五、流程 3：主题文献综述初稿

1. **定语料**（先确认再写）：
   - 用户给集合 → `zotero_library action=collection-items collection=<名称或 key>`；
   - 用户给主题词 → `zotero_search scope=annotation|note` 找有相关摘录/笔记的文献；
   - 用户说“就这几篇” → 用 `zotero_item` 逐篇读。
   把最终纳入的文献清单（标题、年份、key）先给用户确认，避免范围漂移。
2. **逐篇取材**：对每篇 `zotero_item`，只取与主题相关的摘录/笔记；必要时 `zotero_pages query=` 补原文上下文。记录每条材料的 `itemKey`、页码、链接、类型（annotation/note/fulltext）。
3. **搭大纲**：按主题/机制/证据类型分节，不按文献逐篇介绍。每节先写 1 句论点，再排证据。
4. **写作规则**：
   - 每句话要么有 citation，要么是明确的过渡/总结句（总结句也必须能由前文 citation 支撑）；
   - 同一句多来源 → 多个链接用 `；` 分隔；
   - 引用用户自己的笔记时，明确标注“（我的笔记）”。
5. **落盘**：写到 `E:\zotero\storage\dsh-zotero-link\reviews\<主题>-YYYYMMDD.md`（工作区可写；用户指定别处则按指定）。文件结构：

```markdown
# <主题>：文献综述初稿（YYYY-MM-DD）

> 语料：<N> 篇；检索/集合：<来源>；生成时间：<ISO>

## 1. <主题一>
<每句带 citation 的段落……>

## 2. <主题二>
……

## 研究缺口与可检验假设
……

## 附：引文核对表

| # | 句子摘要 | 来源（作者 年份） | 页码 | 逐字片段 | 链接 | 类型 |
|---|---|---|---|---|---|---|
```

6. **自检（交付前必须做）**：
   - 遍历所有 citation：用 `zotero_item` / `zotero_pages` 确认条目、页码、注解存在；
   - 统计无源句：必须为 0，或已显式「（未落到原文：待补）」；
   - 检查链接页码与显示页码是否对应（page = pageIndex+1，label 是印刷页码）。
7. **可选写回**：用户要求“存到 Zotero”时，用 `zotero_note action=preview`（独立笔记 + `collectionKey`，标签如 `综述初稿`），确认后 commit。

## 六、输出与语气

- 先给结论，再给证据，最后给边界；不写空泛综述套话。
- 每次引用都让用户能在两步内点到原文：页码 + 可点链接。
- 不确定就说不确定，并给出下一步核查方式（例如指定页码/关键词再查）。
