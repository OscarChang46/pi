---
doc_id: L2-CMP-001
level: component
layer: L2 Cognitive Runtime
component: AgentRuntime / AgentLoop
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: AgentRuntime 临时状态、Agent Loop 推进与暂停恢复语义
parent: L2-DES-001
interfaces: [BND-L12-001, AgentAdapterPort]
diagrams: []
supersedes: ["[归档 Run 调度与 Runtime 设计](../../../../governance/archive/design-v3-pre-layering/run-scheduling-runtime-subsystem-design.md) 中的 Runtime 执行部分"]
---

# AgentRuntime / AgentLoop 组件设计

## 职责

AgentRuntime 是可重建的执行领域服务，连续处理 L1 派发的 Attempt；AgentLoop 是单个 Attempt 内按序执行模型步骤、接收规范结果并形成候选动作的算法。它不拥有 Run，不负责调度、权限、工具执行、Session 持久化或业务编排。

## 状态与不变量

- 仅保存当前 Attempt 的循环游标、已确认事件序号、剩余预算和暂停原因；进程丢失后可由 L1 Journal 重建。
- 同一 Attempt 同时最多有一个有效推进者；多 Worker 场景必须尊重 L1 提供的 Lease/Fence。
- Deadline、取消或步数预算触发后不得产生新的模型、工具或委派动作。
- 工具候选发出后进入暂停态，只有 L1 的已持久化结果或拒绝结果可以恢复。

## 入站与出站 Port

入站由 L1 的 Runtime Control 语义覆盖：派发、恢复、取消和只读检查。出站只使用 Runtime Event 与 `AgentAdapterPort`；工具候选、记忆候选和委派候选全部作为规范事件返回 L1，不直接调用对应执行层。

## 推进算法

每一步先校验取消、Deadline 和预算，再读取冻结输入调用 Adapter；随后校验规范事件、按序提交 L1。若产生受保护动作候选则暂停；若产生最终回答或不可恢复故障则收敛。事件未获 L1 确认前不得越过该序号继续推进。

## 并发、恢复与故障

重复派发和重复恢复按 Attempt 与事件序号去重。模型调用超时只表示调用结果未知，不自动重放可能产生副作用的后续动作。Runtime 崩溃后由 L1 判定 Attempt 是否恢复、重试或终止，Runtime 本身不得修改权威状态。

## 契约边界

本文只定义控制方向与不变量，不冻结 Dispatch、Resume、Event 的字段和错误码。
