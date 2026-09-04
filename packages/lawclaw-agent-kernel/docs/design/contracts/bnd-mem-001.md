---
doc_id: BND-MEM-001
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "边界契约、公共元数据或契约语义的唯一来源"
parent: SYS-DES-001
interfaces: [BND-MEM-001]
diagrams: []
supersedes: [docs/design/c4-boundary-protocols.md]
---

# BND-MEM-001：Context / Runtime ↔ Memory

Memory Query 根据授权快照返回最小只读 `MemoryView`；Memory Candidate 提交带来源与敏感等级的候选并查询审核状态。具体签名待步骤二确认。

Memory Domain 拥有长期记忆权威状态；Context 只消费冻结视图并形成 `ContextFrame`。候选提交不等于进入共享空间，既有条目不可被 Agent 直接覆盖。跨 Agent 或 ExecutionScope 读取必须重新授权；不得共享可变 Context 或泄露存储内部字段。
