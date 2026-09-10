> 历史归档，2026-09-08从docs/runtime移出。正文保留当时讨论，不代表当前实现、有效设计或批准；后继来源与迁移原因见[归档索引](../../README.md)。

# 调度、资源与 Attempt 恢复设计草稿

历史范围：资源分配部分已被ACR-2026-0012撤销；本页保留当时评审依据与结论，不能作为新FlowEngine系统协议的开发或验收要求。

> 状态：**DRAFT，待用户评审**。日期：2026-09-06。
> 本文是非规范性提案，不改变现行组件、契约或治理文档的审批状态。
> 只提出边界、协作与验收条件，不表示这些能力已经实现，也不冻结完整 DTO、数据库 DDL 或方法签名。

## 1. 当前事实与问题

目前调用一次 `run()` 会在当前进程中直接推进到结束。若等待人工审批时仍持有执行槽，少量等待任务就可能占满 Host；若重启后只重放旧队列，则可能重复执行已经发生的动作。

本草稿建议由 RunRegistry 保留权威执行事实，Scheduler 从事实重建可运行提示，ResourceManager 只分配临时槽，RuntimePool 只派发与探测执行端。挂起前保存恢复依据，确认停止使用槽后释放，恢复时重新判定资格。

| 当前代码事实 | 尚缺能力 |
|---|---|
| [AgentSystem](../../../../../../src/control/agent-system.ts) 内存维护 Session，`run()` 注册后直接 `execute()` | 受理与异步派发分离、全 Host 有界排队 |
| [RunRegistry](../../../../../../src/control/run-registry/run-registry.ts) 只有 Map、get、register | 版本化提交、Attempt、持久事件与恢复查询 |
| [AgentRun](../../../../../../src/control/run-registry/agent-run.ts) 只有 CREATED/RUNNING/COMPLETED/FAILED/CANCELLED | 排队、挂起、恢复依据与旧 Attempt 隔离 |
| [RunFlow](../../../../../../src/control/run-flow.ts) 内存收集事件并同步协调多轮认知和工具 | Journal 确认、等待引用、可恢复推进 |
| [AgentSession](../../../../../../src/control/agent-session.ts) 限制一个活动 Run | 持久化后的相同 Session 写入约束 |

依据为 [框架映射](../../framework-boundaries.md)、[Scheduler](../../../../../design/layers/l1-control/components/run-scheduler.md)、[ResourceManager](../../../flow-before-system-v1/resource-manager.md)、[RuntimePool](../../../flow-before-system-v1/runtime-pool.md) 与 [RunRegistry](../../../../../design/layers/l1-control/components/run-registry.md)。

现有 [FlowEngine 详细设计](../../../../../design/layers/l1-control/components/flow-engine/README.md) 已定义无状态 Core、CAS 提交、动作候选和故障场景。本文只补其外部调度协作，不重写推进算法。现有 `RunFlow` 不是该无状态 Core 的完整实现。

## 2. 职责与状态所有者

| 组件 | 拥有的状态 | 不拥有的状态 |
|---|---|---|
| RunRegistry | Run、Attempt、Step、取消栅栏、预算、等待引用、事件序号及幂等回执 | 执行槽、Runtime 实例、Session 正文 |
| Scheduler | 可重建就绪索引、去重提示、退避定时器、短暂派发关联 | Run 生命周期权威状态、业务优先级 |
| ResourceManager | 本 Host 槽占用、临时资源凭据、有界等待项 | Attempt 权威状态、物理容器 |
| RuntimePool | 已装配 Runtime 清单、健康与本地命令关联 | Run 终态、技术重试裁决、业务路由 |
| Host 协调路径 | 单次推进的读取、Core 调用、命令协调流程 | 新的跨聚合权威对象或大事务 |
| 基础设施 Adapter | SQLite、进程、时钟等机制实现 | 调度、恢复或安全政策 |

运行基线建议为单 Host、一个本地 SQLite 状态适配器、进程内 Runtime 和配置化执行槽。具体 SQLite 驱动与文件布局由基础设施草稿评审；领域接口不暴露 SQL 类型。

Session 的一个活动 Root Run 限制先保留。挂起释放计算槽，不等于释放该 Session 的活动写入约束。Child 使用冻结父快照或分支，不能借父 Session 绕过串行约束。

## 3. 组件关系与正常流程

```text
控制入口 → RunRegistry 持久受理 → 提交后发出就绪提示
                              ↓
                         Scheduler 重读资格
                              ↓
                 ResourceManager 取得临时执行槽
                              ↓
                 RunRegistry 版本化创建 Attempt
                              ↓
                 RuntimePool → 认知 Runtime
                              ↓
                 规范化事件 → RunRegistry / Journal
                              ↓
                 Host 协调路径调用 FlowEngine Core
```

