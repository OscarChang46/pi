---
doc_id: L1-CMP-004
level: component
layer: L1 Control & Orchestration Runtime
component: CapabilityRouter
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 能力匹配、技术候选排序和 RouteProposal 生成
parent: L1-DES-001
interfaces: [CapabilityRoutingPort, AgentRegistryQueryPort, AdapterCapabilityPort]
diagrams: []
supersedes: [agent-registry-routing-subsystem-design.md 中的路由内容]
---

# CapabilityRouter 组件设计

## 1. 目标与非目标

CapabilityRouter 把已验证的能力要求与已发布 Agent 描述、Adapter 技术能力和健康信息进行匹配，输出可解释的 `RouteProposal`。它不创建 Run、不冻结路由、不解释业务价值或优先级，也不实例化 Adapter。

## 2. 状态与不变量

本组件无持久权威状态。`RouteProposal` 是带候选版本、约束满足证据和拒绝理由的查询结果；RunRegistry 在受理 Run 时校验并创建唯一权威 `RouteSnapshot`。

相同冻结输入应产生确定性候选顺序。实时健康只能影响新 Proposal，不能静默替换运行中 Run 的路由。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `CapabilityRoutingPort` | 根据能力约束请求技术路由候选 |
| 出站 | `AgentRegistryQueryPort` | 获取已发布、Provider 无关的定义快照 |
| 出站 | `AdapterCapabilityPort` | 获取 Adapter 支持能力和脱敏健康快照 |

## 4. 算法

算法依次完成硬约束过滤、版本兼容校验、执行信封范围求交、技术偏好排序和解释信息生成。任何必需能力缺失都返回无候选，不以更宽权限或未声明能力降级。权重相同使用稳定键排序，保证重算可解释。

## 5. 韧性与可观测性

- AdapterCapabilityPort 超时按不可用处理，不猜测旧能力可用。
- 并发健康变化通过快照版本隔离；生成 Proposal 后由 RunRegistry 再校验。
- 记录候选数量、过滤原因、耗时和输入版本；不把业务请求正文写入标签。

## 6. 验收

- 相同版本化输入产生相同候选顺序与决策摘要。
- 无匹配能力时不创建 Run 的虚假 RouteSnapshot。
- Router 对业务优先级、团队角色和 Adapter 构造逻辑的依赖为零。
- 运行中路由只能由 RunRegistry 持有和恢复。

## 开发设计：L1-CMP-004 / CD-1（2026-09-07）

