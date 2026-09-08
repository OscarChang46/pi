---
doc_id: L1-CMP-011
level: component
layer: L1 Control & Orchestration Runtime
component: ResourceManager
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 进程级执行槽、临时资源预算、背压和释放规则
parent: L1-DES-001
interfaces: [ExecutionResourcePort, ExecutionCapacityPort, ProcessPort, ClockPort]
diagrams: []
supersedes: [session-flow-engine-resource-subsystem-design.md 中的 ResourceManager 内容]
---

# ResourceManager 组件设计

## 1. 目标与非目标

ResourceManager 为已经被 Scheduler 判定可运行的 Attempt 分配有界执行槽与临时资源预算，保护 Host 不被队列、内存、进程或 Sandbox 并发耗尽。

它不拥有 Run 状态，不解释业务优先级，不选择 Agent 路由，不创建物理容器，也不把资源 Lease 当作 Runtime Lease。

## 2. 所有状态与不变量

本组件只拥有进程内临时占用表、Semaphore、等待队列和资源 Lease；这些不是领域权威状态，崩溃后由 Scheduler/Run 状态重新收敛。每个 acquire 必须有 Deadline、类别与硬上限，每个 release 幂等。

Session 不占执行槽；挂起 Run 必须释放槽。队列、槽、内存、进程和临时 Artifact 配额均有硬上限。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `ExecutionResourcePort` | 获取、释放执行槽并查询脱敏容量快照 |
| 出站 | `ExecutionCapacityPort` | 查询宿主可提供的机制容量 |
| 出站 | `ProcessPort` | 需要时申请有界进程机制，不传递领域规则 |
| 出站 | `ClockPort` | 处理 Deadline 和 Lease 过期 |

## 4. 分配算法

首版在资源类别内使用有界 FIFO 与 Semaphore。请求先校验硬上限和 Deadline，再排队；获得槽后返回不可伪造的临时 Lease。完成、失败、取消、超时和派发失败均进入同一幂等释放路径。业务优先级不参与排序。

## 5. 韧性与可观测性

- 队列满或预算耗尽稳定拒绝，不无限等待或创建无界协程。
- 调用方取消时移除等待项；已分配 Lease 进入幂等释放。
- 容量 Provider 不可用时停止新分配，不影响已持有 Lease 的清理。
- 记录队列深度、活跃槽、等待时长、拒绝原因、超时和疑似泄漏。

## 6. 验收

- 最大并发 Attempt 不超过配置硬上限。
- Run 挂起、取消或终态后执行槽最终归零且 release 可重复调用。
- 大量 Session 不增加执行槽或常驻协程数量。
- ResourceManager 内业务优先级和 Run 状态迁移逻辑为零。
