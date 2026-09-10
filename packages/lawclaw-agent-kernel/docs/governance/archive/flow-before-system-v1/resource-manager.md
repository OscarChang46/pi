---
doc_id: L1-CMP-011
level: component
layer: L1 Control & Orchestration Runtime
component: ResourceManager
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 进程级执行槽、临时资源预算、背压和释放规则
parent: L1-DES-001
interfaces: [ExecutionResourcePort, ExecutionCapacityPort, ProcessPort, ClockPort]
diagrams: []
supersedes: [session-flow-engine-resource-subsystem-design.md 中的 ResourceManager 内容]
---

# ResourceManager 组件设计

## 1. 目标与非目标

ResourceManager 为已经被 Scheduler 判定可运行的 Attempt 分配有界执行槽与临时资源预算，保护 Host 不被队列、内存、进程或 Sandbox 并发耗尽。

它不拥有 Run 状态，不解释业务优先级，不选择 Agent 路由，不创建物理容器，也不把资源 Lease 当作 Runtime Lease。

## 2. 所有状态与不变量

本组件只拥有进程内临时占用表、Semaphore、等待队列和资源 Lease；这些不是领域权威状态，崩溃后由 Scheduler/Run 状态重新收敛。每个 acquire 必须有 Deadline、类别与硬上限，每个 release 幂等。

Session 不占执行槽；挂起 Run 必须释放槽。队列、槽、内存、进程和临时 Artifact 配额均有硬上限。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `ExecutionResourcePort` | 获取、释放执行槽并查询脱敏容量快照 |
| 出站 | `ExecutionCapacityPort` | 查询宿主可提供的机制容量 |
| 出站 | `ProcessPort` | 需要时申请有界进程机制，不传递领域规则 |
| 出站 | `ClockPort` | 处理 Deadline 和 Lease 过期 |

## 4. 分配算法

首版由ExecutionCapacity提供唯一有界FIFO/Semaphore，ResourceManager只负责准入和Handle映射。请求先校验硬上限和 Deadline，再排队；获得槽后返回不可伪造的临时 Lease。完成、失败、取消、超时和派发失败均进入同一幂等释放路径。业务优先级不参与排序。

## 5. 韧性与可观测性

- 队列满或预算耗尽稳定拒绝，不无限等待或创建无界协程。
- 调用方取消时移除等待项；已分配 Lease 进入幂等释放。
- 容量 Provider 不可用时停止新分配，不影响已持有 Lease 的清理。
- 记录队列深度、活跃槽、等待时长、拒绝原因、超时和疑似泄漏。

## 6. 验收

- 最大并发 Attempt 不超过配置硬上限。
- Run 挂起、取消或终态后执行槽最终归零且 release 可重复调用。
- 大量 Session 不增加执行槽或常驻协程数量。
- ResourceManager 内业务优先级和 Run 状态迁移逻辑为零。

## 开发设计：L1-CMP-011 / CD-1（2026-09-07）