候选开发设计，不代表实现或批准。分类：**独立组件**。字段与操作唯一维护于[CD-1契约](../../../contracts/component-development-contracts-v1.md#capability-router)；早期概要中的签名待定、可选重试等简写按CD-1明确行为解释。分类依据见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

### 1. 问题与取舍

具体失效/验证轨迹：固定输入A/B/A：候选顺序及摘要三次一致。需要下面的职责划分与明确提交/恢复点；协作者可用纯函数实现，不要求每个职责一个类、进程或公共Port。

### 2. 内部职责、依赖与生命周期

CapabilityRouter：取得冻结输入；HardConstraintMatcher：纯过滤；CandidateRanker：纯排序；ProposalFactory：摘要与解释。后两者不读时钟或实时健康。

本节细化既有Port允许的调用方向。跨组件只交换不可变值、稳定引用或Port，不传共享可变Run/Session。机制依然归Infrastructure，不因合并开发任务而搬入领域层。

### 3. 数据与操作

[数据与操作明细](../../../contracts/component-development-contracts-v1.md#capability-router)给出字段、判别值和调用边界。写操作组合CD-1命令元数据，查询组合请求与可信作用域；Ref不构成访问授权。无状态对象仅为输入输出，不因此新建Repository。

### 4. 正常流程与分支

显式能力集合必须全部包含；过滤不满足模型窗口/工具/隔离/信封限制者；健康过期视不可用。排序使用配置的preferenceRank升序，再agentId ASCII升序，再agentVersion降序、adapterBindingRef升序，不引入浮点权重。零候选返回 NO_ROUTE。proposalId为规范化完整输入及候选的摘要引用，有效期30秒。受理时再次校验候选引用完整及当前安全epoch，不动态换候选。

先验证来源、Scope、大小、契约与幂等前置，再执行本节算法。明确区分纯计算结果、耐久受理回执和外部执行结果；外部操作只在必要状态提交后派发。

### 5. 并发、幂等与恢复

任一必需快照读取失败返回DEPENDENCY_UNAVAILABLE；无旧缓存回退。受理时Proposal过期返回STALE_SNAPSHOT，调用方重新提案，未受理不占Run ID。运行中Adapter失效只能停止/核对，禁止自动切换。

无法证明未执行时返回UNKNOWN，不返回absent或success。模型/工具首版自动执行重试0，查询有界重试与重新执行分开。并发验收同时核对状态版本、提交顺序和真实执行次数。

### 6. 安全

能力匹配不等于动作授权。范围求交只能缩小，缺少限制字段拒绝；L2/模型输出不能指定新的adapterBindingRef。

普通遥测不含Prompt、Memory正文、工具参数、内容摘要、Secret、Permit或物理路径。必要安全审计走独立耐久Journal；普通遥测失败不回滚事实。拒绝路径同时保证未授权读取数和新副作用数为0。

### 7. 配置、容量与运维

候选最多256、能力128、快照TTL30秒、计算P99≤10ms；超限先拒绝再排序。

以上为设计目标，不是测量结果。配置启动校验、冻结configVersion，不能热更新放宽既有Run。指标使用CD-1封闭component/phase/result/code集合；共同告警、容量总账与保留期见CD-1。

诊断顺序：核对版本 → 查询本次身份与阶段 → 查询权威回执或投影来源 → 区分拒绝/未受理/已受理/UNKNOWN → 按本节恢复。禁止直接改数据库状态或放宽权限解除挂起。

### 8. SFMEA、故障注入与验收

局部表是契约验收矩阵，不对正常用例机械计算风险分数。具体失效原因、系统影响、严重度依据、控制措施与跨组件测试见[统一SFMEA](../../../reviews/components-2026-09-07/acceptance-matrix.md)。O/D无运行证据不估数值；全部具名风险均是强制实现验收项，不依赖RPN阈值。

| 场景/需求 | 输入、故障注入与精确预期 | 局部追踪 | 测试 |
|---|---|---|---|
| L1-CMP-004-SC-01/REQ-01 | 固定输入A/B/A：候选顺序及摘要三次一致 | L1-CMP-004-FM-01 | L1-CMP-004-TC-01 |
| L1-CMP-004-SC-02/REQ-02 | 候选缺少必需能力：NO_ROUTE、受理数0 | L1-CMP-004-FM-02 | L1-CMP-004-TC-02 |
| L1-CMP-004-SC-03/REQ-03 | preferenceRank相同：按agentId稳定排序 | L1-CMP-004-FM-03 | L1-CMP-004-TC-03 |
| L1-CMP-004-SC-04/REQ-04 | proposal恰好到期：STALE_SNAPSHOT不冻结 | L1-CMP-004-FM-04 | L1-CMP-004-TC-04 |
| L1-CMP-004-SC-05/REQ-05 | 健康返回超时：不使用历史healthy值 | L1-CMP-004-FM-05 | L1-CMP-004-TC-05 |
| L1-CMP-004-SC-06/REQ-06 | 模型要求更宽Adapter：不进入候选输入 | L1-CMP-004-FM-06 | L1-CMP-004-TC-06 |

六例均做契约/集成验证；纯算法使用冻结输入，涉及崩溃的用例加真实进程终止与SQLite/Artifact恢复，不能只重建内存实例。Faux Provider记录实际生效次数，测试不使用真实密钥或付费模型。用ManualClock和双屏障精确控制取消、到期和CAS竞态，不以sleep碰撞概率。

每例保存合成输入、契约/config/代码版本、屏障释放顺序、调用轨迹、期望/实际状态与数量、错误码、资源清理和泄漏扫描。必须分别注入未生效失败、已生效丢响应；预期不能由被测实现生成。

另覆盖合法成功、每个声明状态迁移与未声明状态×操作拒绝；限额逐个测L-1/L/L+1，两Scope交错和取消清理。性能按最大合法输入运行10,000次，记录Node/OS/CPU/内存和P99；异步组件按统一SFMEA的固定Faux负载测得C后，以0.8C到达速率持续30分钟，资源不超硬界限。独立实现验收报告必须区分替身、真实本地和真实外部证据。

### 9. 开发拆分与完成定义

顺序：契约验证 → 纯规则/状态机 → Repository或机制Adapter → 幂等/恢复 → 安全强制 → 具名故障和容量验收。实现分类为内部职责的随所属组件交付，不另建服务；条件启用项只有档案满足才启用。

文档就绪要求：五角色无未关闭P0/P1、字段和操作无未定义引用、恢复无开发者自由猜测分支、SFMEA映射验收、配置有硬界限。实现就绪另需代码、测试与持久性证据和架构所有者批准。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
