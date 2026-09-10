---
doc_id: L1-CMP-007
level: component
layer: L1 Control & Orchestration Runtime
component: RunScheduler
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Run 可运行判定、队列、派发、Deadline 与有限技术重试
parent: L1-DES-001
interfaces: [RunSchedulerPort, RunQueryPort, RunExecutionPort, RuntimeControlPort, ClockPort]
diagrams: []
supersedes: [run-scheduling-runtime-subsystem-design.md 与 session-flow-engine-resource-subsystem-design.md 中的 Scheduler 内容]
---

# RunScheduler 组件设计

## 1. 目标与非目标

Scheduler为Root Run和Child Run提供外部触发、扫描和队列投影，在宿主执行条件满足时调用框架。Flow之间的依赖、后继选择、循环退出和等待恢复由[Flow框架SR-04](flow-engine/deferred-scheduling-index.md)负责，Scheduler不复制这些规则。它不采纳业务结果、不持有Session内容，也不把队列当作Run权威状态。

2026-09-07职责收敛：下文队列/触发协议仍为外部适配候选；SR-04跨Flow调度尚未实现。当前源码FlowScheduler读取ReAct状态，其行为只能视为现有业务宿主实现，不能据此认为通用框架调度已经接通。

## 2. 状态与不变量

队列、定时器、重试计数投影和派发中的临时票据均可由 RunRegistry 重建。单机首版防止同一 Run 本地重复派发；多 Worker 档案要求唯一 Lease 与 Fence。

Deadline 是端到端绝对时间，只能缩短。技术重试受次数、时间和副作用事实约束；`UNKNOWN` 副作用、无安全 Checkpoint 或失效权限禁止自动重派。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `RunSchedulerPort` | 通知新 Run、恢复、取消与容量变化 |
| 出站 | `RunQueryPort` | 读取可运行条件与最新权威版本 |
| 出站 | `RunExecutionPort` | 申请 Attempt、提交派发或等待事实 |
| 出站 | `RuntimeControlPort` | 调用已装配的业务宿主执行或取消任务 |
| 出站 | `ClockPort` | 判定 Deadline、退避和租约时间 |

## 4. 调度算法

外部触发采用有界FIFO候选基线；业务优先级不得渗入。派发前重读框架的可推进投影及宿主取消/Deadline约束，将标识交给框架。依赖、后继和未知副作用的最终判定由框架在权威日志版本上执行，外部队列不重复实现。执行资格由日志CAS保护，Scheduler不分配资源。

## 5. 韧性与可观测性

- 启动扫描所有非终态 Run，重建队列而非恢复旧内存对象。
- 队列满稳定拒绝或保留已持久化等待事实，不创建无界协程。
- Runtime 接受结果未知时先查询 Attempt/Run，不直接重复执行。
- 记录队列深度、等待时间、派发延迟、重试原因、Deadline 超时和重复派发拦截。

## 6. 验收

- Root/Child Run 经过同一调度入口与执行资格协议。
- 进程重启后队列可以完整重建，且不重复已确认 Attempt。
- Deadline 到期、取消或未知副作用时派发次数为零。
- Scheduler 内业务步骤顺序、结果采纳和 Agent 团队优先级规则为零。

## 开发设计：L1-CMP-007 / CD-1（2026-09-07）

