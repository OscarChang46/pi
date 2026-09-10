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

PEP 通过 Permission Decision 操作对不可变 `ActionProposal` 获取 Allow、Ask 或 Deny，并可查询异步审批状态；执行点通过 Permit Validation 操作校验并原子消费 `ExecutionPermit`。候选签名见[CD-1](component-development-contracts-v1.md#permission-decision-engine)，内部数据、提交与恢复补充见[SEC-DEC-1](../layers/security-plane/contracts/security-decision-contract.md)，仍待契约批准。

Kernel 只消费已编译技术策略快照，不拥有 RBAC/ABAC 权威库。Allow 产生短时、绑定 Run/Agent/ActionDigest/epoch/expiry 的一次性 Permit；Ask 持久化请求后异步等待，不占用执行槽；Deny 和不可解析结果均失败关闭。L1 PEP 请求 PDP 决策，L3 ExecutionGuard 只校验并消费 Permit，不作第二次策略裁决。

consume只确认一次消费；authorizeStart复核当前资格并提供启动Grant，工具执行的唯一派发资格由L1/Host可靠性边界保证，L3不承担STARTED CAS。必要审计未确认不开放依赖动作；批准事实不是Permit。非工具动作沿用CD-1 SecurityAction封闭联合及首版Ask限制，不能以工具专用Proposal省略Memory/Child绑定。

本版tool.execute使用[BND-L34](bnd-l34-001.md)§4的ToolTargetV1作为CD-1 SecurityAction.payload，替代CD-1旧工具专用payload；targetDigest仍按CD-1通用公式，actionDigest仍按FE原算法。L1必须在decide前固定proposal、route、resourceProfileRef、limits、scope和deadline；Guard只核验同一目标及消费/确认，Host安装planDigest对应Admission，L4只验证该受信装配绑定。新增资源不得在Permit后注入，非工具动作payload不变。

SessionManager 的 `child.create` 也是受保护执行点：SM拥有Fork/Join及Session提交，Security拥有Decision/Permit/Receipt/Grant。跨边界只传 `executionEnvelopeRef` 和安全记录引用；AgentSession、JoinBarrier、JoinMember不得内嵌安全对象、权限集合或消费状态副本。引用不构成授权，重启恢复必须查询原安全事实；Parent授权不能作为Child后续动作的执行权。
