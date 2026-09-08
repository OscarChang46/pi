---
doc_id: INF-CMP-007
level: component
layer: infrastructure-plane
component: SecretResolver
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SecretResolver 的状态、生命周期、算法与 Port 使用"
parent: INF-DES-001
interfaces: [BND-INF-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# SecretResolver 组件设计

## 职责与状态

在当前执行信封作用域内把不透明 `SecretHandle` 解析成短时、不可持久化的 Secret Lease。只拥有解析映射、Lease 生命周期和使用摘要，不拥有用户身份或 RBAC/ABAC 规则。

## 生命周期与安全

`HANDLE_VALIDATED → LEASE_ACTIVE → REVOKED/ZEROIZED`。解析前校验 scope、purpose、expiry；越权时拒绝且不泄露 Secret 是否存在。明文只在执行瞬间存在，不进入 DTO、事件、日志、Trace、指标、Artifact 或错误。

## Ports

实现 `SecretResolverPort` 候选语义，见 [`BND-INF-001`](../../../contracts/bnd-inf-001.md)。审计只记录 Handle 摘要和结果；时钟或作用域不可验证时失败关闭。
