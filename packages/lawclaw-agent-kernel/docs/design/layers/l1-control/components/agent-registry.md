---
doc_id: L1-CMP-003
level: component
layer: L1 Control & Orchestration Runtime
component: AgentRegistry
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: AgentDefinition 聚合、版本历史和公开技术描述
parent: L1-DES-001
interfaces: [AgentRegistryCommandPort, AgentRegistryQueryPort, AgentDefinitionRepositoryPort, DomainEventPort]
diagrams: []
supersedes: [agent-registry-routing-subsystem-design.md 中的 Registry 内容]
---

# AgentRegistry 组件设计

## 1. 目标与非目标

Registry 管理可版本化的 Agent 技术定义，为 Gateway 和 CapabilityRouter 提供稳定、Provider 无关的描述。它不执行 Agent，不创建 Run，不解释业务优先级，也不保存运行中健康状态为定义事实。

## 2. 所有状态与不变量

`AgentDefinition` 是本组件唯一权威聚合，拥有不可变的已发布 `AgentDefinitionVersion`，其中组合 Agent 描述、能力描述、技术 Persona 和可路由约束。已发布版本不可原地修改；退役只影响新选择，不修改既有 Run 的冻结快照。

Pi、模型 Provider 和 Adapter 私有类型不得进入 Definition。团队角色、成员关系和仲裁策略不属于 Registry。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `AgentRegistryCommandPort` | 发布新版本、退役定义和更新可公开状态 |
| 入站 | `AgentRegistryQueryPort` | 按 ID、版本或能力约束读取不可变描述 |
| 出站 | `AgentDefinitionRepositoryPort` | 持久化聚合及版本历史 |
| 出站 | `DomainEventPort` | 在提交后发布定义变更事实 |

## 4. 生命周期与算法

草稿经完整性和版本冲突校验后生成新版本；提交成功后才发布事件。查询返回不可变 Descriptor 或稳定引用。退役后仍可按历史引用读取，以保证 Run 恢复和审计。

## 5. 韧性与可观测性

- 发布使用期望版本与幂等键，冲突时不覆盖。
- 存储不可用时停止发布；不得只更新内存缓存。
- 缓存只加速查询，失效不会改变权威版本。
- 记录版本发布、退役、查询缺失和冲突计数；不记录 Secret 或 Provider 凭据。

## 6. 验收

- 已发布版本修改路径为零，历史 Run 始终可解析冻结版本。
- Adapter 健康变化不改写 AgentDefinition。
- Registry 内业务角色、Team 与 Provider 原生类型数量为零。
- AgentDefinition 只由本组件文档定义为权威状态。
