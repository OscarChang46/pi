---
doc_id: SYS-REV-001
level: review
layer: Agent Kernel System
component: null
status: reviewing
baseline: AKB-2026-09-03-09
authoritative_for: 五步评审步骤一的结论、状态与待确认项
parent: SYS-DES-001
interfaces: []
diagrams: [VIEW-SYS-CONTEXT, VIEW-SYS-CONTAINER]
supersedes: [docs/design/agent-kernel-v2-architecture-review.md]
---

# Agent Kernel System V3.1 架构与五步评审

> 候选变更：[`ACR-2026-0009`](../changes/ACR-2026-0009-session-flow-engine-boundary.md)、[`ACR-2026-0010`](../changes/ACR-2026-0010-layered-design-documentation.md)
> 活动代码基线：`AKB-2026-09-03-08`（保持不变）
> 实施约束：五步评审全部通过前不修改运行代码、Schema 或数据库迁移。

## 1. 本轮为什么重开步骤一

`ACR-2026-0008` 已确认 AgentRun 是执行聚合根、Runtime 是可重建服务、Permission/Tool/Memory 是独立边界。随后评审发现 Session、FlowEngine、进程和 Multi-agent 的职责仍需修订。由于这会改变系统职责和领域对象，不能继续冻结步骤二接口，必须重开步骤一。

本轮候选结论：

- Agent Kernel System 管理 Agent、Session、Run、调度、执行器、权限、工具、上下文、记忆和受限 Subagent；
- Multi-agent 的团队拓扑、角色、通信、仲裁和终止策略由上层业务编排拥有；
- `AgentSession` 是持久化技术会话档案，不是进程，也不复制 Run 状态；
- `AgentRun` 拥有 queued/running/suspended/completed/failed/cancelled 等任务执行状态；
- `AgentLoopStep` 是 Attempt 内部的一次模型、工具、上下文、记忆或委派推进；
- `FlowEngine` 是无状态推进算法，一个实例可服务多个 Session/Run；
- `RunScheduler` 管理可运行队列；`ResourceManager` 管理执行准入、执行槽和临时资源，不解释业务优先级。

## 2. 核心对象关系

| 对象 | 类型 | 生命周期 | 权威职责 |
|---|---|---|---|
| `AgentSession` | 聚合根 | 创建到关闭/归档，可跨多个 Run | ContextDelta、Artifact 索引、版本锁、可选父 Session 血缘 |
| `AgentRun` | 聚合根 | 一次任务请求到终态 | 执行状态、等待原因、预算、结果、Attempt 序列 |
| `AgentRunAttempt` | Run 内实体 | 一次物理尝试 | Runtime 绑定、恢复边界和执行结果 |
| `AgentLoopStep` | Attempt 内实体 | 一次内部推进 | 模型/工具/上下文/记忆/Child Run 步骤事实 |
| `FlowEngine` | 无状态领域服务 | Host 进程级 | 读取快照并计算下一动作 |
| `AgentRuntime` | 可重建执行服务 | Worker/组件级 | 执行已派发 Attempt |
| `ResourceManager` | 资源协调服务 | Host 进程级 | 执行槽、队列和临时资源配额 |

详细关系从[L1 层设计](../../design/layers/l1-control/README.md)进入 SessionManager、RunRegistry、FlowEngine、ResourceManager 和 SubagentCoordinator 组件文档。

## 3. 进程与调度结论

首版本地默认：一个 Host 进程、一个 FlowEngine、一个 Scheduler、一个 ResourceManager、一个 RuntimePool 和多个有界异步执行槽。Session 保存在 SQLite 中；挂起 Run 释放执行槽，恢复事件到达后重新排队。Session 数量不等于进程、线程或协程数量。

Subagent 是 Child `AgentRun`。默认复用 Parent Session 的只读 ContextSnapshot；只有需要上下文隔离时才通过 `SessionBranchPort` 创建 Child Session。Parent 终态前必须 Join、Cancel 或受控移交 Child。

