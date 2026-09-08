---
doc_id: L1-CMP-002
level: component
layer: L1 Control & Orchestration Runtime
component: AgentSystemGateway
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Agent Kernel 外部用例入口及其协调边界
parent: L1-DES-001
interfaces: [AgentSystemGateway, AgentRegistryQueryPort, SessionCommandPort, SessionQueryPort, RunCommandPort, RunQueryPort, RunEventQueryPort, RunSchedulerPort]
diagrams: []
supersedes: [agent-kernel-design.md 与 protocol-facade-subsystem-design.md 中的 Gateway 组件级内容]
---

# AgentSystemGateway 组件设计

## 1. 目标与非目标

Gateway 为 Backend、KernelHost 和 Protocol Facade 提供 Agent 查询、Run 受理/查询/取消及事件读取的统一入口。它确保外部调用不会绕过 Registry、Run、Session 或 Scheduler 的应用边界。

Gateway 不实现 Transport、认证、Tenant/RBAC 解释、业务 Workflow、调度算法、模型循环、权限裁决或持久化。

## 2. 状态与不变量

Gateway 无领域权威状态，只协调单次用例。写命令必须传播稳定 `commandId`、幂等键、Deadline、OperationContext 和 `ExecutionEnvelopeRef`。Gateway 不得把原始 Token、业务角色或业务审批模型写入 Kernel 对象。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `AgentSystemGateway` | 对外稳定的 Agent 与 Run 用例入口 |
| 出站 | `AgentRegistryQueryPort` | 查询可公开 Agent 描述 |
| 出站 | `SessionCommandPort`、`SessionQueryPort` | 解析或创建技术 Session 引用 |
| 出站 | `RunCommandPort`、`RunQueryPort` | 幂等受理、取消和查询权威 Run |
| 出站 | `RunEventQueryPort` | 按 Run sequence 读取持久事件 |
| 出站 | `RunSchedulerPort` | 通知新 Run 或恢复 Run 进入调度判定 |

## 4. 生命周期与算法

启动 Run 时先验证规范化意图和信封引用，再解析 Agent/Session 引用，调用 RunCommandPort 原子受理并取得持久化回执，最后通知 Scheduler。Scheduler 通知失败不回滚已受理 Run，恢复扫描会重建队列。查询和取消均以 Run 权威状态为准。

## 5. 韧性与可观测性

- 相同命令同载荷返回原回执；同键异载荷冲突。
- Scheduler 短暂不可用时，已持久化 Run 保持可恢复，不以内存通知作为权威事实。
- 记录用例名、command/run 引用、受理延迟和稳定结果类别；不记录业务载荷正文。
- 任何下游部分成功都必须能由权威查询确认，不能凭连接状态推断。

## 6. 验收

- 外部调用不能绕过 Gateway 直接创建 Run 或派发 Runtime。
- start 返回时 Run 已持久化；通知丢失后启动扫描仍能调度。
- 取消只建立取消请求事实，不虚假承诺清理已经完成。
- Gateway 中业务 Workflow、Token、Tenant 和 RBAC 解释逻辑为零。
