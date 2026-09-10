> **非规范性归档：** 已拆入 L1 的 [SessionManager](../../../design/layers/l1-control/components/session-manager.md)、[FlowEngine](../../../design/layers/l1-control/components/flow-engine/README.md)、[ResourceManager](../../../design/layers/l1-control/components/resource-manager.md)和[SubagentCoordinator](../../../design/layers/l1-control/components/subagent-coordinator.md)。

# AgentSession、FlowEngine 与本地资源调度设计

> 状态：`ACR-2026-0009` 五步评审步骤一候选
> 返回主文档：[核心术语](agent-kernel-design.md#3-核心术语)、[调度与 Runtime](agent-kernel-design.md#7-agentsession调度flowengine-与-runtime)
> 相关设计：[Run、调度与 Runtime](run-scheduling-runtime-subsystem-design.md)、[上下文与长期记忆](context-memory-subsystem-design.md)、[层间边界协议](c4-boundary-protocols.md)

## 1. 核心结论

`AgentSession` 是持久化的技术会话档案，不是进程、线程、Worker 或业务 Workflow。`FlowEngine` 是无状态推进算法，不与 Session 一一绑定。`AgentRun` 是一次任务执行的权威状态，`AgentLoopStep` 是 Run/Attempt 内部的一步。

首版本地部署采用：**一个 Host 进程、一个 FlowEngine 实例、一个有界 Run 队列、若干异步执行槽、多个持久化 Session 和 Run**。需要吞吐时增加执行槽；只有 CPU、依赖冲突或安全隔离需要时才增加进程。

## 2. 对象关系与生命周期

```text
KernelHost 进程（1）
├── FlowEngine（1，进程级无状态服务）
├── ResourceManager（1，进程级资源协调器）
├── AgentRuntimePool（1）
│   └── ExecutionSlot（0..N，并发槽，不等于 Session）
└── 持久化状态
    ├── AgentSession（0..N，多轮/分支上下文档案）
    │   └── AgentRunRef（0..N，不拥有 Run）
    └── AgentRun（0..N，一次任务执行）
        └── AgentRunAttempt（1..N）
            └── AgentLoopStep（0..N）
```

| 对象 | 生命周期 | 权威状态 | 明确不拥有 |
|---|---|---|---|
| `AgentSession` | 创建到显式关闭/归档，可跨多个 Run | 上下文增量、消息/观察记录、Artifact 引用、版本号、可选父 Session 引用 | Run 执行状态、业务 Workflow、进程 |
| `AgentRun` | 一次外部或父 Run 执行意图到终态 | queued/running/suspended/completed/failed/cancelled、等待原因、预算、结果 | Session 内容、业务结果采纳 |
| `AgentRunAttempt` | 一次物理执行尝试 | Runtime 绑定、开始/结束、恢复点 | 跨 Attempt 权威结果 |
| `AgentLoopStep` | Attempt 内单步 | 模型、工具、上下文或委派步骤的顺序事实 | 整个 Run 生命周期 |
| `FlowEngine` | Host 进程级 | 无持久权威状态；读取快照、计算下一命令 | Session/Run 数据和业务工作流 |
| `ResourceManager` | Host 进程级 | 当前执行槽、内存/进程预算和临时占用 | Run 领域状态和业务优先级 |

### 2.1 状态归属纠偏

- `RUNNING/SUSPENDED/COMPLETED/FAILED` 属于 `AgentRun`。
- 等待审批或 Webhook 的断点由 `AgentRun.waitReasonRef` 指向 `PermissionRequest` 或外部事件订阅记录。
- `AgentSession` 可以保存 Run 引用和上下文结果，但不得复制 Run 状态作为第二份权威状态。
- Messages、Observations 和对外可审计的推理摘要可以进入 Session；模型私有原始 chain-of-thought 不持久化、不对外暴露。

## 3. FlowEngine 职责

FlowEngine 每次执行一个纯推进函数：

```text
NextAction = advance(RunSnapshot, SessionSnapshot, ContextFrame, RuntimeEvent)
```

它负责：

1. 根据 Run 状态决定调用模型、请求工具、挂起、恢复或结束；
2. 请求 ContextEngine 从 Session、Memory 和外部资源投影有界 `ContextFrame`；
3. 把模型动作候选交给 PEP/ToolRuntime，不直接执行受保护动作；
4. 将 Subagent 委派翻译为受约束的 Child Run 创建、Join 或 Cancel 命令；
5. 以带 expectedVersion 的命令提交结果，版本冲突时重新加载而不是覆盖。

它不负责：

- 保存业务 WorkflowInstance 或设计工作流；
- 组建 Multi-agent 团队、分配业务角色或决定团队协作策略；
- 长期持有某个 Session 的内存对象；
- 解释租户、用户或 RBAC；
- 绕过 Permission、Tool、Memory 或 Infrastructure Port。

## 4. Session 是否独占进程

**不独占。** 一个 Session 一进程会让空闲会话持续占用内存、文件描述符和调度实体，并使数千个挂起会话不可接受。Session 必须可序列化、可卸载；只有 Run 获得执行槽时，Runtime 才临时加载所需快照。

首版资源模型：

| 资源 | 默认模型 | 上限来源 |
|---|---|---|
| Host 进程 | 1 | 本地部署配置 |
| FlowEngine | 1 个无状态实例 | Composition Root |
| 执行槽 | `maxConcurrentRuns` 个协程槽 | ResourceManager 配置与硬上限 |
| Session | SQLite 中任意多个逻辑记录 | 存储配额/保留策略 |
| 活动上下文 | 仅活动 Attempt 按需加载 | token、字节和 Artifact 上限 |
| Sandbox 子进程 | 工具执行期间临时存在 | `maxSandboxProcesses` |

## 5. Subagent 与上层 Multi-agent 的边界

Kernel 只支持单个 Run 内的结构化 Subagent：

```text
Parent AgentRun
  → ChildRunPort.submitChild
  → Scheduler 创建 Child AgentRun
  → 可选 SessionBranchPort.branch（需要上下文隔离时）
  → ResourceManager 排队并分配执行槽
  → Child 终态
  → JoinResultRef 回到 Parent Run
```

- Parent 终态前必须 Join、Cancel 或显式移交 Child；不允许 detached child。
- Child 权限、预算、Deadline 和资源上限只能是 Parent 的子集。
- 默认复用 Parent Session 的只读 ContextSnapshot，并把结果作为 Artifact/ContextDelta 回传。
- 只有需要独立上下文演进时才创建 Child Session；Child Session 不是新进程。
- Multi-agent 的团队拓扑、角色、通信协议、仲裁和终止策略由上层业务编排拥有。上层可以创建多个独立 Run/Session，Kernel 不提供 `MultiAgentRun` 或 `MultiAgentManager`。

## 6. ResourceManager 最小接口

```ts
/** 本地执行资源协调接口；只管理机制容量，不解释业务优先级。 */
export interface ExecutionResourcePort {
  /** 为已进入可运行状态的 Attempt 申请一个有界执行槽。 */
  acquire(request: ExecutionSlotRequest, signal: AbortSignal): Promise<ExecutionSlotLease>;

  /** 释放执行槽；实现必须幂等。 */
  release(lease: ExecutionSlotLease): Promise<void>;

  /** 返回用于调度与健康检查的脱敏容量快照。 */
  snapshot(): Promise<ResourceSnapshot>;
}
```

`ExecutionSlotRequest` 只包含 run/attempt 引用、deadline、资源类别和上限，不包含业务优先级。首版实现使用有界 FIFO 队列、Semaphore 和 deadline；队列满返回稳定 `RESOURCE_QUEUE_FULL`，不得无限等待或创建无界协程。

## 7. 调度流程

1. Gateway 提交 Run 命令并持久化 `QUEUED`；
2. Scheduler 从本地有界队列选择可运行 Run；
3. ResourceManager 分配执行槽；
4. Runtime 加载 Run/Session 快照，FlowEngine 计算下一动作；
5. 每个领域更新分别以 expectedVersion 提交；
6. 遇到工具/审批/外部事件时释放执行槽并将 Run 标记为 `SUSPENDED`；
7. 恢复信号到达后重新排队，不保留休眠进程或协程；
8. Run 终态后释放所有临时资源，Session 继续存在或按策略归档。

## 8. 最小验收用例

- 1000 个挂起 Session 不产生 1000 个进程或常驻协程；
- 同一 Session 下两个 Run 并发更新时，Session version 冲突的一方重新加载；
- Run 挂起等待审批时释放执行槽，批准后可重新调度；
- Parent 取消会级联取消未终态 Child；
- Child Session 分支只保存增量与父快照引用；
- 队列满、deadline 到期、进程预算耗尽均返回稳定错误且无资源泄漏；
- 重启后从 Run/Session Repository 重建可运行队列，不依赖内存中的 FlowEngine 状态。
