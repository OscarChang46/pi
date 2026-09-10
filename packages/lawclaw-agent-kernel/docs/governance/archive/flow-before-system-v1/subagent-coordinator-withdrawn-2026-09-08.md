# 非规范历史：已撤回的SubagentCoordinator设计

撤回日期2026-09-08。以下是撤回前原文，仅供追踪；原相对链接按旧位置docs/design/layers/l1-control/components解析，不作为当前依赖。当前入口见[撤回说明](../../../design/layers/l1-control/components/subagent-coordinator.md)。

---
doc_id: L1-CMP-013
level: component
layer: L1 Control & Orchestration Runtime
component: SubagentCoordinator
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: AgentExecutionScope 与 Parent/Child Run 的 fork、join、cancel、移交和约束继承
parent: L1-DES-001
interfaces: [ChildRunPort, DelegationPort, PermissionDecisionPort, PermitValidationPort, RunSchedulerPort, RunQueryPort, SessionBranchPort, ExecutionScopeRepositoryPort]
diagrams: [LIFECYCLE-SUBAGENT]
supersedes: [session-flow-engine-resource-subsystem-design.md 中的 Subagent 内容]
---

# SubagentCoordinator 组件设计

## 1. 目标与非目标

SubagentCoordinator 把 L2 的委派候选转换为结构化 Child Run，并保证 Child 的权限、预算、Deadline 和资源范围不超过 Parent，且 Parent 终态后阻止Child新业务，既有Child纳入耐久清理或受控移交。

它不组建 Multi-agent 团队，不定义业务角色、参与者通信、仲裁、团队终止或业务结果采纳，也不允许 detached child。

## 2. 所有状态与不变量

`AgentExecutionScope` 是本组件权威聚合，记录 Root/Parent/Child 引用、约束快照、Join 状态、取消传播和受控移交。Child Run 自身状态仍由 RunRegistry 拥有，Scope 只保存引用和结构化并发不变量。

Child 的权限、预算、Deadline、工具范围、MemoryView 和资源上限必须是 Parent 的子集；深度、分支数和总 Child 数有硬上限。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `ChildRunPort` | 提交 Child、等待 Join、取消或查询 Scope |
| 入站 | `DelegationPort` | 接收已经规范化的 L2 委派候选 |
| 出站 | `PermissionDecisionPort`、`PermitValidationPort` | 校验委派动作与约束子集 |
| 出站 | `RunSchedulerPort` | 仅提示统一调度；Child创建经RunRegistry的admitChild |
| 出站 | `RunQueryPort` | 读取 Child 权威终态 |
| 出站 | `SessionBranchPort` | 仅在上下文隔离需要时创建 Child Session |
| 出站 | `ExecutionScopeRepositoryPort` | 持久化 Scope 与 Join 状态 |

## 4. 生命周期与算法

![Subagent 生命周期与上层 Multi-agent 边界](../../../diagrams/rendered/components/l1-control/11-subagent-lifecycle.svg)

[查看 PlantUML 权威源](../../../diagrams/components/l1-control/11-subagent-lifecycle.puml)

收到委派候选后先验证父 Run 可继续、深度/数量上限和约束子集，再持久化Scope关系、由RunRegistry受理Child并通知统一Scheduler。默认复用 Parent Session 的只读 ContextSnapshot，结果以 Artifact/ContextDelta 引用回传；只有独立演进时创建 Session 分支。Parent 完成或取消前执行 Join/Cancel 栅栏。

## 5. 韧性与可观测性

- Child 创建采用幂等委派键，提交中断后先查询 Scope/Run 状态。
- Parent 取消级联传播；无法确认Child终态时Scope清理保持收敛/incident；Parent逻辑终态不回退，不虚假宣称物理清理完成。
- 重启从 Scope Repository 与 RunRegistry 重建未完成 Join。
- 记录 fork/join/cancel 延迟、深度、活跃 Child、约束拒绝和孤儿检测；不记录上下文正文。

## 6. 验收

- Scope清理完成后活动Child数量为零；Parent逻辑终态后不得授权新业务，既有在途Child保留清理事实。
- Child 的每项权限、预算、Deadline 和资源约束均不宽于 Parent。
- Root 与 Child 经过同一RunScheduler和系统执行资格协议。
- Kernel 内 Team、Participant、RoleAssignment、CoordinationPolicy 和仲裁逻辑数量为零。

## 开发设计：L1-CMP-013 / CD-1（2026-09-07）

