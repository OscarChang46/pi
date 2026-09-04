---
doc_id: L1-CMP-007
level: component
layer: L1 Control & Orchestration Runtime
component: RunScheduler
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Run 可运行判定、队列、派发、Deadline 与有限技术重试
parent: L1-DES-001
interfaces: [RunSchedulerPort, RunQueryPort, RunExecutionPort, ExecutionResourcePort, RuntimeDispatchPort, ClockPort]
diagrams: []
supersedes: [run-scheduling-runtime-subsystem-design.md 与 session-flow-engine-resource-subsystem-design.md 中的 Scheduler 内容]
---

# RunScheduler 组件设计

## 1. 目标与非目标

Scheduler 统一调度 Root Run 和 Child Run，将权威 Run 状态投影为有界可运行队列，并在资源和 Runtime 可用时创建/派发 Attempt。它不设计业务 Workflow、不采纳业务结果、不持有 Session 内容，也不把队列当作 Run 权威状态。

## 2. 状态与不变量

队列、定时器、重试计数投影和派发中的临时票据均可由 RunRegistry 重建。单机首版防止同一 Run 本地重复派发；多 Worker 档案要求唯一 Lease 与 Fence。

Deadline 是端到端绝对时间，只能缩短。技术重试受次数、时间和副作用事实约束；`UNKNOWN` 副作用、无安全 Checkpoint 或失效权限禁止自动重派。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `RunSchedulerPort` | 通知新 Run、恢复、取消与容量变化 |
| 出站 | `RunQueryPort` | 读取可运行条件与最新权威版本 |
| 出站 | `RunExecutionPort` | 申请 Attempt、提交派发或等待事实 |
| 出站 | `ExecutionResourcePort` | 获取和释放有界执行槽 |
| 出站 | `RuntimeDispatchPort` | 经 RuntimePool 派发、恢复或取消 Attempt |
| 出站 | `ClockPort` | 判定 Deadline、退避和租约时间 |

## 4. 调度算法

首版采用有界 FIFO 基线，并允许在明确技术类别内做公平轮转；业务优先级不得渗入。每次派发前重读 Run 版本、取消、Deadline、依赖、预算和副作用状态，随后占用资源、创建 Attempt 并派发。任一步失败均按确定顺序释放临时资源并重新判定。

## 5. 韧性与可观测性

- 启动扫描所有非终态 Run，重建队列而非恢复旧内存对象。
- 队列满稳定拒绝或保留已持久化等待事实，不创建无界协程。
- Runtime 接受结果未知时先查询 Attempt/Run，不直接重复执行。
- 记录队列深度、等待时间、派发延迟、重试原因、Deadline 超时和重复派发拦截。

## 6. 验收

- Root/Child Run 经过同一调度入口与资源限制。
- 进程重启后队列可以完整重建，且不重复已确认 Attempt。
- Deadline 到期、取消或未知副作用时派发次数为零。
- Scheduler 内业务步骤顺序、结果采纳和 Agent 团队优先级规则为零。
