---
doc_id: SYS-DEP-002
level: deployment
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "部署绑定与 Composition Root"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# Local-first 部署档案

## 首版绑定

| 边界 | 默认 | 可选本地隔离 |
|---|---|---|
| EXT ↔ L1 | CLI 进程内 Gateway | Desktop Host ↔ stdio JSONL Sidecar；Loopback HTTP/SSE 可选 |
| L1 内部 | 强类型 Port、本地有界队列、SQLite 事务 | 同左 |
| L1 ↔ L2 | 进程内 Runtime | stdio JSONL Pi Runtime 子进程 |
| PEP ↔ PDP | 进程内 | 同左 |
| L1 ↔ L3 | 进程内 | 可选 UDS，但非首版要求 |
| L3 ↔ L4 | 同进程只读 Adapter 或一次性子进程 JSONL | 可选本地容器 |
| Memory | 进程内 Port + SQLite/Artifact | 同左 |
| Operations | 本地日志、Trace、指标快照、SQLite 审计 | 可选 OTLP Exporter |

首版不引入 Temporal、Kafka/独立 Event Bus、内部 gRPC、服务发现、分布式锁、MicroVM 编排或远程遥测集群。后续只有在跨主机 Worker、多个耐久消费者、独立扩缩容或更强隔离成为实际需求时才评估；切换绑定不得改变 [`contracts/`](../contracts/README.md) 的语义。

## 安全与恢复

Sidecar 不监听公网或局域网端口；Loopback HTTP 仅绑定回环地址并使用本机随机凭据。重启从 SQLite 权威状态扫描恢复；连接断开与本地通知丢失不等于领域动作未发生。
