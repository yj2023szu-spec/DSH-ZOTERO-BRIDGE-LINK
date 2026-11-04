# 贡献者

按贡献顺序：

1. **yj2023szu-spec**（[@yj2023szu-spec](https://github.com/yj2023szu-spec)）
   - 项目发起人：提出“DSH × Zotero 联动”的完整需求与验收标准
   - 真实环境验证：Zotero 10.0.7 上的安装、重启、当前文献 / 摘录 / 笔记 / 综述流程验收
   - 产品决策：桥接插件方案、文献面板、笔记“先预览后写入”策略

2. **DeepSeek Harness AI**
   - 架构设计与实现：Zotero 桥接插件（bootstrap + `/zoterolink/*` 端点 + 全文分页 + 笔记写入）
   - DSH 侧实现：`zotero_*` 工具、`/zotero-link` Web API、左侧「文献」面板与会话视图、引用契约与系统提示
   - 测试与文档：契约测试、Zotero 运行时桩测试、活桥接冒烟、安装/排错文档
   - 定位并修复 Windows 路径分隔符导致的配置写盘失败（v0.1.4）

## 如何贡献

- 提交 Issue：描述使用场景、期望行为、Zotero 版本与 DSH 版本
- 提交 PR：请保持两端接口契约（`/zoterolink/*`、`zotero_*` 工具参数）兼容，并在 PR 中说明验证方式
- 修改引用契约（`zotero://` 链接格式、`page` = `pageIndex + 1`）需要同时更新 `docs/ARCHITECTURE.md` 与 `lib/format.js` 的测试
