# ACR-2026-0018：新 Kernel TUI 组件与功能域设计

状态：IMPACT_ANALYZED / candidate。日期：2026-09-09。用户授权候选文档落档；未授权运行实现、发布或更改手工图。

问题：旧Pi扩展仍由Pi模型循环驱动，不能作为新Kernel完整交互。旧图把pi-tui放在调用链起点，混淆库依赖与请求。

决定：LawClaw TUI使用pi-tui并独立调用KernelClient；KernelHost是宿主边界。采用独立客户端目录及六个功能域SR，每域包含场景到验收的完整设计。第一期连续会话/流/取消/恢复，二期导航与执行视图，三期审批。

影响：新增客户端协议和Host准备用例；同步BND-EXT、Gateway、Facade及部署导航。原先“客户端先创建Session”不适用于新TUI：Host先准备候选再确认Session，Gateway接收已准备引用。具体恢复保持CTX-CON-1权威，不把TUI缓存当内核事实。

迁移：本次只新增候选文档与局部替换旧口径，无数据库/源码迁移；保留既有Pi扩展与现有HTTP。未来开发必须完成[依赖评审](../reviews/kernel-tui-design-review.md)列出的前置条件。

入口：[组件设计](../../design/clients/components/kernel-tui/README.md)。验证：[本轮记录](../../verification/kernel-tui-design-validation.md)。

## 约束优先补全

按用户确认收敛：单宿主/单前台订阅/单未决写；取消默认/cancel，保留Ctrl+K编辑；缺口重取快照；切换前处理草稿；Launcher保证唯一性。删除候选中的通用effect框架和后台缓存，不删除运行功能。六SR补充适用约束、局部状态及最小接口；TUI及依赖契约可独立开发，服务内部实现与联合运行另列状态。
