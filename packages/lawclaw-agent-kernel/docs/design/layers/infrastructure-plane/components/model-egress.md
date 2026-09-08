---
doc_id: INF-CMP-006
level: component
layer: infrastructure-plane
component: ModelEgress
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "ModelEgress 的状态、生命周期、算法与 Port 使用"
parent: INF-DES-001
interfaces: [BND-INF-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# ModelEgress 组件设计

## 职责与状态

提供到已配置 Model Provider 的 HTTPS/流式出口、deadline、取消和连接限制。它不理解 Prompt、Provider 事件或模型重试策略；这些属于 L2 PiAgentAdapter 私有边界。

## 规则

只允许白名单端点与 TLS 配置；从 `SecretHandle` 短时取得凭据，不记录正文。继承端到端截止时间并支持取消，响应大小和流窗口有界。Provider SDK 类型不越过 Adapter。

## Ports 与故障

实现 PiAgentAdapter 私有使用的出口机制；公共 Kernel 只暴露 `AgentAdapterPort`，不暴露 `ModelInvocationPort`。连接失败返回稳定技术类别，由 Adapter 按动作阶段决定有限重试；不得绕过出口策略直连。
