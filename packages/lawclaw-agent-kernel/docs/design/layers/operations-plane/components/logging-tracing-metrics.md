---
doc_id: OPS-CMP-002
level: component
layer: operations-plane
component: LoggingTracingMetrics
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "LoggingTracingMetrics 的状态、生命周期、算法与 Port 使用"
parent: OPS-DES-001
interfaces: [BND-OPS-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# Logging / Tracing / Metrics 组件设计

## 职责与状态

提供结构化日志、本地 Span Recorder 和内存指标快照。拥有滚动文件游标、活动 Span 与低基数聚合器，不拥有业务状态。

## 规则

- 日志记录时间、级别、组件、稳定错误码及 run/attempt/session 引用；JSONL 协议使用 stdout 时日志只写 stderr。
- Trace 覆盖 Gateway、Scheduler、Context、Model、Permission、Tool、Sandbox 和 Storage；异步阶段用 correlation/causation 连接。
- 指标记录队列深度、执行槽、错误数和阶段耗时，禁止把 runId、正文或工具参数作为标签。
- 所有记录先执行白名单化与脱敏；Provider 异常正文只能转为 `detailsRef`。

## Ports 与故障

入站由 `ObservabilityPort` 承载，查询快照由 OperationsQuery 边界承载；候选语义见 [`BND-OPS-001`](../../../contracts/bnd-ops-001.md)。文件不可写或 Exporter 失败时进入 DEGRADED，Run 不回滚，丢弃数量必须可见且有界。