候选开发设计，不代表实现或批准。分类：**独立组件**。字段与操作唯一维护于[CD-1契约](../../../contracts/component-development-contracts-v1.md#resource-manager)；早期概要中的签名待定、可选重试等简写按CD-1明确行为解释。分类依据见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

### 1. 问题与取舍

具体失效/验证轨迹：同时申请17个Attempt：最多16成功。需要下面的职责划分与明确提交/恢复点；协作者可用纯函数实现，不要求每个职责一个类、进程或公共Port。

### 2. 内部职责、依赖与生命周期

ResourceManager：计算请求类别及进程档案上限；ResourceRequestValidator：检查预算；ResourceHandleTracker：记录借出的机制Handle。唯一信号量与FIFO在ExecutionCapacity，Manager不再建第二套队列。

本节细化既有Port允许的调用方向。跨组件只交换不可变值、稳定引用或Port，不传共享可变Run/Session。机制依然归Infrastructure，不因合并开发任务而搬入领域层。

### 3. 数据与操作

[数据与操作明细](../../../contracts/component-development-contracts-v1.md#resource-manager)给出字段、判别值和调用边界。写操作组合CD-1命令元数据，查询组合请求与可信作用域；Ref不构成访问授权。无状态对象仅为输入输出，不因此新建Repository。

### 4. 正常流程与分支

先验证类别和上限，再把限额裁剪到启动配置与请求较小值；一组units/bytes作为整体向Capacity申请，失败不占部分配额。成功后登记owner。取消与分配竞争由Capacity原子解决；若已分配但调用方取消，统一release。所有完成/失败/挂起路径finally释放，重复release返回原结果。

先验证来源、Scope、大小、契约与幂等前置，再执行本节算法。明确区分纯计算结果、耐久受理回执和外部执行结果；外部操作只在必要状态提交后派发。

### 5. 并发、幂等与恢复

Host重启旧hostEpoch全部失效，槽从零重建，但Sandbox实际未回收的物理占用必须由Capacity/Process探测扣减。无法确认物理资源时停止新分配，不能以Run已取消释放仍运行Sandbox的物理额度。

无法证明未执行时返回UNKNOWN，不返回absent或success。模型/工具首版自动执行重试0，查询有界重试与重新执行分开。并发验收同时核对状态版本、提交顺序和真实执行次数。

### 6. 安全

resource Handle是内部能力对象，外部不能指定他人的owner或release；额度不是授权Permit，不得以持有槽为由执行动作。

普通遥测不含Prompt、Memory正文、工具参数、内容摘要、Secret、Permit或物理路径。必要安全审计走独立耐久Journal；普通遥测失败不回滚事实。拒绝路径同时保证未授权读取数和新副作用数为0。

### 7. 配置、容量与运维

Attempt4/16、Sandbox2/4、临时字节256MiB/1GiB；等待队列256；申请超时min(剩余Deadline,5秒)；release本地P99≤5ms。

以上为设计目标，不是测量结果。配置启动校验、冻结configVersion，不能热更新放宽既有Run。指标使用CD-1封闭component/phase/result/code集合；共同告警、容量总账与保留期见CD-1。

诊断顺序：核对版本 → 查询本次身份与阶段 → 查询权威回执或投影来源 → 区分拒绝/未受理/已受理/UNKNOWN → 按本节恢复。禁止直接改数据库状态或放宽权限解除挂起。

### 8. SFMEA、故障注入与验收

局部表是契约验收矩阵，不对正常用例机械计算风险分数。具体失效原因、系统影响、严重度依据、控制措施与跨组件测试见[统一SFMEA](../../../reviews/components-2026-09-07/acceptance-matrix.md)。O/D无运行证据不估数值；全部具名风险均是强制实现验收项，不依赖RPN阈值。

| 场景/需求 | 输入、故障注入与精确预期 | 局部追踪 | 测试 |
|---|---|---|---|
| L1-CMP-011-SC-01/REQ-01 | 同时申请17个Attempt：最多16成功 | L1-CMP-011-FM-01 | L1-CMP-011-TC-01 |
| L1-CMP-011-SC-02/REQ-02 | 取消发生于授予前/后：等待项移除或handle立即release，无泄漏 | L1-CMP-011-FM-02 | L1-CMP-011-TC-02 |
| L1-CMP-011-SC-03/REQ-03 | 同handle释放两次：占用只减1、不为负 | L1-CMP-011-FM-03 | L1-CMP-011-TC-03 |
| L1-CMP-011-SC-04/REQ-04 | 挂起审批：Attempt槽释放但在途Sandbox未确认时物理槽仍占 | L1-CMP-011-FM-04 | L1-CMP-011-TC-04 |
| L1-CMP-011-SC-05/REQ-05 | 旧hostEpoch释放新实例handle：拒绝 | L1-CMP-011-FM-05 | L1-CMP-011-TC-05 |
| L1-CMP-011-SC-06/REQ-06 | 容量Provider不可用：新分配0，既有释放仍可调用 | L1-CMP-011-FM-06 | L1-CMP-011-TC-06 |

六例均做契约/集成验证；纯算法使用冻结输入，涉及崩溃的用例加真实进程终止与SQLite/Artifact恢复，不能只重建内存实例。Faux Provider记录实际生效次数，测试不使用真实密钥或付费模型。用ManualClock和双屏障精确控制取消、到期和CAS竞态，不以sleep碰撞概率。

每例保存合成输入、契约/config/代码版本、屏障释放顺序、调用轨迹、期望/实际状态与数量、错误码、资源清理和泄漏扫描。必须分别注入未生效失败、已生效丢响应；预期不能由被测实现生成。

另覆盖合法成功、每个声明状态迁移与未声明状态×操作拒绝；限额逐个测L-1/L/L+1，两Scope交错和取消清理。性能按最大合法输入运行10,000次，记录Node/OS/CPU/内存和P99；异步组件按统一SFMEA的固定Faux负载测得C后，以0.8C到达速率持续30分钟，资源不超硬界限。独立实现验收报告必须区分替身、真实本地和真实外部证据。

### 9. 开发拆分与完成定义

顺序：契约验证 → 纯规则/状态机 → Repository或机制Adapter → 幂等/恢复 → 安全强制 → 具名故障和容量验收。实现分类为内部职责的随所属组件交付，不另建服务；条件启用项只有档案满足才启用。

文档就绪要求：五角色无未关闭P0/P1、字段和操作无未定义引用、恢复无开发者自由猜测分支、SFMEA映射验收、配置有硬界限。实现就绪另需代码、测试与持久性证据和架构所有者批准。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