候选开发设计，不代表实现或批准。分类：**独立组件**。字段与操作唯一维护于[CD-1契约](../../../contracts/component-development-contracts-v1.md#subagent-coordinator)；早期概要中的签名待定、可选重试等简写按CD-1明确行为解释。分类依据见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

### 1. 问题与取舍

具体失效/验证轨迹：同CreateChild命令两次：Child1、Scope链接1。需要下面的职责划分与明确提交/恢复点；协作者可用纯函数实现，不要求每个职责一个类、进程或公共Port。

### 2. 内部职责、依赖与生命周期

SubagentCoordinator：结构化并发入口；ConstraintIntersection：子集检验；ScopeLedger：预算预留及父子关系；ChildAdmissionSaga：跨聚合步骤恢复；JoinReducer：消费唯一Child终态。

本节细化既有Port允许的调用方向。跨组件只交换不可变值、稳定引用或Port，不传共享可变Run/Session。机制依然归Infrastructure，不因合并开发任务而搬入领域层。

### 3. 数据与操作

[数据与操作明细](../../../contracts/component-development-contracts-v1.md#subagent-coordinator)给出字段、判别值和调用边界。写操作组合CD-1命令元数据，查询组合请求与可信作用域；Ref不构成访问授权。无状态对象仅为输入输出，不因此新建Repository。

### 4. 正常流程与分支

只接受已提交CreateChildRun；验证Parent当前claim、取消、Deadline、授权子集。Scope事务按root预算原子预留完整Child预算并写reserved链接；childId使用FE稳定公式，不能自行另造。可选创建隔离Session分支后记session_ready；RunRegistry按childId幂等受理并记admitted，再提示Scheduler。步骤跨聚合采用可查询Saga，禁止Scheduler成为Run创建所有者。Parent AwaitingChild释放槽；join读取Child权威终态并一次性记录结果通知。

先验证来源、Scope、大小、契约与幂等前置，再执行本节算法。明确区分纯计算结果、耐久受理回执和外部执行结果；外部操作只在必要状态提交后派发。

### 5. 并发、幂等与恢复

Scope reserved后崩溃按childId查Session/Run补未完成步骤；Child受理结果未知不释放预算，不创建第二Child。Parent取消阻止尚未受理的Child，已受理者级联取消；30秒未确认记incident并移交受控恢复器，不宣称所有物理动作已停止。Root预算预留首版不退还，避免重复循环扩大额度。

无法证明未执行时返回UNKNOWN，不返回absent或success。模型/工具首版自动执行重试0，查询有界重试与重新执行分开。并发验收同时核对状态版本、提交顺序和真实执行次数。

### 6. 安全

Child的工具/Memory/资源/Deadline分别取父子交集，禁止只比较一个总scope ID。委派使用独立PDP决策及一次性Permit；在Child受理线性化点复核父取消/claim，Parent终态后只能清理已存在Child。没有detached执行能力。

普通遥测不含Prompt、Memory正文、工具参数、内容摘要、Secret、Permit或物理路径。必要安全审计走独立耐久Journal；普通遥测失败不回滚事实。拒绝路径同时保证未授权读取数和新副作用数为0。

### 7. 配置、容量与运维

FE每Run Child2/8、深度1/2；根Scope累计Child≤8、执行同全局4槽；join查询1秒周期有界、清理30秒。

以上为设计目标，不是测量结果。配置启动校验、冻结configVersion，不能热更新放宽既有Run。指标使用CD-1封闭component/phase/result/code集合；共同告警、容量总账与保留期见CD-1。

诊断顺序：核对版本 → 查询本次身份与阶段 → 查询权威回执或投影来源 → 区分拒绝/未受理/已受理/UNKNOWN → 按本节恢复。禁止直接改数据库状态或放宽权限解除挂起。

### 8. SFMEA、故障注入与验收

局部表是契约验收矩阵，不对正常用例机械计算风险分数。具体失效原因、系统影响、严重度依据、控制措施与跨组件测试见[统一SFMEA](../../../reviews/components-2026-09-07/acceptance-matrix.md)。O/D无运行证据不估数值；全部具名风险均是强制实现验收项，不依赖RPN阈值。

| 场景/需求 | 输入、故障注入与精确预期 | 局部追踪 | 测试 |
|---|---|---|---|
| L1-CMP-013-SC-01/REQ-01 | 同CreateChild命令两次：Child1、Scope链接1 | L1-CMP-013-FM-01 | L1-CMP-013-TC-01 |
| L1-CMP-013-SC-02/REQ-02 | reserved后崩溃且Child已受理丢响应：恢复原childId不重复扣预算 | L1-CMP-013-FM-02 | L1-CMP-013-TC-02 |
| L1-CMP-013-SC-03/REQ-03 | 两个Child并发要求剩余全额：仅一个预留成功 | L1-CMP-013-FM-03 | L1-CMP-013-TC-03 |
| L1-CMP-013-SC-04/REQ-04 | 1槽Parent等待Child：Child可启动无死锁 | L1-CMP-013-FM-04 | L1-CMP-013-TC-04 |
| L1-CMP-013-SC-05/REQ-05 | Parent取消与Child受理双屏障：取消先线性化则Child受理0 | L1-CMP-013-FM-05 | L1-CMP-013-TC-05 |
| L1-CMP-013-SC-06/REQ-06 | Child不响应取消30秒：保存incident，禁止新动作、不宣称物理结束 | L1-CMP-013-FM-06 | L1-CMP-013-TC-06 |

六例均做契约/集成验证；纯算法使用冻结输入，涉及崩溃的用例加真实进程终止与SQLite/Artifact恢复，不能只重建内存实例。Faux Provider记录实际生效次数，测试不使用真实密钥或付费模型。用ManualClock和双屏障精确控制取消、到期和CAS竞态，不以sleep碰撞概率。

每例保存合成输入、契约/config/代码版本、屏障释放顺序、调用轨迹、期望/实际状态与数量、错误码、资源清理和泄漏扫描。必须分别注入未生效失败、已生效丢响应；预期不能由被测实现生成。

另覆盖合法成功、每个声明状态迁移与未声明状态×操作拒绝；限额逐个测L-1/L/L+1，两Scope交错和取消清理。性能按最大合法输入运行10,000次，记录Node/OS/CPU/内存和P99；异步组件按统一SFMEA的固定Faux负载测得C后，以0.8C到达速率持续30分钟，资源不超硬界限。独立实现验收报告必须区分替身、真实本地和真实外部证据。

### 9. 开发拆分与完成定义

顺序：契约验证 → 纯规则/状态机 → Repository或机制Adapter → 幂等/恢复 → 安全强制 → 具名故障和容量验收。实现分类为内部职责的随所属组件交付，不另建服务；条件启用项只有档案满足才启用。

文档就绪要求：五角色无未关闭P0/P1、字段和操作无未定义引用、恢复无开发者自由猜测分支、SFMEA映射验收、配置有硬界限。实现就绪另需代码、测试与持久性证据和架构所有者批准。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