## 4. 系统职责边界

Kernel 拥有：

- AgentDefinition、AgentSession、AgentRun/Attempt/LoopStep；
- FlowEngine、RunScheduler、ResourceManager、RuntimePool；
- Context/Memory、Permission/Permit、ToolCall/Sandbox 协调；
- Structured Subagent 的 Fork/Join/Cancel 技术原语；
- 规范化事件、OperationContext 和运维信号。

Kernel 不拥有：

- 业务 Workflow、业务 Conversation、业务 ApprovalCase；
- Tenant/User/RBAC 领域模型；
- Multi-agent Team、Participant、团队 Role、协作协议和仲裁；
- 具体存储、进程、网络、Sandbox、Secret、Clock 和观测机制；
- Pi/ACP 原生类型。

## 5. 三级设计评审入口

- [总体设计](../../design/agent-kernel-design.md)
- [L1 Control](../../design/layers/l1-control/README.md)
- [L2 Cognitive](../../design/layers/l2-cognitive/README.md)
- [Security Plane](../../design/layers/security-plane/README.md)
- [L3 Tool Runtime](../../design/layers/l3-tool-runtime/README.md)
- [L4 Execution Runtime](../../design/layers/l4-execution-runtime/README.md)
- [Operations Plane](../../design/layers/operations-plane/README.md)
- [Infrastructure Plane](../../design/layers/infrastructure-plane/README.md)
- [边界契约导览](../../design/contracts/README.md)
- [领域对象目录](../../design/reference/domain-object-catalog.md)
- [Verification](../../verification/README.md)

## 6. PlantUML 视图

- [系统上下文](../../design/diagrams/system/01-agent-kernel-context.puml)
- [系统服务 C4 协作](../../design/diagrams/system/05-system-service-collaboration.puml)
- [领域对象全集](../../design/diagrams/system/04-agent-system-domain-universe.puml)
- [七层 C4 Component 图](../../design/diagrams/layers/)
- [Run 状态机](../../design/diagrams/components/l1-control/04-run-state-machine.puml)
- [Subagent 生命周期](../../design/diagrams/components/l1-control/11-subagent-lifecycle.puml)
- [跨层场景图](../../design/diagrams/scenarios/)
- [边界协议图](../../design/diagrams/contracts/12-c4-boundary-protocols.puml)

Draw.io 是评审画布，PlantUML 是正式图形内容源。本轮不直接编辑 Draw.io 生成节点。

## 7. 五步评审状态

| 步骤 | 主题 | 当前状态 | 通过条件 |
|---|---|---|---|
| 1 | 职责、边界与对象关系 | **重新评审** | 明确 Session/Run/Loop/FlowEngine/进程关系，以及 Subagent 与上层 Multi-agent 边界 |
| 2 | Port、DTO、事件与错误码 | 等待步骤一 | 所有跨层调用具有唯一协议、所有者和故障语义 |
| 3 | 生命周期、事务与韧性 | 未开始 | 挂起、恢复、取消、背压、Child 收敛和重启恢复闭合 |
| 4 | 安全、运维与容量 | 未开始 | 无权限旁路、无敏感日志、资源均有界 |
| 5 | 基线批准与代码授权 | 未开始 | 用户明确批准后才能修改实现 |

## 8. 步骤一待确认清单

- [ ] 接受 Session 不对应进程；一个 FlowEngine/RuntimePool 服务多个 Session。
- [ ] 接受 Run 拥有任务状态，Session 只拥有上下文、资产、版本和分支血缘。
- [ ] 接受挂起 Run 释放执行槽，恢复后重新排队。
- [ ] 接受 Kernel 只提供 Structured Subagent，不拥有 Multi-agent 团队模型。
- [ ] 接受首版 Operations/Infrastructure 使用本地最小 Adapter。
- [ ] 接受步骤一重新确认后再继续冻结步骤二协议。
