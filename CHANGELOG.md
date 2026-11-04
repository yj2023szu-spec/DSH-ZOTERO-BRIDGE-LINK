# Changelog

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
