# ACR-2026-0009：Session、FlowEngine 与 Multi-agent 边界修订

> 状态：REVIEWING
> 评审门禁：1/5 REVIEWING
> 日期：2026-09-04
> 基于：`ACR-2026-0008` / `AKB-2026-09-03-09`

> 历史决定说明：FE、资源分配及独立子任务协调组件的旧边界已由[ACR-0012](ACR-2026-0012-flow-system-engine.md)替代；以下保留当时评审事实。

## 1. 变更原因

步骤二评审发现 Session、Run、AgentLoop、FlowEngine、进程和 Multi-agent 的边界仍可能被不同解释，需要在冻结接口前重开步骤一。

## 2. 决议候选

1. Agent Kernel 不拥有 Multi-agent 团队组建、角色、协调、通信、仲裁和终止策略；这些属于上层业务编排。
2. Kernel 保留受限 Subagent 的结构化 Child Run 原语，因为这是单个 Agent 执行的技术生命周期能力。
3. `AgentSession` 是持久上下文、资产索引、版本锁和可选分支血缘，不是进程，也不是业务 Workflow。
4. `AgentRun` 是单次任务执行及挂起/恢复状态的权威聚合；Session 不复制其状态。
5. `AgentLoopStep` 是 Attempt 内的一次认知或动作推进。
6. `FlowEngine` 是无状态推进算法；一个实例可服务多个 Session/Run，首版本地使用一个实例和多个有界执行槽。
7. `ResourceManager` 只管理执行槽、队列和临时资源预算，不解释业务优先级。
8. Operations 与 Infrastructure 首版采用本地最小 Adapter，不引入分布式平台依赖。

## 3. 受影响内容

- 删除目标设计中的 `MultiAgentRun`、Participant、RoleAssignment、CoordinationPolicy、TerminationPolicy、TeamMessage、MultiAgentManager 和 MultiAgentPort。
- `AgentExecutionScope` 收敛为 Parent/Child Run 结构化生命周期约束。
- `AgentContextThread` 术语收敛为 `AgentSession`；ContextFrame 仍是一轮模型调用投影。
- C4 Workflow Engine 规范映射为无状态 FlowEngine + RunScheduler，不拥有业务任务状态。
- 增加 ExecutionResourcePort 以及最小 Operations/Infrastructure Port。

## 4. 评审影响

本变更修改 `ACR-2026-0008` 的步骤一系统职责结论，因此当前整体评审停留在步骤一 REVIEWING。步骤一确认前，不冻结步骤二接口；步骤五以前仍不得修改运行代码、Schema 和数据库迁移。文档组织遵循 [ACR-2026-0010](ACR-2026-0010-layered-design-documentation.md)。

## 5. 设计证据

- [总体设计](../../design/agent-kernel-design.md)
- [L1 Control 层设计](../../design/layers/l1-control/README.md)
- [FlowEngine 组件设计](../../design/layers/l1-control/components/flow-engine/README.md)
- [SessionManager 组件设计](../../design/layers/l1-control/components/session-manager.md)
- [SubagentCoordinator 组件设计（已撤回归档）](../archive/flow-before-system-v1/subagent-coordinator-withdrawn-2026-09-08.md)
- [Operations Plane 层设计](../../design/layers/operations-plane/README.md)
- [Infrastructure Plane 层设计](../../design/layers/infrastructure-plane/README.md)
- [边界契约导览](../../design/contracts/README.md)
- [Local-first 部署档案](../../design/deployment/local-first-profile.md)
- [System SFMEA](../../verification/system-sfmea.md)
- [文档清单](../../design/document-manifest.yaml)

正式图形共 19 张，按 `docs/design/diagrams/{system,layers,components,contracts,scenarios,deployment}/` 分类；主题文件不计入架构图数量。
