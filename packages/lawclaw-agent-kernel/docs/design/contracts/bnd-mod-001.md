---
doc_id: BND-MOD-001
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "边界契约、公共元数据或契约语义的唯一来源"
parent: SYS-DES-001
interfaces: [BND-MOD-001]
diagrams: []
supersedes: [docs/design/c4-boundary-protocols.md]
---

# BND-MOD-001：PiAgentAdapter ↔ Model Provider

这是 PiAgentAdapter 的私有供应商边界，不是 Kernel 公共 Port。Kernel 公共模型适配边界只保留 `AgentAdapterPort`；原 `ModelInvocationPort` 语义下沉到 Adapter 内部。

Provider HTTPS/SSE、SDK 类型、认证、重试和私有输出解析全部止于 Adapter；Adapter 产生规范化事件与 `ToolCallCandidate`。L2 Parser 只校验规范化事件，不解析 Provider 私有格式。出口继承 deadline、取消和大小限制，Secret 以短时 Handle 解析且不得进入公共 DTO。
