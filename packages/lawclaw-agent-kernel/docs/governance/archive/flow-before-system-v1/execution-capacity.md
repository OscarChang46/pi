---
doc_id: INF-CMP-003
level: component
layer: infrastructure-plane
component: ExecutionCapacity
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "ExecutionCapacity 的状态、生命周期、算法与 Port 使用"
parent: INF-DES-001
interfaces: [BND-INF-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# ExecutionCapacity 组件设计

## 职责与状态

提供执行槽、Sandbox 槽、临时资源额度和有界等待机制。拥有信号量、等待队列和 Lease 的技术状态，不决定 Run 优先级、Child Run 结构或业务配额。

## 算法与并发

上层 ResourceManager 提交已经计算好的资源类别和上限；本组件以有界 FIFO/信号量获取与释放。取消和 deadline 会移除等待者；每个成功获取都生成可幂等释放的 Handle。队列满返回稳定资源失败，禁止扩成无界 Buffer。

## Ports 与恢复

实现 ExecutionResource 类 Port，归属见 [`BND-INF-001`](../../../contracts/bnd-inf-001.md)。进程重启后内存 Lease 全部失效，由权威 Run/ToolCall 状态重新协调；不能依据旧 Lease 自动启动动作。