1. 入口先验证已显式创建的 Session、请求和待受理容量，再经 RunRegistry 保存 Run 与幂等回执；落库成功才对外表示已受理。客户端断线只停止订阅，不自动取消持久 Run。
2. 就绪提示只包含引用。提示重复、丢失或队列满不会删除已经受理的 Run，后续扫描从权威状态补回。
3. Scheduler 每次派发前检查最新版本、Session 条件、取消、绝对 Deadline、预算、等待解除条件及副作用事实。
4. ResourceManager 分配临时槽；随后 RunRegistry 以期望版本创建 Attempt。冲突则释放槽、丢弃旧判断。
5. RuntimePool 按装配能力与可用性选择 Runtime。选择不改变 Run 已冻结的模型或 Agent 路由。
6. Runtime 只消费冻结 Frame 和工具快照，规范化事件先提交 Journal，再确认接收及推进。外部 Run Journal 游标在 Run 内持续递增，与 Attempt 内模型事件序号分开；新 Attempt 不重置外部游标。
7. 工具候选仍经控制协调、安全判定、工具检查及执行边界；Scheduler 和 RuntimePool 不调用工具。
8. 完成、明确失败或安全挂起都提交权威事实；活动执行已结束或隔离清理已确认后，幂等释放对应槽。

## 4. 候选操作表

本表描述待评审能力，不新增正式签名。内部边界遵循 [BND-L1-001](../../../../../design/contracts/bnd-l1-001.md)，认知控制遵循 [BND-L12-001](../../../../../design/contracts/bnd-l12-001.md)，机制调用遵循 [BND-INF-001](../../../../../design/contracts/bnd-inf-001.md)。

| 候选操作 / 边界 | 调用方 → 实现方 | 输入语义 | 输出语义 | 主要失败与处理 |
|---|---|---|---|---|
| 通知可运行 / BND-L1-001 | 入口或事实分发 → Scheduler | Run 引用、事实位置 | 提示已接收或需扫描补偿 | 队列满不回滚已受理 Run |
| 查询派发条件 / BND-L1-001 | Scheduler → RunRegistry | Run 引用、调用作用域 | 最新版本和资格事实 | 无权限、未知 Run、存储失败均不派发 |
| 取得与释放槽 / BND-L1-001、BND-INF-001 | Scheduler → ResourceManager | 资源类别、硬上限、Deadline、取消信号 | 不透明临时凭据或容量拒绝 | 取消等待、容量不足；释放重复无副作用 |
| 创建 Attempt / BND-L1-001 | Scheduler → RunRegistry | Run 版本、派发关联、冻结执行引用 | 新 Attempt 的已提交事实 | CAS 冲突或取消栅栏导致释放临时槽 |
| 派发与探测 / BND-L12-001 | RuntimePool → Runtime | Attempt 引用、Frame、工具快照、Deadline | 明确接受、拒绝或状态未知 | 未知不等于失败，不自动重复派发 |
| 提交执行事件 / BND-L12-001 | Runtime → RunRegistry | Attempt、顺序号、载荷摘要、规范化事件 | 持久确认或重复回执 | 旧 Attempt、顺序冲突、存储失败不推进 |
| 提交等待与恢复 / BND-L1-001 | Host 协调路径 → RunRegistry | 期望版本、等待原因、可验证恢复依据 | 持久等待或获准恢复事实 | 过期授权、未知副作用禁止自动恢复 |
| 取消 / BND-L1-001、BND-L12-001 | 控制入口 → Registry → Pool | Run 引用、取消原因、幂等键 | 栅栏已建立及收敛进度 | 未确认停止保持收敛中，不伪造终态 |

同幂等键同载荷返回原回执，异载荷冲突；该原则不代替每个操作后续的接口评审。

## 5. 生命周期、并发与恢复

### 5.1 等待与槽释放

- 人工审批、Child Join、外部事件等长等待先保存稳定等待引用；恢复条件不能只存在于 Promise 闭包。
- 挂起 Run 不占执行槽。若模型或工具尚未确认停止，逻辑挂起不能让仍运行的物理任务失去容量计数。
- 模型轮次内的短暂 I/O 是否保留槽，由槽类别定义；首版把一条活动 Attempt 作为一个计算槽占用单位。
- 工具执行资源由执行域独立核算；释放认知槽不隐式终止 Sandbox，也不伪造工具完成。
- 恢复保持原 Run ID，创建新 Attempt；仍活动的同一 Attempt 内回传工具结果不叫崩溃恢复。

### 5.2 单 Host 排他与启动扫描

首版只允许一个 Host 持有同一状态库的执行所有权；第二个 Host 启动时明确失败。仅允许原进程确实退出后的整机内重启，不支持故障期间其他 Worker 抢占。

1. 检查存储可读写、协议兼容和进程级排他条件，未完成前不接受派发。
2. 分页读取非终态 Run、未关闭 Attempt 和等待引用，不一次把全部历史载入内存。
3. 先核对未确认模型/工具调用与执行域事实，未知副作用转人工核对或安全等待。
4. 对有安全 Checkpoint、未取消、未超期且授权仍有效的 Run 重新建立就绪提示。
5. 重建等待定时器及 Scope Join，不恢复旧内存 Runtime、Semaphore 或旧槽凭据。