候选开发设计，不代表实现或批准。分类：**独立组件**。字段与操作唯一维护于[CD-1契约](../../../contracts/component-development-contracts-v1.md#run-scheduler)；早期概要中的签名待定、可选重试等简写按CD-1明确行为解释。分类依据见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

### 1. 问题与取舍

具体失效/验证轨迹：同runId提示100次：队列占1项。需要下面的职责划分与明确提交/恢复点；协作者可用纯函数实现，不要求每个职责一个类、进程或公共Port。

### 2. 内部职责、依赖与生命周期

RunScheduler：有界FIFO触发；RunnableScanner：周期补提示；AttemptDispatcher：调用框架入口；DeadlineScanner：到期唤醒。不含FlowPosition规则；通用FlowCoordinator归Flow框架，业务事件解释留在外部Host。

本节细化既有Port允许的调用方向。跨组件只交换不可变值、稳定引用或Port，不传共享可变Run/Session。机制依然归Infrastructure，不因合并开发任务而搬入领域层。

### 3. 数据与操作

[数据与操作明细](../../../contracts/component-development-contracts-v1.md#run-scheduler)给出字段、判别值和调用边界。写操作组合CD-1命令元数据，查询组合请求与可信作用域；Ref不构成访问授权。无状态对象仅为输入输出，不因此新建Repository。

### 4. 正常流程与分支

启动先扫描再开放派发；同runId提示合并到最大basisVersion，满队列不擦除runnable事实。FIFO取项重读取消、截止、等待原因、预算；只对可推进Run调用业务宿主。宿主通过系统FlowEngine取得Running代次，Activity唯一Started提交后调用L2。等待由Yield及业务检查点表示，不自旋；收到已提交结果重新入队。

先验证来源、Scope、大小、契约与幂等前置，再执行本节算法。明确区分纯计算结果、耐久受理回执和外部执行结果；外部操作只在必要状态提交后派发。

### 5. 并发、幂等与恢复

claim续期失败立刻停止新提交/派发。接管只由RunRegistry原子操作授予，不凭队列项重复创建Attempt。状态读取最多3次100/200/400ms；模型/工具执行重试0。Root与Child同一队列；Parent等待Child使用持久检查点，不在框架里建立执行槽依赖。

无法证明未执行时返回UNKNOWN，不返回absent或success。模型/工具首版自动执行重试0，查询有界重试与重新执行分开。并发验收同时核对状态版本、提交顺序和真实执行次数。

### 6. 安全

提示不是执行授权；notify不接受priority或业务角色。每次真正派发由目标端复核claim/取消/Deadline，不把本地队列排他当作安全边界。

普通遥测不含Prompt、Memory正文、工具参数、内容摘要、Secret、Permit或物理路径。必要安全审计走独立耐久Journal；普通遥测失败不回滚事实。拒绝路径同时保证未授权读取数和新副作用数为0。

### 7. 配置、容量与运维

宿主的并发档案由部署配置约束，不作为本组件的资源分配算法；FIFO256硬上限4096；每秒触发一轮、每批256条且轮内连续最多16批；5秒活动4096覆盖；排队等待P99目标≤1秒仅在到达速率≤服务能力80%的基准下成立。

以上为设计目标，不是测量结果。配置启动校验、冻结configVersion，不能热更新放宽既有Run。指标使用CD-1封闭component/phase/result/code集合；共同告警、容量总账与保留期见CD-1。

诊断顺序：核对版本 → 查询本次身份与阶段 → 查询权威回执或投影来源 → 区分拒绝/未受理/已受理/UNKNOWN → 按本节恢复。禁止直接改数据库状态或放宽权限解除挂起。

### 8. SFMEA、故障注入与验收

局部表是契约验收矩阵，不对正常用例机械计算风险分数。具体失效原因、系统影响、严重度依据、控制措施与跨组件测试见[统一SFMEA](../../../reviews/components-2026-09-07/acceptance-matrix.md)。O/D无运行证据不估数值；全部具名风险均是强制实现验收项，不依赖RPN阈值。

| 场景/需求 | 输入、故障注入与精确预期 | 局部追踪 | 测试 |
|---|---|---|---|
| L1-CMP-007-SC-01/REQ-01 | 同runId提示100次：队列占1项 | L1-CMP-007-FM-01 | L1-CMP-007-TC-01 |
| L1-CMP-007-SC-02/REQ-02 | 队列满再丢通知：durable runnable保留，扫描补回 | L1-CMP-007-FM-02 | L1-CMP-007-TC-02 |
| L1-CMP-007-SC-03/REQ-03 | Parent等待Child：Child独立运行且结果可回收 | L1-CMP-007-FM-03 | L1-CMP-007-TC-03 |
| L1-CMP-007-SC-04/REQ-04 | claim过期旧worker返回：提交和新派发均拒绝 | L1-CMP-007-FM-04 | L1-CMP-007-TC-04 |
| L1-CMP-007-SC-05/REQ-05 | 审批无回调但Deadline到期：扫描生成终止唤醒 | L1-CMP-007-FM-05 | L1-CMP-007-TC-05 |
| L1-CMP-007-SC-06/REQ-06 | UNKNOWN模型命令接管：新HTTP请求数0 | L1-CMP-007-FM-06 | L1-CMP-007-TC-06 |

六例均做契约/集成验证；纯算法使用冻结输入，涉及崩溃的用例加真实进程终止与SQLite/Artifact恢复，不能只重建内存实例。Faux Provider记录实际生效次数，测试不使用真实密钥或付费模型。用ManualClock和双屏障精确控制取消、到期和CAS竞态，不以sleep碰撞概率。

每例保存合成输入、契约/config/代码版本、屏障释放顺序、调用轨迹、期望/实际状态与数量、错误码、资源清理和泄漏扫描。必须分别注入未生效失败、已生效丢响应；预期不能由被测实现生成。

另覆盖合法成功、每个声明状态迁移与未声明状态×操作拒绝；限额逐个测L-1/L/L+1，两Scope交错和取消清理。性能按最大合法输入运行10,000次，记录Node/OS/CPU/内存和P99；异步组件按统一SFMEA的固定Faux负载测得C后，以0.8C到达速率持续30分钟，资源不超硬界限。独立实现验收报告必须区分替身、真实本地和真实外部证据。

### 9. 开发拆分与完成定义

顺序：契约验证 → 纯规则/状态机 → Repository或机制Adapter → 幂等/恢复 → 安全强制 → 具名故障和容量验收。实现分类为内部职责的随所属组件交付，不另建服务；条件启用项只有档案满足才启用。

文档就绪要求：五角色无未关闭P0/P1、字段和操作无未定义引用、恢复无开发者自由猜测分支、SFMEA映射验收、配置有硬界限。实现就绪另需代码、测试与持久性证据和架构所有者批准。
