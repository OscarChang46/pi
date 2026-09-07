---
doc_id: BND-SEC-001
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "BND-SEC-001 PEP 与 PDP/Permit 的边界契约"
parent: SYS-DES-001
interfaces: [BND-SEC-001]
diagrams: []
supersedes: [docs/design/c4-boundary-protocols.md]
---

# BND-SEC-001：PEP ↔ PDP / Permit

PEP 通过 Permission Decision 操作对不可变 `ActionProposal` 获取 Allow、Ask 或 Deny，并可查询异步审批状态；执行点通过 Permit Validation 操作校验并原子消费 `ExecutionPermit`。具体签名待步骤二确认。

Kernel 只消费已编译技术策略快照，不拥有 RBAC/ABAC 权威库。Allow 产生短时、绑定 Run/Agent/ActionDigest/epoch/expiry 的一次性 Permit；Ask 持久化请求后异步等待，不占用执行槽；Deny 和不可解析结果均失败关闭。L1 PEP 请求 PDP 决策，L3 ExecutionGuard 只校验并消费 Permit，不作第二次策略裁决。
