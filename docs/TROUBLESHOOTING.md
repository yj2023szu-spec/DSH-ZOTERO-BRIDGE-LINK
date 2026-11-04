# 排错手册

## 先看三个文件

| 文件 | 位置 | 用途 |
|---|---|---|
| `zoterolink-boot.log` | Zotero 配置目录（`%APPDATA%\Zotero\Zotero\Profiles\<profile>\`） | 插件启动每一步；失败时第一现场 |
| `zoterolink.json` | 同上 | 桥接端口 + 写 token；DSH 靠它发现桥接 |
| Zotero 调试输出 | Help → Debug Output Logging | 插件加载、端点调用、异常栈 |

DSH 侧可用命令检查：

```powershell
node scripts/smoke.mjs          # 离线契约
node scripts/test-addon.mjs     # 端点逻辑（Zotero 运行时桩）
node scripts/smoke-bridge.mjs   # 连活 Zotero 全端点
curl http://127.0.0.1:23119/zoterolink/health
```

## 状态码与处理

| 现象 | 含义 | 处理 |
|---|---|---|
| `BRIDGE_MISSING` | DSH 找不到 `zoterolink.json` | 插件未安装 / 从未成功启动：看 boot log，重装并重启 Zotero |
| `ZOTERO_DOWN` | 连不上端口 | Zotero 没开或 HTTP 服务被关；打开 Zotero |
| `TIMEOUT` | 全文抽取超时 | 缩小页码范围（`maxPages` / `pageStart/pageEnd`）重试 |
| `TOKEN_INVALID` | 写操作 token 不匹配 | 见下方“重置 token” |
| `PDF_NO_TEXT` | 扫描件无文字层 | 只能依据高亮/笔记回答；先做 OCR 或换版本 |
| `NO_PDF` | 条目无 PDF | 用元数据/笔记回答，或补附件 |
| `PREVIEW_EXPIRED` / `PREVIEW_INVALID` | 笔记预览过期/跨会话 | 重新 `zotero_note action=preview` |
| `BAD_RESPONSE` | 桥接响应无法解析 | 看 boot log 与 Zotero 调试输出；多为插件版本不匹配 |

## 常见根因（按历史踩坑排序）

### 1. 配置写入失败：`NS_ERROR_FILE_UNRECOGNIZED_PATH`

**症状**：插件“看起来装了”，但 DSH 一直 `BRIDGE_MISSING`，配置目录没有 `zoterolink.json`，boot log 也缺失。

**原因**：用 `+ "/"` 拼接 Windows 路径（`C:\...\profile/zoterolink.json`），Gecko 的 `OS.File` 拒绝混合分隔符。

**修复**：v0.1.4 起统一用 `PathUtils.join`。确认 `zoterolink-boot.log` 存在即说明修复生效。

### 2. 插件启动死锁

**症状**：boot log 永远没有内容，配置也不写。

**原因**：bootstrap 在 `startup` 里 `await Zotero.initializationPromise`，而该 promise 要等 `Plugins.init()` 返回后才 resolve。

**修复**：v0.1.3 起不再等待；bootstrap 只依赖启动时已就绪的服务。

### 3. 安装时提示“不兼容”

**原因**：Zotero 10 的清单校验要求 `applications.zotero` 同时包含 `id`、`update_url`、`strict_max_version`；缺任一即判无效。

**修复**：v0.1.2 起已补齐；版本区间用 `10.0` / `11.*`。

### 4. 侧载 vs 插件对话框

- 对话框安装偶尔会被缓存/签名状态影响；侧载到 profile `extensions\<id>.xpi` 最稳定。
- 侧载后重启 Zotero，`extensions.json` 应出现：
  `"id": "zotero-link@local", "active": true, "appDisabled": false`。

### 5. 版本号显示滞后

Zotero 的插件元数据缓存可能让界面仍显示旧版本（如代码 0.1.4、界面 0.1.3）。
以 `zoterolink-boot.log` 的 `startup begin version=...` 与 `zoterolink.json` 的 `version` 为准；不影响功能。

## 重置 token

1. 关闭 Zotero
2. 删除配置目录下的 `zoterolink.json`
3. 打开 Zotero（插件会生成新 token 并写入）
4. 在 DSH 里刷新页面或等待 30 秒（桥接发现缓存）

## 全文抽取问题

- 首次抽取大 PDF 可能 10–30 秒；之后 5 分钟内命中缓存。
- 若返回 `PDF_NO_TEXT`：该 PDF 无文字层（扫描件），或 PDF 加密。可用 `zotero_open` 确认文件能正常打开。
- 页标签（印刷页码）只能从该页注解推断；没有注解时显示 `PDF p.N`。

## 卸载不完全

- 删除 `extensions\zotero-link@local.xpi` 后重启 Zotero。
- 若 `zoterolink.json` 残留，DSH 仍会尝试连接并报 `ZOTERO_DOWN`（不会崩溃）。
- DSH 侧用 `plugin_manager action=remove_bundle` 移除 bundle，刷新页面。
