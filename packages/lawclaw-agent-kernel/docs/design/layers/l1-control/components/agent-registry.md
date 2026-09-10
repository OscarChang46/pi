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

## 开发设计：L1-CMP-003 / CD-1（2026-09-07）

候选开发设计，不代表实现或批准。分类：**独立组件**。字段与操作唯一维护于[CD-1契约](../../../contracts/component-development-contracts-v1.md#agent-registry)；早期概要中的签名待定、可选重试等简写按CD-1明确行为解释。分类依据见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

### 1. 问题与取舍

具体失效/验证轨迹：双写expectedVersion=4：仅一个发布5，另一个VERSION_CONFLICT。需要下面的职责划分与明确提交/恢复点；协作者可用纯函数实现，不要求每个职责一个类、进程或公共Port。

### 2. 内部职责、依赖与生命周期

AgentRegistry：聚合命令；DefinitionValidator：纯完整性规则；DescriptorProjector：公开视图；Repository：唯一耐久版本库。查询缓存只存不可变值。

本节细化既有Port允许的调用方向。跨组件只交换不可变值、稳定引用或Port，不传共享可变Run/Session。机制依然归Infrastructure，不因合并开发任务而搬入领域层。

### 3. 数据与操作

[数据与操作明细](../../../contracts/component-development-contracts-v1.md#agent-registry)给出字段、判别值和调用边界。写操作组合CD-1命令元数据，查询组合请求与可信作用域；Ref不构成访问授权。无状态对象仅为输入输出，不因此新建Repository。

### 4. 正常流程与分支

校验目标版本=expectedVersion+1，能力集合排序去重、Persona引用已发布；一个事务插入不可变版本、CAS head、收据和发布事件。退役只CAS head不删除历史。查询指定版本精确读取；未指定版本读一次head后读取该版本，不能混合新旧字段。

先验证来源、Scope、大小、契约与幂等前置，再执行本节算法。明确区分纯计算结果、耐久受理回执和外部执行结果；外部操作只在必要状态提交后派发。

### 5. 并发、幂等与恢复

发布响应丢失按commandId查询同一版本；CAS冲突不尝试覆盖。缓存键包含作用域、agentId、version；负缓存1秒，变更通知丢失不影响指定版本读取。恢复仅加载head索引，不重新发布。

无法证明未执行时返回UNKNOWN，不返回absent或success。模型/工具首版自动执行重试0，查询有界重试与重新执行分开。并发验收同时核对状态版本、提交顺序和真实执行次数。

### 6. 安全

发布/退役需技术配置写能力，运行信封只有可见描述读能力。Descriptor公开投影排除Secret、外部身份、Provider句柄和内部路径。已冻结Run遇定义撤销时由当前安全epoch拒绝执行，不靠删除历史。

普通遥测不含Prompt、Memory正文、工具参数、内容摘要、Secret、Permit或物理路径。必要安全审计走独立耐久Journal；普通遥测失败不回滚事实。拒绝路径同时保证未授权读取数和新副作用数为0。

### 7. 配置、容量与运维

定义单条64KiB、能力最多128、分页256、缓存1024版本且16MiB；保留被Run引用版本；未引用退役版本保留30天。

以上为设计目标，不是测量结果。配置启动校验、冻结configVersion，不能热更新放宽既有Run。指标使用CD-1封闭component/phase/result/code集合；共同告警、容量总账与保留期见CD-1。

诊断顺序：核对版本 → 查询本次身份与阶段 → 查询权威回执或投影来源 → 区分拒绝/未受理/已受理/UNKNOWN → 按本节恢复。禁止直接改数据库状态或放宽权限解除挂起。

### 8. SFMEA、故障注入与验收

局部表是契约验收矩阵，不对正常用例机械计算风险分数。具体失效原因、系统影响、严重度依据、控制措施与跨组件测试见[统一SFMEA](../../../reviews/components-2026-09-07/acceptance-matrix.md)。O/D无运行证据不估数值；全部具名风险均是强制实现验收项，不依赖RPN阈值。

| 场景/需求 | 输入、故障注入与精确预期 | 局部追踪 | 测试 |
|---|---|---|---|
| L1-CMP-003-SC-01/REQ-01 | 双写expectedVersion=4：仅一个发布5，另一个VERSION_CONFLICT | L1-CMP-003-FM-01 | L1-CMP-003-TC-01 |
| L1-CMP-003-SC-02/REQ-02 | 发布响应丢失再发：版本仍5、事件1条 | L1-CMP-003-FM-02 | L1-CMP-003-TC-02 |
| L1-CMP-003-SC-03/REQ-03 | 退役后新路由不选中，历史Run仍能读旧版本 | L1-CMP-003-FM-03 | L1-CMP-003-TC-03 |
| L1-CMP-003-SC-04/REQ-04 | 缓存中T1同agentId与T2交错：无跨作用域描述 | L1-CMP-003-FM-04 | L1-CMP-003-TC-04 |
| L1-CMP-003-SC-05/REQ-05 | descriptor中Secret字段：SCHEMA_INVALID，写入0 | L1-CMP-003-FM-05 | L1-CMP-003-TC-05 |
| L1-CMP-003-SC-06/REQ-06 | 1025个版本读取：LRU淘汰，缓存≤16MiB | L1-CMP-003-FM-06 | L1-CMP-003-TC-06 |

六例均做契约/集成验证；纯算法使用冻结输入，涉及崩溃的用例加真实进程终止与SQLite/Artifact恢复，不能只重建内存实例。Faux Provider记录实际生效次数，测试不使用真实密钥或付费模型。用ManualClock和双屏障精确控制取消、到期和CAS竞态，不以sleep碰撞概率。

每例保存合成输入、契约/config/代码版本、屏障释放顺序、调用轨迹、期望/实际状态与数量、错误码、资源清理和泄漏扫描。必须分别注入未生效失败、已生效丢响应；预期不能由被测实现生成。

另覆盖合法成功、每个声明状态迁移与未声明状态×操作拒绝；限额逐个测L-1/L/L+1，两Scope交错和取消清理。性能按最大合法输入运行10,000次，记录Node/OS/CPU/内存和P99；异步组件按统一SFMEA的固定Faux负载测得C后，以0.8C到达速率持续30分钟，资源不超硬界限。独立实现验收报告必须区分替身、真实本地和真实外部证据。

### 9. 开发拆分与完成定义

顺序：契约验证 → 纯规则/状态机 → Repository或机制Adapter → 幂等/恢复 → 安全强制 → 具名故障和容量验收。实现分类为内部职责的随所属组件交付，不另建服务；条件启用项只有档案满足才启用。

文档就绪要求：五角色无未关闭P0/P1、字段和操作无未定义引用、恢复无开发者自由猜测分支、SFMEA映射验收、配置有硬界限。实现就绪另需代码、测试与持久性证据和架构所有者批准。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
