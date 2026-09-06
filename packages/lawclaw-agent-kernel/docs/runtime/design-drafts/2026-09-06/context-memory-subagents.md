# Session 上下文、长期记忆与结构化 Child Run 设计草稿

> 状态：**DRAFT，待用户评审**。日期：2026-09-06。
> 本文是非规范性提案，不改变现行设计或契约的审批状态；不实现模块、不冻结完整 DTO、方法签名或存储结构。

## 1. 当前事实与缺口

现在同一个 Session 连续运行两次，并不意味着第二次自动取得第一次的持久历史。委派返回一个子调用摘要，也不意味着内核已经拥有可恢复的 Child Run 树。

建议分别建立 Session 的版本化历史、Memory 的授权视图和 Scope 的父子关系。ContextFrame 由这些事实投影产生；不把三类状态塞进 Runtime 或一份可变上下文对象。

| 当前事实 | 缺口 |
|---|---|
| [AgentSession](../../../../src/control/agent-session.ts) 只保存 ID、Run 引用和串行活动关联 | 持久上下文增量、Snapshot、分支与归档 |
| [ContextEngine](../../../../src/control/context-engine.ts) 选择上下文并追加完整 Turn，超预算显式失败 | Session/Memory 读取端口、来源版本和授权视图；没有有损摘要实现 |
| [RunFlow](../../../../src/control/run-flow.ts) 从命令输入组装 Frame，事件及最后 Frame 返回给调用方 | 跨 Run 持久历史、输出提交确认及恢复关联 |
| [DelegationEngine](../../../../src/control/delegation-engine.ts) 限深度、数量、任务和结果大小，向 Provider 传播取消 | Scope 聚合、持久 Child ID、统一调度、可恢复 Join；当前随机 delegationId 不能代表稳定重试键 |
| [控制契约](../../../../src/contracts/control.ts) 只有当前上下文和委派最小端口 | 完整 Session、Memory、Child Run 操作族尚未落地 |

依据：[SessionManager](../../../design/layers/l1-control/components/session-manager.md)、[ContextEngine](../../../design/layers/l1-control/components/context-engine.md)、[MemoryManager](../../../design/layers/l1-control/components/memory-manager.md)、[SubagentCoordinator](../../../design/layers/l1-control/components/subagent-coordinator.md) 及 [当前框架映射](../../framework-boundaries.md)。

## 2. 职责与状态所有者

| 所有者 | 权威事实或投影 | 禁止承担 |
|---|---|---|
| SessionManager | Session 版本、筛选后的消息与观察增量、Artifact 引用、父快照、归档状态 | Run 生命周期、进程、长期共享记忆 |
| ContextEngine | 可重建的 Frame 和裁剪轨迹 | 改写 Session、写 Memory、共享可变模型历史 |
| MemoryManager | MemorySpace、Entry 版本、来源、敏感级别、Candidate 审核结果 | 业务身份解释、直接采纳模型主张为事实 |
| SubagentCoordinator | ExecutionScope 关系、约束快照、Join 与取消收敛事实 | Child Run 自身状态、团队角色、业务仲裁 |
| RunRegistry | Parent/Child 各自的 Run、Attempt、预算消耗及执行事件 | Session 正文和共享 MemoryEntry |
| Scheduler / ResourceManager | 可运行提示和临时执行槽 | Scope 关系及 Memory 授权 |

首版持久机制建议与 [调度草稿](control-scheduling.md) 共用单 Host SQLite 运行档案，但仍由各聚合独立提交。共享一个数据库文件不意味着可以跨 Run、Session、Scope、Memory 开启无边界大事务。

技术隔离标识沿用已编译输入；不在新模块内解析组织角色、租户政策或业务 Conversation。

## 3. 组件关系与主要流程

### 3.1 Session 与模型输入

```text
RunRegistry 中已确认的可发布事实
  → SessionManager 幂等追加增量 → 带版本 SessionSnapshot
                                      ↓
任务与约束 + 已授权 MemoryView + Artifact 引用
                                      ↓
                            ContextEngine 冻结 Frame
                                      ↓
                            认知 Runtime 产生候选
```

