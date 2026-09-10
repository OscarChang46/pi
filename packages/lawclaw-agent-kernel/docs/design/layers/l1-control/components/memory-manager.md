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

## 开发设计：L1-CMP-010 / CD-1（2026-09-07）

候选开发设计，不代表实现或批准。分类：**独立组件**。字段与操作唯一维护于[CD-1契约](../../../contracts/component-development-contracts-v1.md#memory-manager)；早期概要中的签名待定、可选重试等简写按CD-1明确行为解释。分类依据见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

### 1. 问题与取舍

具体失效/验证轨迹：同candidateId提交两次：候选1，apply重投Entry1。需要下面的职责划分与明确提交/恢复点；协作者可用纯函数实现，不要求每个职责一个类、进程或公共Port。

### 2. 内部职责、依赖与生命周期

MemoryManager：Space与候选入口；ViewSelector：版本/范围过滤；CandidateReducer：append/supersedes校验；MemoryWritePEP：实际写入授权；Repository：独立事务。Runtime无直接Entry写接口。

本节细化既有Port允许的调用方向。跨组件只交换不可变值、稳定引用或Port，不传共享可变Run/Session。机制依然归Infrastructure，不因合并开发任务而搬入领域层。

### 3. 数据与操作

[数据与操作明细](../../../contracts/component-development-contracts-v1.md#memory-manager)给出字段、判别值和调用边界。写操作组合CD-1命令元数据，查询组合请求与可信作用域；Ref不构成访问授权。无状态对象仅为输入输出，不因此新建Repository。

MemoryView采用CD-1的`rankedEntries:[{entry,scoreRank}]`，排名是一次冻结检索的结果属性，MemoryEntry不持有scoreRank。返回前按scoreRank升序、entryId ASCII升序排序，条目身份唯一；相同冻结查询/索引输入必须同序。Context调用方保存视图后传入CTX-CON-1 MemoryAssemblySource；Context reader校验绑定并读取正文，不重新检索或重排评分。首次准备使用Host已有受控读取能力，没有现存Run时不得直接调用本组件要求runId的query。

### 4. 正常流程与分支

query先经Scoped查询授权，敏感跨Scope读取须PDP/Permit，再按已冻结索引的scoreRank、entryId稳定排序并过滤。submit只登记候选；apply校验来源和supersedes指向同Space现有版本，准备内容Artifact，消费同command Permit并authorizeStart；本地写入用commandId去重与expectedVersion CAS，把Entry、Candidate=applied、收据与审计outbox同事务提交。冲突不覆盖，原候选重新进入待决定状态，已消费许可不得用于不同内容。

先验证来源、Scope、大小、契约与幂等前置，再执行本节算法。明确区分纯计算结果、耐久受理回执和外部执行结果；外部操作只在必要状态提交后派发。

### 5. 并发、幂等与恢复

消费Permit后写失败只查询同command事务；确认尚未生效才允许同授权启动回执恢复本地幂等写入，须复核当前epoch/Deadline，不能新建等效候选。UNKNOWN保持pending核对。检索索引可重建，索引版本落后指定Space版本时返回DEPENDENCY_UNAVAILABLE，不能混读。

无法证明未执行时返回UNKNOWN，不返回absent或success。模型/工具首版自动执行重试0，查询有界重试与重新执行分开。并发验收同时核对状态版本、提交顺序和真实执行次数。

### 6. 安全

共享空间读写均有Scoped边界；仅接收候选不视为授权。原始chain-of-thought拒绝；supersedes不删除历史但旧内容不进入新版本可见View；撤销后缓存立即不可读。

普通遥测不含Prompt、Memory正文、工具参数、内容摘要、Secret、Permit或物理路径。必要安全审计走独立耐久Journal；普通遥测失败不回滚事实。拒绝路径同时保证未授权读取数和新副作用数为0。

### 7. 配置、容量与运维

Entry正文≤256KiB、候选元数据64KiB、View≤128条且1MiB；检索超时2秒；Space32MiB；查询缓存≤16MiB且epoch为键。

以上为设计目标，不是测量结果。配置启动校验、冻结configVersion，不能热更新放宽既有Run。指标使用CD-1封闭component/phase/result/code集合；共同告警、容量总账与保留期见CD-1。

诊断顺序：核对版本 → 查询本次身份与阶段 → 查询权威回执或投影来源 → 区分拒绝/未受理/已受理/UNKNOWN → 按本节恢复。禁止直接改数据库状态或放宽权限解除挂起。

### 8. SFMEA、故障注入与验收

局部表是契约验收矩阵，不对正常用例机械计算风险分数。具体失效原因、系统影响、严重度依据、控制措施与跨组件测试见[统一SFMEA](../../../reviews/components-2026-09-07/acceptance-matrix.md)。O/D无运行证据不估数值；全部具名风险均是强制实现验收项，不依赖RPN阈值。

| 场景/需求 | 输入、故障注入与精确预期 | 局部追踪 | 测试 |
|---|---|---|---|
| L1-CMP-010-SC-01/REQ-01 | 同candidateId提交两次：候选1，apply重投Entry1 | L1-CMP-010-FM-01 | L1-CMP-010-TC-01 |
| L1-CMP-010-SC-02/REQ-02 | 两个apply@9：一个10，另一冲突、不覆盖 | L1-CMP-010-FM-02 | L1-CMP-010-TC-02 |
| L1-CMP-010-SC-03/REQ-03 | T1读T2 Space：正文读取0且安全拒绝 | L1-CMP-010-FM-03 | L1-CMP-010-TC-03 |
| L1-CMP-010-SC-04/REQ-04 | supersedes其他Space条目：SCOPE_MISMATCH、写0 | L1-CMP-010-FM-04 | L1-CMP-010-TC-04 |
| L1-CMP-010-SC-05/REQ-05 | Permit消费后崩溃：查同command，不能写第二Entry | L1-CMP-010-FM-05 | L1-CMP-010-TC-05 |
| L1-CMP-010-SC-06/REQ-06 | 索引版本8查询Space9：显式不可用，不返回8冒充9 | L1-CMP-010-FM-06 | L1-CMP-010-TC-06 |

另增加L1-CMP-010-TC-07：同rank的B/A条目以A/B返回；不同查询可给同Entry不同rank但不得改Entry版本；视图重复entryId拒绝。CTX-SOURCE-T-01/02进一步验证Context消费视图的排序、版本/摘要/权限绑定。

上述用例均做契约/集成验证；纯算法使用冻结输入，涉及崩溃的用例加真实进程终止与SQLite/Artifact恢复，不能只重建内存实例。Faux Provider记录实际生效次数，测试不使用真实密钥或付费模型。用ManualClock和双屏障精确控制取消、到期和CAS竞态，不以sleep碰撞概率。

每例保存合成输入、契约/config/代码版本、屏障释放顺序、调用轨迹、期望/实际状态与数量、错误码、资源清理和泄漏扫描。必须分别注入未生效失败、已生效丢响应；预期不能由被测实现生成。

另覆盖合法成功、每个声明状态迁移与未声明状态×操作拒绝；限额逐个测L-1/L/L+1，两Scope交错和取消清理。性能按最大合法输入运行10,000次，记录Node/OS/CPU/内存和P99；异步组件按统一SFMEA的固定Faux负载测得C后，以0.8C到达速率持续30分钟，资源不超硬界限。独立实现验收报告必须区分替身、真实本地和真实外部证据。

### 9. 开发拆分与完成定义

顺序：契约验证 → 纯规则/状态机 → Repository或机制Adapter → 幂等/恢复 → 安全强制 → 具名故障和容量验收。实现分类为内部职责的随所属组件交付，不另建服务；条件启用项只有档案满足才启用。

文档就绪要求：五角色无未关闭P0/P1、字段和操作无未定义引用、恢复无开发者自由猜测分支、SFMEA映射验收、配置有硬界限。实现就绪另需代码、测试与持久性证据和架构所有者批准。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
