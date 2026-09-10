---
doc_id: L1-CMP-006
level: component
layer: L1 Control & Orchestration Runtime
component: RunRegistry
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: AgentRun、Attempt、LoopStep、Run Event Journal 与状态提交入口
parent: L1-DES-001
interfaces: [RunCommandPort, RunQueryPort, RunExecutionPort, RuntimeEventPort, RunEventQueryPort, RunRepositoryPort, DomainEventPort]
diagrams: [STATE-RUN, SCN-PERSISTENCE-TRANSACTION]
supersedes: [run-scheduling-runtime-subsystem-design.md 中的 RunRegistry 内容]
---

# RunRegistry 组件设计

## 1. 目标与非目标

RunRegistry 为 `AgentRun` 提供唯一创建、查询、取消、执行事件提交和恢复查询入口。它保护 Run、Attempt、Step、预算、冻结路由、事件序号、等待引用、取消和终态不变量。对于绑定 Session 的 Root/Child Run，受理必须携带 SessionManager 已提交的 `SessionRunBindingRef`；RunRegistry 不绕过 SM 自行把第二个 Run 绑定到同一 Session。

它不选择下一个 Run、不拥有 Runtime、不维护 Session 内容或 Run 列表、不执行 Flow 算法，也不依据业务价值安排顺序。Session 的 `0..1` 活跃 Run 占用归 SessionManager；RunRegistry 只验证绑定回执并保存引用。

## 2. 所有状态与不变量

`AgentRun` 是本组件权威聚合根并拥有 `AgentRunAttempt` 与按序的 `AgentLoopStep`。事件在单 Run 内严格递增；终态不可逆；取消栅栏建立后禁止新增模型、工具、记忆写入和 Child Run。

恢复保持原 `runId` 并创建新 Attempt。`RouteSnapshot` 和 `ExecutionEnvelopeRef` 在 Run 内冻结，不能被最新 Registry 或策略版本静默替换。

Session 绑定不变量：`admit(StartIntent)` 若包含 `sessionId`，必须同时包含 `{sessionId,runId,bindingVersion,bindingReceiptRef}`，且 `runId` 与命令完全匹配；缺失或失配失败关闭。RunRegistry 不查询 Session 的历史 Run，不签发绑定，也不实现 `maxRunsPerSession`。Run 终态提交后发布带同一 `bindingVersion` 的 `RunTerminal` 事实，由 SessionManager 在自身事务中进入 `RELEASING` 并最终释放；RunRegistry 不同步回调或直接改 Session。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `RunCommandPort` | 幂等创建、取消和恢复 Run |
| 入站 | `RunQueryPort` | 查询权威 Run/Attempt 快照 |
| 入站 | `RunExecutionPort` | 提交 Attempt/Step 的版本化执行事实 |
| 入站 | `RuntimeEventPort` | 接收 L2 规范化事件与动作候选，先入 Journal |
| 入站 | `RunEventQueryPort` | 按 sequence 补拉持久事件 |
| 出站 | `RunRepositoryPort` | 独立事务保存 Run 聚合与幂等回执 |
| 出站 | `DomainEventPort` | 提交后通知 Scheduler 和订阅者 |

## 4. 生命周期与算法

![AgentRun 状态机](../../../diagrams/rendered/components/l1-control/04-run-state-machine.svg)

[查看 PlantUML 权威源](../../../diagrams/components/l1-control/04-run-state-machine.puml)

绑定 Session 的外部意图先由 SessionManager 占用唯一槽并经 outbox 到达本组件；RunRegistry 验证 `SessionRunBindingRef` 后建立已受理 Run。Scheduler 获得派发资格后创建 Attempt；Runtime 事件按 attempt 与 sequence 校验后持久化，并驱动 FlowEngine 计算的命令提交。等待审批/工具/外部事件时保存稳定 waitReasonRef 并进入挂起；终态提交关闭后续写入口并异步通知 SM，不直接释放 Session 槽。

### 4.1 事务边界

![Run、事件、工具与授权的事务边界](../../../diagrams/rendered/scenarios/09-persistence-transaction.svg)

[查看 PlantUML 权威源](../../../diagrams/scenarios/09-persistence-transaction.puml)

## 5. 韧性与可观测性