1. Host 显式创建 Session 后才受理 Run；Run 起始时明确绑定 Session 版本，模型读取的是不可变 Snapshot，不是 live Session 对象。这是持久 Host 候选接口行为，不冒充当前 `AgentSystem.session()` 的隐式创建已经变更。
2. Session 只接收规范化用户输入、可发布输出、工具观察及必要来源引用；原始私有推理不持久化。
3. 以完整 assistant/tool 因果单元追加，避免恢复后出现无请求的工具结果或有请求无结果的伪完整历史。
4. Run 事件与其待发布 Delta 引用在 Run 自身事务保存；提交后由协调路径驱动 Session 幂等追加。
5. Session 追加以源 Run/事件稳定标识去重、以期望 Session 版本防覆盖；提交后再向 Run 记录已应用关联。
6. 任意中断从尚未确认的关联继续核对，不用跨聚合大事务消除所有窗口；后续 Run 不读未完成的上下文提交。
7. Frame 同时保留来源版本与裁剪理由。现有估算和完整 Turn 边界继续复用，本阶段不添加摘要模型。

### 3.2 Memory 读取与候选写入

1. ContextEngine 请求最小目标空间、版本、范围和预算，由 MemoryManager 先验证授权再检索。
2. 返回冻结 MemoryView；来源版本与授权范围可核对，正文不包含底层表名或物理路径。
3. Runtime 的记忆建议经控制路径提交为 MemoryCandidate；候选已受理不等于已进入共享空间。
4. 默认由明确评审动作接受候选，接受前再次授权、校验目标版本和一次性提交资格。
5. 接受时 append 新 Entry 或创建 supersedes 关系；不原地覆盖旧 Entry，保留来源与修订关系。
6. 首版建议使用确定性的引用/标签/文本筛选，不引入向量数据库或自动总结算法。

### 3.3 结构化 Child Run

```text
认知委派候选 → 控制入口 → SubagentCoordinator
  → 安全判定与父约束子集校验
  → 持久 Scope 创建意图与稳定 Child 标识
  → RunRegistry 幂等创建 Child → 统一 Scheduler
  → Parent 持久等待 Join 并释放执行槽
  → 查询 Child 权威终态 → 有界结果引用 → Parent 恢复
```

1. 先确认父 Run 未终态、未取消、未超期；深度、分支数、累计 Child 数与总预算有硬上限。
2. 为每个委派候选生成一次稳定幂等键与 Child ID，并持久化 Scope 中的创建意图。
3. 经 RunRegistry 幂等创建 Child，再确认 Scope 关联；崩溃后按同一 ID 查询补全，未关联完成前不可派发。
4. Child 默认只读取父冻结 Snapshot，并在自己 Run 内积累观察；需要独立持久演进时创建 Session 分支。
5. 权限、工具范围、MemoryView、Deadline 和预算不得宽于父；并行 Child 的预算预留之和不能超过父剩余预算。
6. Parent Join 持久挂起并释放槽，Child 与 Root 经同一个 Scheduler，不通过同步嵌套 Provider 绕过容量控制。
7. Child 输出只是候选观察，按稳定 Child/结果引用幂等交给父；最终业务采纳仍由调用应用决定。
8. Parent 终态前所有 Child 已 Join 或确认取消。首版不支持 detached Child 或跨 Scope 移交。

## 4. 候选操作表

操作语义沿用 [BND-L1-001](../../../design/contracts/bnd-l1-001.md)、[BND-MEM-001](../../../design/contracts/bnd-mem-001.md)、[BND-SEC-001](../../../design/contracts/bnd-sec-001.md)；正文进入认知运行时仍受 [BND-L12-001](../../../design/contracts/bnd-l12-001.md) 约束。以下不复制正式签名。