多 Worker 接管、Lease 与 Fence 留待后续部署档案，不以单进程内锁声称已经具备跨进程隔离。旧 Attempt 的回调在首版仍必须按 Attempt 和版本拒绝。

### 5.3 崩溃窗口

| 崩溃位置 | 重启后依据 | 禁止行为 |
|---|---|---|
| Run 提交前 | 幂等查询无回执，可重新受理 | 向客户端声称先前已持久受理 |
| Run 提交后、提示前 | 扫描 Run 状态补提示 | 把通知失败认作 Run 丢失 |
| 取得槽后、Attempt 提交前 | 无已提交 Attempt，重新判定 | 恢复旧槽对象 |
| Attempt 提交后、Runtime 回执前 | 查询 Attempt 及外部执行关联 | 因回执缺失立即再执行 |
| 事件提交后、确认前 | sequence 与摘要识别重复 | 再建 Step、重复消费授权 |
| 工具启动后、结果提交前 | 工具 Journal / Provider 核对 | 自动重试未知副作用 |
| 挂起提交后、释放槽前 | 重启不复活临时占用；核对残留执行 | 把旧进程残留工具视为已清理 |

模型调用也可能重复计费。首版只有能够证明未被接受的派发失败允许有限自动重试；其余模型重试需明确策略，不把只读工具等同于无成本重放。

### 5.4 容量与可观测性

- 执行槽、就绪索引、待受理非终态 Run、单次扫描页数、重试次数和取消等待均需硬上限及启动校验。
- FIFO 为基线；Root/Child 共用资源限制，父 Join 释放槽，避免单槽 Host 上父等子而死锁。
- 绝对 Deadline 不因排队、重试或恢复延长。预算消耗保存在 Run，不因创建新 Attempt 归零。
- 非终态容量已满时在受理前拒绝；已受理但提示队列暂满时保留持久等待事实，不能无限扩大内存队列。
- 记录队列等待、活跃槽、拒绝原因、未知派发、恢复分类与释放延迟；不记录 Prompt、密钥或工具正文。

## 6. 验收场景

| 场景 | 可观察结果 |
|---|---|
| 槽上限为 1，两个不同 Session 请求 | 同时活动 Attempt 不超过 1，另一 Run 可查询且等待 |
| 父 Run 生成 Child 后等待 Join | 父释放槽，Child 可获得同一个槽并完成 |
| 重复和丢失就绪提示 | 每个 Run 只有一个当前有效 Attempt，扫描能补回遗漏 |
| 取消与取得槽并发 | 栅栏后无新模型/工具调用，已取槽最终释放 |
| 等待审批后重启 | 等待引用存在，未批准前派发为零 |
| 工具状态 UNKNOWN 后重启 | 不自动重试，保留核对入口与原因 |
| SQLite 写失败或磁盘满 | 不返回持久成功、不确认未落库事件、不继续新副作用 |
| 旧 Attempt 延迟回调 | Registry 拒绝，当前预算与 Step 不改变 |
| Runtime 不响应取消 | 占用保持可见，停止新派发或隔离清理，不超额复用 |
| 第二 Host 打开同一运行档案 | 明确拒绝执行所有权，不形成双写者 |

## 7. 待用户评审决策

以下均为建议，尚未批准。

| ID | 决策 | 建议默认 | 替代与取舍 |
|---|---|---|---|
| SCH-01 | 首版运行档案 | 单 Host、本地 SQLite、进程内 Runtime | Sidecar 增加隔离但引入通道恢复；多 Worker 需单独 Lease/Fence 设计 |
| SCH-02 | 调度基线 | 有界 FIFO，Root/Child 共用槽 | 分类公平轮转改善饥饿，但增加调度状态及验收成本 |
| SCH-03 | 同 Session 并发 | 保留一个活动 Root Run，挂起也保留写入约束 | 多 Run 并行需定义上下文冲突和分支合并，暂不引入 |
| SCH-04 | 未知派发或模型重试 | 先查询核对，无法证明未执行则停止自动重试 | 显式允许重复计费可提升可用性，但不能覆盖未知工具副作用 |
| SCH-05 | 初始容量 | 实现前按本机压测确定数值，启动时要求有效硬上限 | 任意内置大默认值易掩盖部署容量不足；此草稿不伪造性能承诺 |

## 8. 后续实施切片

1. 先评审 Run/Attempt 与 Journal 提交边界、单 Host 排他及恢复分类；使用内存替身建立契约用例。
2. 接入 SQLite RunRepository，完成受理、幂等、版本与事件原子提交；保持原同步入口可调用。
3. 接入有界 Scheduler、ResourceManager 与进程内 RuntimePool，完成取消与资源释放验证。
4. 接入持久挂起、恢复扫描和旧 Attempt 拒绝；以故障注入覆盖各崩溃窗口。
5. 接入审批与结构化 Child Join；多 Worker、Sidecar 和业务调度继续延期。
