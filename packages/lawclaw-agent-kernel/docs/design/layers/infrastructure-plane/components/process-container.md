---
doc_id: INF-CMP-004
level: component
layer: infrastructure-plane
component: ProcessContainer
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "ProcessContainer 的状态、生命周期、算法与 Port 使用"
parent: INF-DES-001
interfaces: [BND-INF-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# Process / Container 组件设计

## 职责与状态

按上层已授权的执行计划创建、监控、终止并回收本地子进程或可选容器。拥有 PID/容器句柄、stdio、挂载、出口及清理状态，不判断工具是否获准。

## 生命周期

`CREATING → RUNNING → TERMINATING → RECLAIMED`，失败进入 `FAILED_RECLAIM_PENDING` 并由有界清理器重试。创建前校验资源上限；结束后关闭流、撤销挂载/网络/Secret Lease 并回收句柄。Sandbox 创建失败不得回退宿主 Shell。

## Ports

实现 Process/Container 机制 Port；L4 Sandbox 是唯一面向工具执行的上层调用者。契约归属见 [`BND-INF-001`](../../../contracts/bnd-inf-001.md)，沙箱边界见 [`BND-L34-001`](../../../contracts/bnd-l34-001.md)。
