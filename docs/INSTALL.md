# 安装与升级

## 前置条件

| 组件 | 版本 | 说明 |
|---|---|---|
| Zotero | 10.x（10.0.7 验证） | Windows；数据目录任意 |
| DeepSeek Harness | 含 Node 24 运行时 | 桌面版 / Web GUI 均可 |
| PowerShell | 5.1+ / 7 | 仅安装脚本与打包脚本需要 |

## 1. 安装 Zotero 桥接插件

### 方式 A：插件对话框（手动）

1. Zotero → 工具 → 插件 → 右上角齿轮 → **Install Add-on From File…**
2. 选择 `dist/zotero-link.xpi`
3. **完全退出 Zotero 再重新打开**（bootstrap 插件只在启动时加载）

### 方式 B：侧载（推荐，脚本自动找配置目录）

```powershell
powershell -ExecutionPolicy Bypass -File scripts/install-zotero-addon.ps1
# 然后完全退出并重新打开 Zotero
```

脚本会把 `dist/zotero-link.xpi` 复制为
`%APPDATA%\Zotero\Zotero\Profiles\<profile>\extensions\zotero-link@local.xpi`。
Zotero 下次启动会扫描并启用它（`extensions.autoDisableScopes` 默认允许 profile 作用域）。

### 验证桥接

Zotero 启动后：

```powershell
node scripts/smoke-bridge.mjs
```

应看到 `BRIDGE SMOKE OK`，并打印当前文献标题、全文页数、集合数量。
也可以直接访问 `http://127.0.0.1:23119/zoterolink/health`。

桥接会在 Zotero 配置目录生成：

| 文件 | 内容 |
|---|---|
| `zoterolink.json` | `{ port, token, version, zoteroVersion, profileDir, updatedAt }` |
| `zoterolink-boot.log` | 每次启动的自检日志（加载脚本、注册端点、写配置） |

## 2. 安装 DSH 插件

在 DSH 会话中执行（需要插件管理器权限；安装后刷新页面）：

```text
plugin_manager action=install_bundle target=<本仓库绝对路径>
```

安装结果：

- 左侧栏出现「文献」图标（`sidebar.panellist`）
- 会话顶部出现「文献」视图（`conversation.view`）
- Agent 获得 7 个 `zotero_*` 工具

## 3.（可选）安装工作流技能

把 `skill/zotero-literature/` 复制到 `~/.agents/skills/zotero-literature/`（Windows：`C:\Users\<你>\.agents\skills\zotero-literature`）。
技能提供更详细的提问 / 摘录整理 / 综述撰写流程；不装也能用，因为 DSH 插件内置了精简系统提示。

## 升级

1. 替换 `dist/zotero-link.xpi`（或重新跑 `scripts/build-xpi.ps1`）
2. 重新执行侧载脚本（或插件对话框安装）
3. 重启 Zotero
4. DSH 侧如更新了 `client.js`：刷新页面（必要时重启 DSH）

> 注意：Zotero 的插件元数据有缓存，升级后「工具 → 插件」里显示的小版本号可能滞后（例如实际代码 0.1.4、界面仍显示 0.1.3）。以 `zoterolink-boot.log` 里的 `version=` 为准。

## 卸载与回滚

```text
# DSH 侧
plugin_manager action=remove_bundle target=@local/dsh-zotero-link
```

Zotero 侧：

- 工具 → 插件 → 移除 *Zotero Link Bridge*，重启；或
- 删除 `extensions\zotero-link@local.xpi` 与 `zoterolink.json` 后重启。

卸载后 DSH 工具会返回 `BRIDGE_MISSING`，不会崩溃。

## 目录与端口

| 项 | 默认 |
|---|---|
| Zotero HTTP 端口 | `23119`（Zotero 自带，写在 `zoterolink.json`） |
| DSH Web 端口 | 由 DSH 决定（每次启动可能变化，以运行时 URL 为准） |
| 综述输出 | `reviews/<主题>-YYYYMMDD.md`（仓库默认忽略该目录内容） |
