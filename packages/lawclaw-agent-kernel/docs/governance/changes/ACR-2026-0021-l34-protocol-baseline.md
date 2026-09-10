# ACR-2026-0021：L3→L4 开发协议规范基线

日期：2026-09-09。状态：APPROVED（规范批准）；specification_status：BASELINED；implementation_status：NOT_STARTED。

用户明确授权：“这个边界要明确下来，达到可开发水准并基线”。本次据此冻结L34-SPEC-1.0.0，不将ACP-001要求实现及测试通过的整体ACR状态冒记为BASELINED，不移动Kernel活动实现基线。此授权仅覆盖本边界的规范及调用方字段，其他候选设计的审批门槛不变。

问题：旧l3-l4-2缺JSONL握手/帧关联/背压，资源档案未完整绑定授权，查询截止和Artifact保留交接不明确；两侧开发会各自补协议。

决定：复用现有三操作和Security/Artifact能力，冻结ExecutionPlan.resourceProfileRef、ToolTargetV1、Host受信Admission、P1/P2交付档案、JSON Schema、固定向量及错误/取消/迟到语义。L3持久化、接管、一致性仍由外部条件保证，不新增数据库或恢复算法。

影响及迁移：L1在PDP前准备完整目标→L3 Guard核验→Host安装Admission→L4执行→L1保存及Artifact交接；同步两侧组件与功能域、Security输入映射。新协议拒绝旧草案及未知版本；升级排空，旧unknown仅按原locator查询，不重执行。

基准：codex/arch-agent-system-v3，HEAD 51b5a71f306ba59f65d890da45a822c5385b8831加既有工作树。文件内容基线由[哈希清单](../baselines/l34-spec-1.0.0.json)唯一标识，未提交/推送。

评审：[专项记录](../reviews/l34-baseline-2026-09-09.md)。B1资源绑定、B3线协议及B2/B4交接契约已闭合；Host持久化、可信效果、真实隔离等保留为运行验收，不宣称已实现。

入口：[BND-L34-001](../../design/contracts/bnd-l34-001.md)。无运行代码、依赖、数据库或生产配置变更。
