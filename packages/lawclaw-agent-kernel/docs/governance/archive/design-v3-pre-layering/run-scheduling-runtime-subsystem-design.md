> **非规范性归档：** L1 调度职责已拆入 [RunRegistry](../../../design/layers/l1-control/components/run-registry.md)、[RunScheduler](../../../design/layers/l1-control/components/run-scheduler.md)和[RuntimePool](../../../design/layers/l1-control/components/runtime-pool.md)；L2 执行职责见[AgentRuntime/AgentLoop](../../../design/layers/l2-cognitive/components/agent-runtime-loop.md)。

# AgentRun、调度与 Runtime 子系统设计

> 状态：`ACR-2026-0008` 五步评审步骤二候选
> 返回主文档：[7 AgentSession、调度、FlowEngine 与 Runtime](agent-kernel-design.md#7-agentsession调度flowengine-与-runtime)
> 权威类图：[07 Run、调度与执行](diagrams/domain/07-run-scheduling-execution.puml)
> 对象目录：[Run Domain](agent-kernel-domain-object-catalog.md#3-run-domain-领域模块)

## 1. 聚合边界

`AgentRun` 是执行聚合根，保护执行状态、预算、冻结路由、事件序号、取消和终态不变量。它拥有 `AgentRunAttempt`；Attempt 拥有按序产生的 `AgentLoopStep` 与安全检查点。

`AgentRuntime`、`RunScheduler`、`RunRegistry` 和 `AgentRuntimePool` 都是可重建服务，不是聚合根。Runtime 不拥有 Run，也不保存跨 Run 的隐藏权威状态。

## 2. 生命周期

```text
AgentSystemGateway
  → RunCommandPort 受理执行意图
  → AgentRun(ACCEPTED)
  → RunScheduler 排队并选择 Runtime
  → AgentRunAttempt
  → AgentRuntime 执行 AgentLoopStep
  → RunExecutionPort 追加事件与结果
  → AgentRun 进入成功、失败、取消、超时或安全中断终态
```

一个业务请求或 Child 委派分别形成独立 Run。上层 Multi-agent 的参与者对 Kernel 也只是普通 Root Run。恢复保持原 `runId`，但创建新 Attempt；业务重新发起意图则创建新 Run。

## 3. Local-first 调度

首版使用单 Kernel、单 Scheduler、本地有界队列和 SQLite 权威状态。Scheduler 必须防止同一 Run 被本地重复派发，并在启动时扫描非终态 Run。

`RuntimeLease` 保留为多 Worker 或崩溃接管部署档案。首版不强制 Lease/Fence；本地旧回调通过 `attemptId + aggregateVersion` 拒绝。启用并行 Worker 后，才要求唯一 Lease、Fence Token 和旧 Worker 写入隔离。

## 4. 服务职责

| 服务 | 负责 | 不负责 |
|---|---|---|
| RunScheduler | 本地队列、并发、预算、Deadline、有限技术重试和派发 | 业务 Workflow 顺序和结果采纳 |
| RunRegistry | Run 查询、状态提交入口、幂等回执和事件索引 | 能力定义和业务调度 |
| AgentRuntimePool | Runtime 健康与容量；首版可只有一个 Runtime | Run 权威状态 |
| AgentRuntime | 执行已派发 Attempt 的 Agent Loop | 创建 Run、签发权限、修改调度队列 |

## 5. 关键 Port

| 调用方 | Port | 数据所有者 |
|---|---|---|
| AgentSystemGateway | `RunCommandPort` / `RunQueryPort` | AgentRun |
| SubagentCoordinator | `ChildRunPort` / `RunSchedulerPort` | AgentRun、ExecutionScope |
| RunScheduler | `RuntimeDispatchPort` | Run 仍归 Run Domain |
| AgentRuntime | `RunExecutionPort` | AgentRun/Attempt/Event |
| AgentRuntime | `RuntimeEventPort` | Runtime 事件先进入 Run Event Journal |
| Run Domain | `RunRepositoryPort` | Infrastructure 只保存机制状态 |

## 6. 正确性与故障语义

- 写命令使用 `commandId`；同一幂等键异载荷冲突；
- 终态不可逆，取消后不能启动新的模型、工具、记忆写入或 Child Run；
- Deadline 是端到端绝对 UTC 时间，只能缩短；
- 持久事件在单 Run 内严格递增，瞬时进度允许有界丢失；
- Runtime 或通道断开只代表执行状态未知，不得直接重派有未知副作用的 Attempt；
- 安全 Checkpoint、已知副作用和有效授权同时满足时才允许恢复。

## 7. 关联设计

- 外部 Run 协议见[稳定协议外观层](protocol-facade-subsystem-design.md)。
- Agent 技术路由见[Registry 与路由子系统](agent-registry-routing-subsystem-design.md)。
- 工具暂停与恢复见[工具调用与沙箱子系统](tool-call-subsystem-design.md)。
- Child Run、可选 Child Session 和上层 Multi-agent 边界见[AgentSession、FlowEngine 与本地资源调度](session-flow-engine-resource-subsystem-design.md)。
