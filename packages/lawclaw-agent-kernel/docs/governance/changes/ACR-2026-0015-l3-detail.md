# ACR-2026-0015：L3受控工具运行详细设计

## 2026-09-09修订：组件后的功能域

用户明确要求简化L3内部持久化/一致性设计，作为使用约束，同时按组件划分功能域。当前设计改为ToolRegistry、ToolCatalogRouter、ToolCallRuntime、内部ToolExecutionGuard，细化七域；原CAS/outbox/恢复表设计不再指导L3内部实现，转为依赖约束。工具独立事实和Security最终检查保留。详见[本次复核与迁移](../reviews/l3-functional-domains-2026-09-09.md)。状态仍为候选，未批准代码或数据迁移。

以下2026-09-08内容为历史设计说明；与本次修订冲突的“L3实现持久启动/核对账本”等内容失效，不与新正文并列为规范。

- 日期：2026-09-08；状态：IMPACT_ANALYZED，候选材料与自审，不代表所有者批准。
- 用户授权：使用architecture-design-review技能细化L3；本轮仅设计文档和图，不修改代码、提交或推送。
- 输入：分支codex/arch-agent-system-v3，HEAD c482b79735d83c3150d962cd9dbe19d0264a226c及当前未提交工作区。旧active基线08与候选09保持分离。
- 范围：[层入口](../../design/layers/l3-tool-runtime/README.md)、三个组件详细算法、[L3-DD-1契约](../../design/contracts/l3-tool-runtime-detail.md)、[一致性评审](../reviews/l3-detail-2026-09-08.md)。

## 问题与方案

原CD-1已有职责、字段和故障用例，但缺少内部类关系、可实现迁移结构、目录公开投影、私有持久记录及逐场景图；概要“只读可重试”还与首版执行重试0冲突。此次按CD-1统一为0，保留原18个组件验收ID，新增10个针对性验收设计。

采用目录路由和调用生命周期两个开发单元，Guard作为Runtime内部职责。复用FE公共Activity、安全消费与L4执行端口；不新增调度、Permit库、消息中间件、分布式租约或Provider业务逻辑。ToolCall耐久事实与FE Activity日志分别拥有各自语义，通过原command与证据核对，不跨库大事务。

新契约只定义缺失的内部数据与操作语义；CD-1继续拥有公共DTO，BND继续拥有层间方向。此为接口细化候选，非纯排版调整；正式源码Schema与跨FE执行资格桥接须联合复核。

## 影响与门槛

L1需将稳定Activity身份关联原command、映射已知结果与UNKNOWN；Security需提供当前执行资格与必要审计确认；L4需按原operationKey查询并区分效果与业务错误；Infrastructure需支持短事务、引用保留和同键异载荷检测。部署档案仍为本地首版，未承诺跨库/跨机授权原子性。

G0—G2材料已准备；五视角由主代理自审，非独立代理评审。G3待架构所有者复核；未进入实现授权。与已有未提交工作并存，不把ACR-0011的旧整体结论继承为本次批准。具体检查结果记入本次评审记录。