| 操作 / 边界 | 调用方 → 实现方 | 输入语义 | 输出语义 | 失败及处理 |
|---|---|---|---|---|
| 读取 Session / BND-L1-001 | Context 协调 → SessionManager | 授权作用域、Session 和确定版本 | 不可变 Snapshot、来源引用 | 未授权、版本缺失、存储不可用则不伪造空历史 |
| 追加 Delta / BND-L1-001 | Run 协调 → SessionManager | 期望版本、源事件、增量摘要及内容引用 | 新版本或原幂等回执 | CAS 冲突重载重算，同键异载荷拒绝 |
| 分支与归档 / BND-L1-001 | 控制入口或 SubagentCoordinator → SessionManager | 父版本或目标 Session、约束、幂等键 | 分支引用或已归档事实 | 父版本不可用、活动写入冲突，拒绝静默覆盖 |
| 组装 Frame / BND-L1-001 | 控制协调 → ContextEngine | 确定 Snapshot、已授权视图、必选项、预算 | 冻结 Frame 和裁剪轨迹 | 必选项超限失败，不破坏因果链 |
| 查询 Memory / BND-MEM-001 | ContextEngine → MemoryManager | 最小范围、授权版本、目标空间版本、预算 | 冻结 MemoryView | 失效授权失败关闭；不可用不返回过期缓存 |
| 提交与查询 Candidate / BND-MEM-001 | 控制入口 → MemoryManager | 来源、敏感等级、目标范围、稳定候选键 | 待审或原结果 | 无来源、越权、同键异载荷拒绝 |
| 接受候选 / BND-MEM-001、BND-SEC-001 | 授权评审入口 → MemoryManager | 候选引用、当前版本、有效提交授权 | 新 Entry 引用或拒绝事实 | 授权消费或版本冲突不得产生部分写入 |
| fork / BND-L1-001、BND-SEC-001 | 控制协调 → SubagentCoordinator | 父引用、委派候选、约束子集、幂等键 | 已登记的 Child 引用 | 超限、取消、授权失败不派发 |
| join / BND-L1-001 | 控制协调 → SubagentCoordinator | Scope、目标 Child 集合、Deadline | 等待引用或有界终态结果引用 | 未确认 Child 不能当作成功；超期触发取消收敛 |
| cancel Scope / BND-L1-001 | 父取消协调 → SubagentCoordinator | Scope 引用、原因、稳定取消键 | 已建立栅栏和收敛进度 | 未确认停止继续可查询，不假报完成 |

## 5. 生命周期、并发、恢复与安全容量

### 5.1 Session 与 Context

- 先保留同 Session 单活动 Root Run，避免在此次边界草稿中引入业务冲突合并。
- Session 可卸载；大量闲置 Session 不创建协程或占用执行槽。
- 子分支固定父版本加增量；父之后的追加不会悄悄改变已冻结子上下文。
- 归档默认要求无活动写入，再禁止普通追加；不删除 Run 或 Artifact 审计引用。
- 大结果存 Artifact，Session 保存不透明引用；正文访问始终重新校验调用作用域。
- Artifact 已写、Session 未提交时不能声明引用已发布；按存储清理策略回收孤立内容。
- Frame 冻结前复核 Memory 授权版本；撤销后停止新模型调用并重新组装，已经发给模型的内容不能声称可撤回。
- 必选项、系统约束、当前任务和未闭合工具链不进入普通有损裁剪；超预算显式失败。

### 5.2 Memory

- Candidate、接受状态、Entry 与版本变化由 Memory 聚合独立提交；重复接受最多产生一个 Entry。
- 接受点必须与安全域协调一次性消费和提交回执，不能先消费授权后因 DB 故障永久丢失结果而无法核对。
- Permit 尚未实现时，共享记忆提交能力保持关闭；当前 Grant 不足以宣称原子消费语义。
- 私有空间也有来源、大小、条目数和读预算限制；共享空间、跨 Agent 与跨 Scope 查询必须单独授权。
- 授权缓存以范围、版本及有效期隔离，不能因为同一团队或父子关系就复用全部记忆。
- Memory 不可用时默认按能力是否必需决定失败：明确声明可选的记忆可返回显式缺席，禁止静默返回陈旧正文。
- 日志仅记录引用、数量、冲突和审核原因码；不记录 Memory 正文、完整提示词或 Secret。

### 5.3 Child Run

