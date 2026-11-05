# Changelog

## 0.1.6 — 2026-11-05

### Added
- **工作区选择**：面板顶部下拉列出 DSH 工作区，新建的文献会话落在所选工作区。
- **每篇文献独立对话**：按 Zotero 条目 key 绑定会话，切换文献自动切换到该文献自己的对话，互不混用；工作区里检测不到该文献的会话时自动新建（Host 侧 `agents.create`，不跳转视图）。
- **会话自愈**：校验映射的会话是否仍属于当前工作区且未被归档；失效则清除映射并重建，并自动 `attachSession` 挂载到工作区。
- **回答 Markdown 渲染**：标题、列表、引用块、代码、链接按 Markdown 显示；「复制回答 / 复制为笔记」仍复制原始 Markdown。
- 面板显示提问失败的真实原因（`turn/end` 错误），不再只提示“发送成功”。

### Fixed
- 打开文献面板时自动建会话、把主视图抢到新对话的问题（移除自动跟随与会跳转的 `startSession`）。
- 删除/归档对话后仍复用旧会话、不新建的问题（归档集合纳入校验）。
- 新建会话缺少 provider/model，导致“发送成功但没有对话”的问题（解析默认模型；恢复时补 `agentOptions`，live 会话用 `model.select` 修复）。
- 会话无法恢复时改为明确报错，不再静默回退到别的对话。

## 0.1.5 — 2026-11-04

### Added
- **面板内问答**：左侧「文献」面板可直接把问题投递到当前会话（`POST /zotero-link/api/ask`，`agent.followup` 唤醒 Agent），无需切到对话视图。
- **回答回显**：面板显示「最近回答」（`GET /zotero-link/api/transcript`），只取最后一个已完成回合的最终 assistant 文本，过滤 reasoning、tool-call 与中间进度叙述；生成中显示「正在生成回答…」。
- 一键「复制为笔记」（问 + 答 + 出处链接，Markdown）与「复制回答」。
- 会话探测（`conversation.composer.dock`）记录当前会话并缓存到 localStorage，面板据此定位目标会话。
- 桥接插件版本号对齐到 0.1.5（与 0.1.4 功能相同，仅版本一致，便于整套安装）。

### Fixed
- 面板转发问题时不再重复拼接提问模板（客户端只发原始问题，Host 统一补上下文）。
- `/zotero-link/api/status` 不再把写 token 返回给浏览器。

## 0.1.4 — 2026-11-04

### Fixed
- **Windows 路径分隔符导致配置写盘失败**：`zoterolink.json` 曾以 `C:\...\profile/zoterolink.json` 这种混合分隔符路径写入，Gecko 的 `OS.File` 直接抛 `NS_ERROR_FILE_UNRECOGNIZED_PATH`，导致桥接配置从未生成、DSH 一直显示未连接。现统一使用 `PathUtils.join` 生成本机路径（`zotero-addon/content/zoterolink.js`、`zotero-addon/bootstrap.js`）。
- 启动自检日志改为多路径兜底（Zotero profile → 数据目录 → `Zotero.File`），日志文件 `zoterolink-boot.log` 可直接定位启动问题。

## 0.1.3 — 2026-11-04

### Fixed
- 移除 bootstrap 中对 `Zotero.initializationPromise` 的等待：Zotero 的 `Plugins.init()` 早于该 promise 完成，等待会造成插件启动死锁。
- 新增 `zoterolink-boot.log` 启动自检日志。

## 0.1.2 — 2026-11-04

### Fixed
- 补齐 Zotero 10 插件清单必填项 `applications.zotero.update_url`（缺失会被判定“不兼容”）。
- 版本区间改为 Zotero 10 原生写法：`strict_min_version: 10.0` / `strict_max_version: 11.*`。

## 0.1.1 — 2026-11-04

### Added
- 插件图标（48/96 PNG）、`prefs.js`。
- 使用 Python `zipfile` 固定打包方式，避免压缩工具差异。

## 0.1.0 — 2026-11-04

### Added
- Zotero 桥接插件：`/zoterolink/health|current|item|annotations|notes|fulltext|search|collections|collection/items|tags|note|note/append|open`。
- DSH bundle `@local/dsh-zotero-link`：7 个 `zotero_*` 工具、`/zotero-link/api/*`、左侧「文献」面板、会话视图与系统提示契约。
- 笔记两段式写入（`preview` → 用户确认 → `commit`，10 分钟有效、绑定会话）。
- 引用契约：`zotero://open-pdf/library/items/<attachmentKey>?page=<pageIndex+1>&annotation=<annotationKey>`。
- 测试：离线契约测试、Zotero 运行时桩测试、活桥接冒烟脚本。
