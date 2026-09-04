---
doc_id: OPS-CMP-001
level: component
layer: operations-plane
component: TelemetryPipeline
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "TelemetryPipeline 的状态、生命周期、算法与 Port 使用"
parent: OPS-DES-001
interfaces: [BND-OPS-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# TelemetryPipeline 组件设计

## 职责

接收已经脱敏、具有 `OperationContext` 的遥测记录，执行有界排队、批处理、采样和可选导出。它只保存传输状态与丢弃计数，不解释 Agent 领域语义。

## 状态与生命周期

状态为 `RUNNING / DEGRADED / DRAINING / STOPPED`，拥有有界队列、批次游标、Exporter 健康和按信号类型聚合的 drop counter。启动先开放本地 Sink，再启用可选 Exporter；关闭时仅在截止时间内排空，超时后记录丢弃并停止。

## 入站与出站 Port

- 入站：`ObservabilityPort` 的日志、Span、指标记录。
- 出站：本地 Log/Trace/Metric Sink；可选 OTLP Exporter；`ClockPort`。
- 接口签名及 DTO 只在 [`BND-OPS-001`](../../../contracts/bnd-ops-001.md) 定义，本文件不固化签名。

## 算法与并发恢复

按信号类型进入独立有界队列，低优先级样本先采样或丢弃；安全审计不经过本组件。Exporter 熔断后继续写本地 Sink，并以低基数计数暴露降级。重启不尝试重放非耐久遥测；不得借助遥测恢复或修改 Run。