- 深度首版保留为 1；固定每父累计 Child 上限，不通过淘汰活跃父计数重置限制。
- Root、Child 总计遵守 Host 的有界排队和执行槽；等待 Join 的父不持有 Child 所需的唯一槽。
- 每个 Child 预留预算并记录消耗；结束后只归还可核对的未消耗部分，未知成本先保守保留。
- 首版无并行团队角色、子 Agent 互发消息、结果仲裁或业务 Workflow；这些留在上层应用。
- 取消先在父建立新动作栅栏，再传播至 Scope 与 Child；迟到结果可记录事实但不能恢复父继续行动。
- 重启先读 Scope 意图和 Child Run 权威状态，补全创建关联、Join 与取消；不信任旧 Promise 状态。
- Child 无法确认停止时父保持收敛中，输出诊断原因；不为满足超时而生成无依据终态。
- 已产生外部副作用的 Child 遵循执行域核对，父取消不代表自动撤销或业务补偿。

## 6. 验收场景

| 场景 | 预期结果 |
|---|---|
| 同 Session 第二次 Run | 读取第一轮已确认版本，重启后结果相同 |
| 同版本并发 Delta | 一个提交成功，另一个重载；无最后写覆盖 |
| Session 提交成功、Run 关联确认前崩溃 | 同源增量重放只保留一次，关联可补全 |
| Child 读取父快照后父追加 | Child 输入版本不变，无共享可变对象 |
| 必选上下文超限 | 不调用模型，给出明确容量失败 |
| MemoryView 冻结前授权撤销 | 不把失效正文传给认知 Runtime |
| Candidate 重复提交或重复接受 | 原回执可查询，最多新增一个 Entry |
| Scope 已记创建意图、Child 尚未登记时崩溃 | 同 Child ID 补全，不重复派发 |
| 两个 Child 分别请求父全部剩余预算 | 合计超额被拒绝或缩小，不重复分配预算 |
| 单槽 Host 父等子 | 父挂起释放槽，Child 完成后父恢复 |
| 父取消与 Child 输出并发 | 不新增动作，取消与结果都有可追踪事实 |
| 未确认 Child 终态 | 父不假报完成，重启仍可继续收敛 |

## 7. 待用户评审决策

以下为建议默认，全部待评审。

| ID | 决策 | 建议默认 | 替代与取舍 |
|---|---|---|---|
| CTX-01 | 历史保存粒度 | 规范化完整 Turn 与必要观察，排除原始私有推理 | 更少历史降低存储，但会削弱恢复与后续任务上下文 |
| CTX-02 | Session 并发 | 单活动 Root Run；需要独立演进时分支 | 同 Session 多写入提高并发，但需额外冲突与合并语义 |
| MEM-01 | 初始检索能力 | 确定性引用、标签和有界文本筛选 | 向量检索提高相关性上限，但增加索引和评估体系 |
| MEM-02 | 候选采纳 | 显式授权评审后提交，首版关闭自动共享写入 | 自动策略接受适合受限场景，但须另评安全与误记忆风险 |
| SUB-01 | Child 上下文 | 默认冻结父 Snapshot，仅显式需要时分支 | 每个 Child 都建 Session 易审计，但会增加持久对象与清理成本 |
| SUB-02 | Join 失败语义 | 收齐目标 Child 的技术终态，失败作为观察返回父 | Fail-fast 可节省成本，但必须定义并行取消与部分结果规则 |
| SUB-03 | 深度与移交 | 深度 1、禁止 detached 和跨 Scope 移交 | 递归及受控移交扩展能力，但需更复杂预算与孤儿收敛设计 |

## 8. 后续实施切片

1. 先明确 SessionSnapshot、Delta 幂等与 Run 关联确认；用内存替身验证跨聚合中断窗口。
2. 接入 SQLite SessionRepository 和 Artifact 引用，保持现有 ContextEngine 算法及硬预算行为。
3. 评审并接入 Memory 只读视图与 Candidate 待审库；一次性提交授权完成前不开放共享写入。
4. 评审 Scope 创建意图、预算预留与稳定 Child 标识，接入统一 Scheduler 的单层 Child Run。
5. 完成 Join/取消/重启故障注入，再评审长期摘要、检索增强、深层委派或移交需求。