- 写命令保存幂等键及载荷摘要；同键异载荷冲突。
- Session 绑定回执是 Run 受理前置；同一绑定只能对应一个 runId，缺失、旧代次或摘要不一致均拒绝。
- expectedVersion 冲突不覆盖，旧 Attempt 回调按 attempt/version 拒绝。
- 多 Worker 档案才启用 Lease/Fence；启用后旧 Fence 写入必须失败。
- 事件发布失败不回滚已提交事实，由 Journal 补拉与分发恢复。
- 记录状态迁移、冲突、重复事件、等待原因、终态和未知副作用引用。

## 6. 验收

- 每个 Run 只有一个权威状态序列，Session、Scheduler 和 Runtime 不复制它。
- 重复 RuntimeEvent 不增加 Step、命令或副作用次数。
- 终态或取消栅栏之后的新动作全部被拒绝。
- Host 重启能仅凭 Repository 和 Journal 找到非终态 Run。
- 绑定 Session 的 Run 均可追溯至唯一 `SessionRunBindingRef`；SessionManager 释放后，历史 Run 仍只在 RunRegistry 查询。

## 开发设计：L1-CMP-006 / CD-1（2026-09-07）

候选开发设计，不代表实现或批准。分类：**独立组件**。字段与操作唯一维护于[CD-1契约](../../../contracts/component-development-contracts-v1.md#run-registry)；早期概要中的签名待定、可选重试等简写按CD-1明确行为解释。分类依据见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

### 1. 问题与取舍

具体失效/验证轨迹：双Coordinator读N后并发T2：只一个到N+1且只有一套Outbox。需要下面的职责划分与明确提交/恢复点；协作者可用纯函数实现，不要求每个职责一个类、进程或公共Port。

### 2. 内部职责、依赖与生命周期

RunRegistry：Run规则与事务入口；EventAdmission：来源、因果、排序；DecisionCommitter：T2校验；ClaimManager：本地执行资格；RecoveryQuery：扫描/屏障查询；IncidentResolver：受控事实核对。均属同一组件，不能另设可写RunStore服务。

本节细化既有Port允许的调用方向。跨组件只交换不可变值、稳定引用或Port，不传共享可变Run/Session。机制依然归Infrastructure，不因合并开发任务而搬入领域层。

### 3. 数据与操作

[数据与操作明细](../../../contracts/component-development-contracts-v1.md#run-registry)给出字段、判别值和调用边界。写操作组合CD-1命令元数据，查询组合请求与可信作用域；Ref不构成访问授权。无状态对象仅为输入输出，不因此新建Repository。

### 4. 正常流程与分支

受理原子冻结Run、Session版本、RouteSnapshot、预算、信封及首个wake。T1只给立即可消费事实分配下一个Run序号，提前事实进Deferred。T2严格执行FE-CON-1 21.6：回执优先、claim/版本/cancelEpoch/事件摘要/合法next、Run转录/消费/Outbox/事件一次提交。取消独立增加epoch与version，禁止新派发；Completed不改写。claim过期接管增加fence并建新Attempt，旧admitted事实记superseded且重建业务事实，不留序列缺口。

先验证来源、Scope、大小、契约与幂等前置，再执行本节算法。明确区分纯计算结果、耐久受理回执和外部执行结果；外部操作只在必要状态提交后派发。

### 5. 并发、幂等与恢复

commit超时先查原commitId，absent不是未提交证明。失效旧claim与事务屏障后仍absent才重算。每秒启动一轮扫描，按runId游标每批256条、轮内连续最多16批，5秒覆盖4096活动Run；重新建立runnable、Deadline和Pending提示。终态迟到结果只写LateFact/Incident，resolve核对不打开终态。UNKNOWN命令只查询、不重派。

无法证明未执行时返回UNKNOWN，不返回absent或success。模型/工具首版自动执行重试0，查询有界重试与重新执行分开。并发验收同时核对状态版本、提交顺序和真实执行次数。

### 6. 安全

事件source必须匹配经认证的生产者；recovery不得自签allow/approved。quarantineHead必须带当前claim、expectedVersion及拒绝证明，只移动游标并留收据，不改变FlowPosition。读取、Incident处置均验证目标scope；任意patch接口禁止。

普通遥测不含Prompt、Memory正文、工具参数、内容摘要、Secret、Permit或物理路径。必要安全审计走独立耐久Journal；普通遥测失败不回滚事实。拒绝路径同时保证未授权读取数和新副作用数为0。

### 7. 配置、容量与运维

FE首版10GiB总持久额度、1GiB保留；活动Run4096；Inbox4096保留32；Deferred128/Run、64KiB、1小时；claim30秒/续期10秒；本地commit P99≤50ms。

以上为设计目标，不是测量结果。配置启动校验、冻结configVersion，不能热更新放宽既有Run。指标使用CD-1封闭component/phase/result/code集合；共同告警、容量总账与保留期见CD-1。

诊断顺序：核对版本 → 查询本次身份与阶段 → 查询权威回执或投影来源 → 区分拒绝/未受理/已受理/UNKNOWN → 按本节恢复。禁止直接改数据库状态或放宽权限解除挂起。

### 8. SFMEA、故障注入与验收

局部表是契约验收矩阵，不对正常用例机械计算风险分数。具体失效原因、系统影响、严重度依据、控制措施与跨组件测试见[统一SFMEA](../../../reviews/components-2026-09-07/acceptance-matrix.md)。O/D无运行证据不估数值；全部具名风险均是强制实现验收项，不依赖RPN阈值。

| 场景/需求 | 输入、故障注入与精确预期 | 局部追踪 | 测试 |
|---|---|---|---|
| L1-CMP-006-SC-01/REQ-01 | 双Coordinator读N后并发T2：只一个到N+1且只有一套Outbox | L1-CMP-006-FM-01 | L1-CMP-006-TC-01 |
| L1-CMP-006-SC-02/REQ-02 | T2成功丢响应：query返回原commit，命令ID不变 | L1-CMP-006-FM-02 | L1-CMP-006-TC-02 |
| L1-CMP-006-SC-03/REQ-03 | absent后旧事务迟提交：屏障前重算/派发数0，两个释放顺序均验证 | L1-CMP-006-FM-03 | L1-CMP-006-TC-03 |
| L1-CMP-006-SC-04/REQ-04 | 接管后旧Attempt回调：隔离；可信恢复事件用新Attempt与原commandId | L1-CMP-006-FM-04 | L1-CMP-006-TC-04 |
| L1-CMP-006-SC-05/REQ-05 | 取消后迟到UNKNOWN：Run终态版本不变、Incident open | L1-CMP-006-FM-05 | L1-CMP-006-TC-05 |
| L1-CMP-006-SC-06/REQ-06 | 丢wake且无新流量：5秒内发现；同版本wake只1条 | L1-CMP-006-FM-06 | L1-CMP-006-TC-06 |

六例均做契约/集成验证；纯算法使用冻结输入，涉及崩溃的用例加真实进程终止与SQLite/Artifact恢复，不能只重建内存实例。Faux Provider记录实际生效次数，测试不使用真实密钥或付费模型。用ManualClock和双屏障精确控制取消、到期和CAS竞态，不以sleep碰撞概率。

每例保存合成输入、契约/config/代码版本、屏障释放顺序、调用轨迹、期望/实际状态与数量、错误码、资源清理和泄漏扫描。必须分别注入未生效失败、已生效丢响应；预期不能由被测实现生成。

另覆盖合法成功、每个声明状态迁移与未声明状态×操作拒绝；限额逐个测L-1/L/L+1，两Scope交错和取消清理。性能按最大合法输入运行10,000次，记录Node/OS/CPU/内存和P99；异步组件按统一SFMEA的固定Faux负载测得C后，以0.8C到达速率持续30分钟，资源不超硬界限。独立实现验收报告必须区分替身、真实本地和真实外部证据。

### 9. 开发拆分与完成定义

顺序：契约验证 → 纯规则/状态机 → Repository或机制Adapter → 幂等/恢复 → 安全强制 → 具名故障和容量验收。实现分类为内部职责的随所属组件交付，不另建服务；条件启用项只有档案满足才启用。

文档就绪要求：五角色无未关闭P0/P1、字段和操作无未定义引用、恢复无开发者自由猜测分支、SFMEA映射验收、配置有硬界限。实现就绪另需代码、测试与持久性证据和架构所有者批准。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
