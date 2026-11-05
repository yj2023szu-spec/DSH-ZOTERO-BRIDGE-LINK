# DSH × Zotero Link

把你在 Zotero 里读的那篇论文，接进 DeepSeek Harness：**问本文问题、逐字定位原文、整理摘录与笔记、生成每句都能链接回原文的文献综述初稿。**

> 一句话：Zotero 负责读和存，DSH 负责问和写，`zotero://` 链接负责把每一句话送回原文。

[English summary](#english) · [安装](docs/INSTALL.md) · [架构](docs/ARCHITECTURE.md) · [排错](docs/TROUBLESHOOTING.md) · [贡献者](CONTRIBUTORS.md)

---

## 能做什么

| 能力 | 说明 |
|---|---|
| **当前文献感知** | 自动识别你在 Zotero 正在读的 PDF 标签页、当前页、本页摘录；切换文献自动跟随 |
| **带页码的原文问答** | 回答带逐字引文、印刷页码和 `zotero://` 链接；`zotero_pages` 可按关键词定位到具体页 |
| **摘录与思考整理** | 读取某篇/某集合的全部高亮、评论、笔记，按主题整理成结构化笔记 |
| **写回 Zotero** | 两段式写入：先 `preview` 给你看，确认后 `commit` 才落库；支持子笔记、独立笔记 + 集合、追加 |
| **文献综述初稿** | 按主题/集合生成 `reviews/*.md`，每句带 citation，附「引文核对表」；可再存回 Zotero 笔记 |
| **两个入口** | DSH 左侧「文献」面板 + 会话顶部「文献」视图；也可直接在对话里问 |
| **每篇文献一个对话** | 面板绑定当前文献的专属会话；切换文献自动切换，工作区里没有就自动新建，删除/归档后自动重建 |
| **工作区选择** | 面板顶部选择会话所在工作区（如「文献协助阅读」），新建会话落在该工作区并在侧边栏可见 |
| **面板内问答** | 左侧面板直接发送问题，最终回答以 Markdown 渲染显示回面板（不含思考过程），可一键「复制为笔记」 |
| **摘录 → 笔记** | 读取条目下 PDF 高亮/评论与子笔记，按主题整理；先 `preview` 再写入 |

## 架构

```text
┌─────────────┐   /zoterolink/*  (127.0.0.1:23119, JSON)   ┌──────────────────────────────┐
│   Zotero 10 │ ◀───────────────────────────────────────── │ Zotero Link Bridge (XPI)      │
│  PDF 阅读器  │   读：免 token；写：X-Zotero-Link-Token      │ 当前阅读 / 全文分页 / 摘录 / 笔记 │
└─────────────┘                                            └──────────────┬───────────────┘
                                                                          │ HTTP（Host 侧）
┌──────────────────────────────┐                                          │
│ DSH「文献」面板 / 会话视图      │ ◀── /zotero-link/api/* ──┐               │
│ 7 个 zotero_* 工具 + 系统提示   │ ── tools ───────────────▶ │ @local/dsh-zotero-link │
└──────────────────────────────┘                           └────────────────────────┘
```

- **不读 `zotero.sqlite`**：Zotero 运行时会锁库，桥接插件走 Zotero 内部 API。
- **不用 Zotero Local API**：不需要在设置里开 Local API、也不需要授权弹窗。
- **只监听本机**：Zotero 自带 HTTP 服务仅绑定 `127.0.0.1`；写操作额外要求 token。

## 目录

```text
zotero-addon/            Zotero 桥接插件源码（manifest / bootstrap / content）
dist/zotero-link.xpi     可直接安装的插件包（v0.1.6）
index.js, lib/, client.js DSH bundle：工具、Web API、左侧面板与会话视图
locale/, icon.svg        DSH 插件展示元数据
scripts/                 构建、安装、契约/桩/活桥接冒烟测试
skill/zotero-literature/ 详细工作流技能（可选安装到 ~/.agents/skills）
docs/                    安装、架构、排错
reviews/                 综述草稿默认输出目录（用户内容，默认不入库）
```

## 快速开始

**1. 安装 Zotero 桥接插件**（二选一）

- 插件对话框：Zotero → 工具 → 插件 → 齿轮 → *Install Add-on From File* → 选 `dist/zotero-link.xpi`，然后重启 Zotero。
- 或直接侧载（推荐，跳过对话框）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-zotero-addon.ps1
```

**2. 安装 DSH 插件**

在 DSH 里让 Agent 执行（或手动在插件管理里安装本目录）：

```text
plugin_manager action=install_bundle target=<本仓库绝对路径>
```

安装后**刷新一次 DSH 页面**：左侧栏出现「文献」图标，会话顶部出现「文献」视图。

**3. 验证**

```powershell
node scripts/smoke.mjs          # 离线契约（Markdown、渲染、预览、mock 桥接）
node scripts/test-addon.mjs     # Zotero 运行时桩（端点逻辑）
node scripts/smoke-bridge.mjs   # 连接活 Zotero（当前文献 / 全文 / 检索 / token）
```

或在 DSH 侧访问 `http://127.0.0.1:<DSH端口>/zotero-link/api/status`。

## 使用

### 提问本文

直接问：「**这篇的识别策略和核心结论是什么？给出原文页码**」。Agent 会先 `zotero_current` 定位真实条目与页码，再用 `zotero_pages` 找原文，回答形如：

```markdown
作者把安慰剂检验定义为…（Bae 等, 2011, p.3）：
> "the same research design to a setting where the treatment should not matter"
[打开原文](zotero://open-pdf/library/items/MX237PE4?page=3&annotation=XXXX)
```

### 整理摘录 → Zotero 笔记

说「**把这篇的摘录和我的评论整理成笔记**」→ 拿到 `preview`（含目标、预览全文、引文链接）→ 你说「写入」→ Agent `commit`。预览 10 分钟有效、绑定当前会话，过期或跨会话会被拒绝。

### 主题综述

说「**用集合「X」写一份关于 Y 的综述初稿**」→ 先确认纳入文献清单 → 生成 `reviews/Y-YYYYMMDD.md` → 每句带 citation，附「引文核对表」（句 / 来源 / 页码 / 逐字片段 / 链接 / 类型）。

### 工具一览

| 工具 | 作用 |
|---|---|
| `zotero_current` | 当前阅读文献 + 页码 + 本页摘录 |
| `zotero_library` | 集合树 / 集合内文献 / 最近阅读 / 标签 |
| `zotero_search` | 标题摘要、摘录、笔记、全文检索（带页码与上下文） |
| `zotero_item` | 单篇完整资料（元数据、附件、摘录、笔记） |
| `zotero_pages` | PDF 分页原文 / 关键词定位到页 |
| `zotero_note` | `preview` → `commit` 写 Zotero 笔记 |
| `zotero_open` | 在 Zotero 打开到指定页/高亮 |

## 安全

- 桥接只监听 `127.0.0.1`；Zotero 内置会拦截浏览器来源的请求。
- 写端点要求 `X-Zotero-Link-Token`；token 与端口写在 Zotero 配置目录的 `zoterolink.json`，仅本用户可读。
- DSH 插件从不直接读写 `zotero.sqlite`；写笔记前必须经 `preview` 确认。
- 插件不含任何网络外联：全文与元数据都来自本机 Zotero。

## 兼容性

- Zotero **10.x**（在 10.0.7 验证；`strict_min_version: 10.0`）
- DeepSeek Harness：Node 24 运行时（`fetch`、`AbortSignal.timeout`）
- Windows（路径处理已按 Windows 原生分隔符修正；macOS/Linux 理论可用但未验证）

## 排错

先看 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。最常用的两处日志：

- Zotero 配置目录：`zoterolink-boot.log`（插件启动每一步）
- Zotero 配置目录：`zoterolink.json`（端口 + token；DSH 靠它发现桥接）

## 开发

```powershell
# 重新打包 XPI（.NET ZipArchive，manifest 在根目录）
powershell -ExecutionPolicy Bypass -File scripts/build-xpi.ps1

# 契约测试
node scripts/smoke.mjs
node scripts/test-addon.mjs
```

引用契约、端点表、页面状态机见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 贡献

见 [CONTRIBUTORS.md](CONTRIBUTORS.md)：**yj2023szu-spec（一）** 与 **DeepSeek Harness AI（二）**。

## License

[MIT](LICENSE)

---

<a id="english"></a>
## English summary

**DSH × Zotero Link** connects DeepSeek Harness to the Zotero paper you are reading. A small Zotero add-on (`zotero-addon/`, shipped as `dist/zotero-link.xpi`) exposes `/zoterolink/*` on Zotero's local HTTP server with the active reader item, page-accurate PDF text, annotations, notes and note writing. The DSH bundle (`@local/dsh-zotero-link`) provides seven `zotero_*` tools, a `/zotero-link` web API, a left-sidebar **Library** panel and a conversation view. Answers carry verbatim quotes, printed page labels and `zotero://` links; note writes are two-phase (`preview` → user confirmation → `commit`); literature-review drafts are produced as Markdown with per-sentence citation links and a citation audit table.
