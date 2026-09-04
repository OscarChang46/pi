---
doc_id: L1-CMP-010
level: component
layer: L1 Control & Orchestration Runtime
component: MemoryManager
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: MemorySpace、授权 MemoryView、MemoryCandidate 和长期记忆演进
parent: L1-DES-001
interfaces: [MemoryQueryPort, MemoryCandidatePort, PermissionDecisionPort, PermitValidationPort, MemoryRepositoryPort, ArtifactPort]
diagrams: []
supersedes: [context-memory-subsystem-design.md 中的 MemoryManager 内容]
---

# MemoryManager 组件设计

## 1. 目标与非目标

MemoryManager 管理长期记忆的版本化、授权读取和候选写入，使 ContextEngine 只消费冻结视图，使 Agent 不能直接覆盖共享记忆。

它不拥有 Session/ContextFrame，不隐式共享完整上下文，不解释 Tenant/RBAC，不根据 Multi-agent 团队关系自动扩大访问。

## 2. 所有状态与不变量

`MemorySpace` 是本组件权威聚合，拥有 Entry、版本、敏感级别、来源和授权范围。共享更新采用 append-only 与 `supersedes`，不原地覆盖。Runtime 和 Subagent 只能提交 `MemoryCandidate`；Candidate 被接受不等于自动写入任意共享空间。

跨 Agent、ExecutionScope 或共享范围的读写必须经过安全决策；Permit 或授权版本无效时失败关闭。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `MemoryQueryPort` | 返回绑定版本与授权范围的只读 MemoryView |
| 入站 | `MemoryCandidatePort` | 幂等提交并查询候选状态 |
| 出站 | `PermissionDecisionPort` | 对敏感读取或候选提交请求 PDP 决策 |
| 出站 | `PermitValidationPort` | 在实际提交点验证并消费 Permit |
| 出站 | `MemoryRepositoryPort` | 持久化 MemorySpace 与 Candidate |
| 出站 | `ArtifactPort` | 保存大记忆内容并使用不透明引用 |

## 4. 生命周期与算法

查询先校验授权范围和目标版本，再做相关性检索、敏感级别过滤与冻结。候选提交先保存来源和摘要，完成权限与策略校验后 append 新 Entry 或建立 supersedes 关系；任何拒绝都保留可审计状态而不改变 Space。

## 5. 韧性与可观测性

- 存储不可用时不得从过期或跨作用域缓存返回正文。
- 同 candidateId 重复提交返回原状态；异载荷冲突。
- 并发版本冲突重新加载，不覆盖其他 Entry。
- 记录查询数量、过滤数、Candidate 结果、冲突和 Permit 失败；日志不含 Memory 正文。

## 6. 验收

- Agent 直接创建或覆盖 MemoryEntry 的路径为零。
- 未授权跨 Agent/Scope 查询返回内容数量为零并产生安全审计。
- 同一 Candidate 重放最多产生一个 Entry。
- Multi-agent 组合不改变 Memory 的授权与版本规则。
