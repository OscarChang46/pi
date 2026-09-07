---
doc_id: BND-OPS-001
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "BND-OPS-001 Kernel 与 Operations Plane 的边界契约"
parent: SYS-DES-001
interfaces: [BND-OPS-001]
diagrams: []
supersedes: [docs/design/c4-boundary-protocols.md]
---

# BND-OPS-001：Kernel → Operations Plane

## 操作族

Observability 接收脱敏日志、Span 和低基数指标；Security Audit 追加安全事实；Operations Query 返回健康、指标和诊断 Artifact。具体签名与 DTO 待步骤二确认。

## 语义

`OperationContext` 传播 W3C trace、correlation、causation、deadline 和 TimeContext。普通日志/Trace/指标有界异步、允许可见丢弃，失败不得推进或回滚领域状态。安全审计本地耐久且 append-only；写入失败时受保护副作用失败关闭。OTLP/Prometheus 仅为可选 Exporter，不是权威存储；运维平面不能反向修改 Run、Permit、ToolCall 或 Memory。
