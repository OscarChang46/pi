---
doc_id: INF-CMP-001
level: component
layer: infrastructure-plane
component: StateStorage
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "StateStorage 的状态、生命周期、算法与 Port 使用"
parent: INF-DES-001
interfaces: [BND-INF-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# StateStorage 组件设计

## 职责与状态

为 Session、Run/Attempt/Step、Event、ToolCall、Permission 和审计提供代码级 Repository Adapter。拥有数据库事务、乐观版本和恢复游标；领域聚合及其状态转换仍由上层拥有。

## 规则

首版使用 SQLite WAL 与 optimistic CAS。状态与对应持久事件在同一事务提交，提交前不得发布；本地通知丢失后从 Event Journal 补拉。队列仅保存可运行提示，不能成为 Run 权威状态。写入以稳定 ID 去重，旧 attempt/version/fence 写入拒绝。

## Ports 与恢复

实现 Repository Port，契约归属见 [`BND-INF-001`](../../../contracts/bnd-inf-001.md)。数据库不可用时新命令不得假装受理；事务失败不派发 Runtime。重启扫描权威状态，未知副作用保持未知而非自动重放。
