---
doc_id: L1-CMP-013
level: component
layer: L1 Control & Orchestration Runtime
component: SubagentCoordinator
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: AgentExecutionScope 与 Parent/Child Run 的 fork、join、cancel、移交和约束继承
parent: L1-DES-001
interfaces: [ChildRunPort, DelegationPort, PermissionDecisionPort, PermitValidationPort, RunSchedulerPort, RunQueryPort, SessionBranchPort, ExecutionScopeRepositoryPort]
diagrams: []
supersedes: [session-flow-engine-resource-subsystem-design.md 中的 Subagent 内容]
---

# SubagentCoordinator 组件设计

## 1. 目标与非目标

SubagentCoordinator 把 L2 的委派候选转换为结构化 Child Run，并保证 Child 的权限、预算、Deadline 和资源范围不超过 Parent，且 Parent 终态前所有 Child 已 join、cancel 或完成受控移交。

它不组建 Multi-agent 团队，不定义业务角色、参与者通信、仲裁、团队终止或业务结果采纳，也不允许 detached child。

## 2. 所有状态与不变量

`AgentExecutionScope` 是本组件权威聚合，记录 Root/Parent/Child 引用、约束快照、Join 状态、取消传播和受控移交。Child Run 自身状态仍由 RunRegistry 拥有，Scope 只保存引用和结构化并发不变量。

Child 的权限、预算、Deadline、工具范围、MemoryView 和资源上限必须是 Parent 的子集；深度、分支数和总 Child 数有硬上限。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `ChildRunPort` | 提交 Child、等待 Join、取消或查询 Scope |
| 入站 | `DelegationPort` | 接收已经规范化的 L2 委派候选 |
| 出站 | `PermissionDecisionPort`、`PermitValidationPort` | 校验委派动作与约束子集 |
| 出站 | `RunSchedulerPort` | 统一创建和调度 Child Run |
| 出站 | `RunQueryPort` | 读取 Child 权威终态 |
| 出站 | `SessionBranchPort` | 仅在上下文隔离需要时创建 Child Session |
| 出站 | `ExecutionScopeRepositoryPort` | 持久化 Scope 与 Join 状态 |

## 4. 生命周期与算法

收到委派候选后先验证父 Run 可继续、深度/数量上限和约束子集，再持久化 Scope 关系并通过统一 Scheduler 创建 Child。默认复用 Parent Session 的只读 ContextSnapshot，结果以 Artifact/ContextDelta 引用回传；只有独立演进时创建 Session 分支。Parent 完成或取消前执行 Join/Cancel 栅栏。

## 5. 韧性与可观测性

- Child 创建采用幂等委派键，提交中断后先查询 Scope/Run 状态。
- Parent 取消级联传播；无法确认 Child 终态时 Parent 保持收敛中而非虚假完成。
- 重启从 Scope Repository 与 RunRegistry 重建未完成 Join。
- 记录 fork/join/cancel 延迟、深度、活跃 Child、约束拒绝和孤儿检测；不记录上下文正文。

## 6. 验收

- Parent 终态后活动或 detached Child 数量为零。
- Child 的每项权限、预算、Deadline 和资源约束均不宽于 Parent。
- Root 与 Child 经过同一 RunScheduler 和 ResourceManager。
- Kernel 内 Team、Participant、RoleAssignment、CoordinationPolicy 和仲裁逻辑数量为零。
