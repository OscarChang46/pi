---
doc_id: INF-CMP-005
level: component
layer: infrastructure-plane
component: Transport
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "Transport 的状态、生命周期、算法与 Port 使用"
parent: INF-DES-001
interfaces: [BND-INF-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# Transport 组件设计

## 职责与状态

把稳定 Port 绑定到进程内调用、stdio JSONL 或可选 Loopback HTTP/SSE。拥有连接、帧、窗口和 Ack 技术状态，不实现调度、权限、持久化重试或恢复。

## 规则

JSONL 初始化协商主版本、能力和最大帧；stdout 保持协议纯净，日志写 stderr。每个连接有最大帧、未确认事件和队列上限。断线仅表示传输结果未知，不能被解释为 Run 取消或动作未执行。

## Ports 与恢复

实现各边界的 Transport Adapter；公共语义见 [Contracts](../../../contracts/README.md)。重连使用稳定 request/command ID 和事件序号补拉；是否重试由调用方契约决定。
