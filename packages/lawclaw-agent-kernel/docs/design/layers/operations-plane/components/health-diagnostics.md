---
doc_id: OPS-CMP-003
level: component
layer: operations-plane
component: HealthDiagnostics
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "HealthDiagnostics 的状态、生命周期、算法与 Port 使用"
parent: OPS-DES-001
interfaces: [BND-OPS-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# Health / Diagnostics 组件设计

## 职责

聚合 Kernel、SQLite、队列、Activity执行宿主、PDP、Sandbox 和时钟探针，输出只读 liveness、readiness、degraded 状态及有界诊断包。

## 状态与算法

健康状态是带采集时间和原因码的投影，不是领域状态。liveness 只判断进程能否服务探针；readiness 判断能否安全受理新 Run；单个可选 Exporter 故障只导致 degraded。诊断包按白名单收集版本、配置摘要、健康、最近错误和指标，写入 Artifact 后返回不透明引用。

## Ports 与故障

入站为探针结果和 OperationsQuery；出站使用 `ArtifactPort` 与 `ClockPort`。候选查询语义见 [`BND-OPS-001`](../../../contracts/bnd-ops-001.md)。探针超时必须显式为 UNKNOWN/DEGRADED，不能猜测健康；诊断失败不得修改任何 Run。
