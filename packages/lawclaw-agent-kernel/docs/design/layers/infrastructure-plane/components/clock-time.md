---
doc_id: INF-CMP-008
level: component
layer: infrastructure-plane
component: ClockTimeAdapter
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "ClockTimeAdapter 的状态、生命周期、算法与 Port 使用"
parent: INF-DES-001
interfaces: [BND-INF-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# Clock / Time Adapter 组件设计

## 职责与状态

向领域代码提供 UTC `TimePoint`、单调耗时和显式 IANA `TimeContext`。持久状态只保存 UTC 时间点与时区标识；领域代码不得直接读系统时钟。

## 规则

绝对 deadline 使用 UTC 判断且只能缩短；超时、Lease 持续时长使用单调时钟，避免墙钟跳变。DST 和时区仅影响展示或日历解释，不改写已持久化时间。测试 Adapter 必须可控并能注入回拨、前跳和边界时间。

## Ports 与故障

实现 `ClockPort`/时间机制，归属见 [`BND-INF-001`](../../../contracts/bnd-inf-001.md)。时钟异常导致 Permit 与副作用执行失败关闭；普通诊断必须显式报告 degraded。
