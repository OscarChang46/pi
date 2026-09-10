---
doc_id: FE-CON-1
level: contract
layer: L1 Control & Orchestration Runtime
component: ReActFlowPolicy
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ReAct业务推进契约
parent: L1-CMP-008
interfaces: [FlowAdvancePort]
diagrams: []
supersedes: []
---

# FE-CON-1：项目级推进与运行边界契约

定位修订：本文件解释ReAct业务状态与候选运行边界，通用FlowEngine的四态及追加日志以[系统SR](../layers/l1-control/components/flow-engine/protocol-index.md)为准。下文Core现为ReActFlowPolicy；这里的旧首版额度和运维目标不等于当前Docker实现。

状态：candidate；协议版本1.0.0。本文件承接FlowEngine原21.1—21.9（含21.8.1），供Core及相关组件共同使用。保留原节号以维持追踪；迁移不代表架构批准或运行边界已实现。

通用开发要求已提炼至本机code-development技能的references/development-contracts.md；本项目的具体类型、迁移、身份公式和数值仍以本项目契约为准，不提升为跨项目规则。

[组件设计](../layers/l1-control/components/flow-engine/README.md)；[完整固定向量](../layers/l1-control/components/flow-engine/history/react-contract-v1.examples.json)。跨组件CD-1仍在独立工作中，不作为本次FlowEngine提交的已发布依赖。

真实性开放项：原21.5规定负零转换为0，当前canonical.ts与AK-FE-003拒绝负零；本次原文迁移保留该差异，不修改协议或代码掩盖问题。其他运行边界条款属于设计要求，不能推断真实T1/T2、Permit或崩溃恢复已通过验收。

### 21.1 类型、边界与序列化

所有类型按 TypeScript 只读结构实现；JSON 序列化只允许 null、boolean、合法 Unicode 字符串、有限安全整数、数组及普通对象。不允许 undefined、NaN、Infinity、浮点数、BigInt、Date、Map/Set 或函数；可空字段写 null，不省略。未知字段/枚举值及错误主版本在入口拒绝。内部纯计算不接收 AbortSignal、数据库句柄、Provider 对象、原始 User Token 或 Permit 密钥。

`Ref` 是 1—128 个 ASCII `[A-Za-z0-9._:-]` 字符组成的不透明引用，不是可直接获取资源的 URL；`Digest` 为 `sha256:` 加 64 位小写十六进制；`Counter` 为 0—9007199254740991 的整数，递增溢出必须拒绝。UTC 时间统一使用毫秒 Unix 整数，时区只用于呈现，不参与截止判断。源内容转为不可变 Artifact 后只传引用和内容摘要；读取仍需执行信封作用域验证。

```typescript
type Ref = string;
type Digest = string;
type Counter = number;
type Millis = number;
type Effect = "NONE" | "KNOWN_NOT_APPLIED" | "KNOWN_APPLIED" | "UNKNOWN";

interface ArtifactRef {
  readonly id: Ref;
  readonly digest: Digest;
  readonly bytes: Counter;
}
interface FrozenBindings {
  readonly sessionId: Ref;
  readonly sessionVersion: Counter;
  readonly executionEnvelopeRef: Ref;
  readonly routeSnapshotRef: Ref;
  readonly policySnapshotRef: Ref;
  readonly configVersion: Ref;
}
interface RunBudget {
  readonly maxTurns: Counter;
  readonly maxToolCalls: Counter;
  readonly maxChildren: Counter;
  readonly maxDepth: Counter;
  readonly maxContextBytes: Counter;
  readonly maxInputTokens: Counter;
  readonly outputReserveTokens: Counter;
  readonly maxOutputBytes: Counter;
}
interface RunUsage {
  readonly turnsReserved: Counter;
  readonly toolsReserved: Counter;
  readonly childrenReserved: Counter;
}
interface ActionProposal {
  readonly proposalId: Ref;
  readonly toolDescriptorRef: Ref;
  readonly toolDescriptorDigest: Digest;
  readonly argumentsRef: ArtifactRef;
  readonly actionDigest: Digest;
}
interface ChildSpec {
  readonly goalRef: ArtifactRef;
  readonly envelopeSubsetRef: Ref;
  readonly budget: RunBudget;
  readonly deadlineAtMs: Millis;
}
type WaitReason =
  | { readonly kind: "approval"; readonly approvalRef: Ref; readonly proposalId: Ref }
  | { readonly kind: "tool_unknown"; readonly toolCommandId: Ref; readonly incidentRef: Ref }
  | { readonly kind: "model_unknown"; readonly modelCommandId: Ref; readonly incidentRef: Ref };
type FlowPosition =
  | { readonly kind: "Ready" }
  | { readonly kind: "AwaitingModel"; readonly commandId: Ref }
  | { readonly kind: "AwaitingPermission"; readonly proposalId: Ref; readonly commandId: Ref }
  | { readonly kind: "AwaitingTool"; readonly proposalId: Ref; readonly commandId: Ref }
  | { readonly kind: "AwaitingChild"; readonly childId: Ref; readonly commandId: Ref }
  | { readonly kind: "Suspended"; readonly reason: WaitReason }
  | { readonly kind: "Completed"; readonly outputRef: ArtifactRef }
  | { readonly kind: "Failed"; readonly code: FlowErrorCode }
  | { readonly kind: "Cancelled"; readonly reason: "requested" | "deadline" };
interface RunSnapshot {
  readonly runId: Ref;
  readonly attemptId: Ref;
  readonly version: Counter;
  readonly consumedSequence: Counter;
  readonly bindings: FrozenBindings;
  readonly position: FlowPosition;
  readonly budget: RunBudget;
  readonly usage: RunUsage;
  readonly depth: Counter;
  readonly deadlineAtMs: Millis;
  readonly cancelEpoch: Counter;
  readonly cancellationRequested: boolean;
  readonly pendingActions: readonly ActionProposal[];
  readonly transcriptHeadRef: Ref;
}
interface SessionSnapshot {
  readonly sessionId: Ref;
  readonly version: Counter;
  readonly historyHeadRef: Ref;
}
interface ContextFrame {
  readonly frameId: Ref;
  readonly bindings: FrozenBindings;
  readonly sourceRunVersion: Counter;
  readonly transcriptHeadRef: Ref;
  readonly promptRef: ArtifactRef;
  readonly inputTokens: Counter;
}
interface OperationContext {
  readonly requestId: Ref;
  readonly traceparent: string;
  readonly correlationId: Ref;
  readonly nowMs: Millis;
  readonly deadlineAtMs: Millis;
}
```

字段语义：`pendingActions` 按模型给出的顺序保存尚未完成的工具建议，最多 8 项；只派发首项，禁止并行工具首版。`transcriptHeadRef` 是 RunRegistry 持有的追加式转录索引引用；Session 历史不随 Run 提交隐式修改。`SessionSnapshot.version` 必须等于 Run 冻结的 sessionVersion；不是简单要求 Session 当前版本最新。并发 Session 写入不能改变本 Run 的历史基线。

`cancelEpoch` 由 RunRegistry 单调增加；取消标志一旦置位不得撤回。`operation.deadlineAtMs <= run.deadlineAtMs`；入口和派发端都以 `nowMs >= deadlineAtMs` 判定到期。`ContextFrame` 仅在产生 InvokeModel 时必需，其他路径允许 null，避免取消/失败处理依赖上下文服务健康。Frame 的五项冻结绑定、来源 Run 版本与转录头必须全部匹配。

### 21.2 规范化事件与接收规则

```typescript
type ModelOutput =
  | { readonly kind: "answer"; readonly outputRef: ArtifactRef }
  | { readonly kind: "tools"; readonly proposals: readonly ActionProposal[] }
  | { readonly kind: "child"; readonly spec: ChildSpec };
type RuntimePayload =
  | { readonly kind: "AdvanceRequested"; readonly basisVersion: Counter }
  | { readonly kind: "ModelCompleted"; readonly modelCommandId: Ref;
      readonly assistantTurnRef: ArtifactRef; readonly output: ModelOutput }
  | { readonly kind: "ModelFailed"; readonly modelCommandId: Ref; readonly effect: Effect }
  | { readonly kind: "PermissionResolved"; readonly proposalId: Ref; readonly result:
      | { readonly kind: "allow"; readonly permitRef: Ref; readonly expiresAtMs: Millis }
      | { readonly kind: "ask"; readonly approvalRef: Ref }
      | { readonly kind: "deny" }
      | { readonly kind: "unavailable" } }
  | { readonly kind: "ToolObserved"; readonly toolCommandId: Ref; readonly proposalId: Ref;
      readonly effect: Effect; readonly outcome: "success" | "failed"; readonly resultRef: ArtifactRef | null }
  | { readonly kind: "ApprovalResolved"; readonly approvalRef: Ref; readonly proposalId: Ref;
      readonly approved: boolean }
  | { readonly kind: "ChildCompleted"; readonly childId: Ref;
      readonly outcome: "completed" | "failed" | "cancelled"; readonly resultRef: ArtifactRef | null }
  | { readonly kind: "EffectReconciled"; readonly commandId: Ref; readonly incidentRef: Ref;
      readonly result: "model_completed" | "tool_completed" | "not_applied" | "failed";
      readonly resultRef: ArtifactRef | null }
  | { readonly kind: "CancelRequested" }
  | { readonly kind: "DeadlineReached" };
interface RuntimeEvent {
  readonly eventId: Ref;
  readonly runId: Ref;
  readonly attemptId: Ref;
  readonly sequence: Counter;
  readonly source: "scheduler" | "model" | "security" | "tool" | "child" | "recovery";
  readonly causationId: Ref;
  readonly payload: RuntimePayload;
  readonly payloadDigest: Digest;
}
interface PriorEventReceipt {
  readonly eventId: Ref;
  readonly sequence: Counter;
  readonly payloadDigest: Digest;
  readonly commitId: Ref;
}
interface AdvanceInput {
  readonly protocolVersion: "1.0.0";
  readonly run: RunSnapshot;
  readonly session: SessionSnapshot;
  readonly context: ContextFrame | null;
  readonly contextFailure: "unavailable" | "limit_exceeded" | null;
  readonly event: RuntimeEvent;
  readonly priorReceipt: PriorEventReceipt | null;
  readonly operation: OperationContext;
}
```

运行输入来源由受信任适配器验证，`source` 不是自签权限。接收顺序：验证来源、作用域、大小与 Artifact 可访问性 → 按 eventId 去重 → 检查与当前等待/命令记录的因果关系 → 仅可立即消费的事件在 RunRegistry 内分配 Run 级 sequence 并持久化 Inbox。提前到达但已绑定合法命令的事实进入不占 sequence 的 DeferredReceipt；没有任何合法命令或等待依据的事件隔离。外部生产者不决定权威 sequence。消费、版本与决策提交一起发生。

来源白名单（运行身份由适配层认证，payload.source 不足以授权）：scheduler 仅 AdvanceRequested/CancelRequested/DeadlineReached；model 仅 ModelCompleted/ModelFailed；security 仅 PermissionResolved/ApprovalResolved；tool 仅 ToolObserved；child 仅 ChildCompleted；recovery 可产生 EffectReconciled，或在权威执行回执验证后重建 ModelCompleted/ModelFailed/ToolObserved/ChildCompleted。其他组合在分配 sequence 前拒绝。审批事件还必须验证审批人员有权处置原等待引用；recovery 不能自建 allow 或 approved 事实。

AdvanceRequested 只由 RunRegistry 在 Ready 状态、无已排队推进事件时生成，eventId=`wake:`+SHA256(FE-C14N-1({runId,version,kind:"advance"}))，basisVersion=该 Run.version；(runId,basisVersion) 唯一。Scheduler 的提示/扫描仅请求确保该事件存在，不直接追加事件。初始受理 Ready、Tool/Child 结果进入 Ready 的 T2 均原子创建此事件或持久 runnable 标记；扫描按同一规则补齐，不产生第二个独立 AdvanceRequested。取消/接管导致版本变化时旧 wake 在受控重基事务中记 superseded，不能阻塞新的有效推进。

每个 Run 同时至多一个 admitted 未消费事件。T2 提交后从 DeferredReceipt 中选择与新状态匹配的事实再分配下一 sequence；选择顺序为耐久 ingressOrdinal 递增，同命令互斥结果由执行回执权威性验证，不任意选胜者。永久非法 admitted 事件通过 RunRegistry 的 quarantineHead 操作处理：要求当前 claim、expectedVersion、稳定拒绝证明；同事务记 quarantined 收据、前进消费游标、version+1、保留隔离事实并重新选择可消费事件，禁止产生业务命令或任意改写 FlowPosition。普通 sequence 缺口先从 Journal 修复，不调用 quarantineHead 跳过未知事实。

Core 对重复的判断要求 eventId、sequence、payloadDigest 全部匹配 priorReceipt，且 receipt.sequence <= run.consumedSequence。相同 ID 或 sequence 异载荷一律拒绝；旧 sequence 找不到收据不能当作合法重复。新事件必须 `sequence = consumedSequence + 1`，缺口不推进。一个 eventId 的语义在整个 Run 内不可改变。

事件与命令绑定：模型回执必须匹配 AwaitingModel.commandId；权限回执必须匹配当前 proposalId 且 causationId 等于当前权限 commandId；工具回执同时匹配 proposalId 与 toolCommandId；ChildCompleted 匹配 childId；审批匹配挂起原因中的两个引用。工具成功必须有 resultRef，UNKNOWN 不得声明 success；answer 的 Artifact 字节数不得超过 maxOutputBytes。工具数组长度 1—8，proposalId 唯一，Artifact 均有不可变摘要。输出同时包含文本与工具时 Adapter 将文本作为转录事实，规范化 output 选择 tools，不在同一事件中完成 Run。

恢复会创建新 Attempt。旧 Attempt 原始回调隔离；恢复器查询可信执行记录后创建新 eventId、当前 attemptId、`source=recovery` 的规范化完成事件，保留原 commandId 作为因果引用。不修改旧事件的 attemptId，也不直接放行旧 Worker 写入。 权限与审批是例外：恢复器按原权限commandId或approvalRef查询安全端，由安全端验证当前执行信封/授权epoch及审批有效性，以source=security为当前Attempt重新签发PermissionResolved/ApprovalResolved；不可沿用旧allow绕过当前撤销。新eventId=`security-replay:`+SHA256(FE-C14N-1({runId,attemptId,originalEventId,securityRecordVersion}))，同键载荷固定。旧Deferred事实同样按事件类型重建；无法确认时保留待恢复事实且禁止派发，不能由recovery自签授权。

CancelRequested/DeadlineReached 为 Scheduler 的唤醒事件；取消标志先经 RunRegistry 原子置位，故终止判定不依赖取消事件排在 Inbox 首位。终态之后新到达事件写独立迟到事实记录，不分配活跃 Inbox sequence，不重新打开 Run。

### 21.3 推进结果、命令与错误

```typescript
type FlowErrorCode =
  | "FLOW_INPUT_INVALID" | "FLOW_SCOPE_MISMATCH" | "FLOW_EVENT_CONFLICT"
  | "FLOW_SEQUENCE_GAP" | "FLOW_STALE_ATTEMPT" | "FLOW_INVALID_TRANSITION"
  | "FLOW_CONTEXT_REQUIRED" | "FLOW_CONTEXT_LIMIT_EXCEEDED" | "FLOW_BUDGET_EXCEEDED"
  | "FLOW_CONTEXT_UNAVAILABLE"
  | "FLOW_MODEL_FAILED" | "FLOW_PERMISSION_DENIED" | "FLOW_PERMISSION_UNAVAILABLE"
  | "FLOW_PERMIT_INVALID" | "FLOW_TOOL_FAILED" | "FLOW_CHILD_FAILED"
  | "FLOW_RECONCILIATION_FAILED" | "FLOW_INTERNAL_PLAN_INVALID";
interface FlowError {
  readonly code: FlowErrorCode;
  readonly field: string | null;
}
type CommandPayload =
  | { readonly kind: "InvokeModel"; readonly promptRef: ArtifactRef }
  | { readonly kind: "RequestPermission"; readonly proposal: ActionProposal }
  | { readonly kind: "DispatchTool"; readonly proposal: ActionProposal; readonly permitRef: Ref }
  | { readonly kind: "CreateChildRun"; readonly childId: Ref; readonly spec: ChildSpec }
  | { readonly kind: "CancelOutstanding"; readonly cancelEpoch: Counter }
  | { readonly kind: "RequestReconciliation"; readonly targetCommandId: Ref; readonly incidentRef: Ref };
interface EngineCommand {
  readonly commandId: Ref;
  readonly idempotencyKey: Ref;
  readonly causationId: Ref;
  readonly runId: Ref;
  readonly originAttemptId: Ref;
  readonly executionEnvelopeRef: Ref;
  readonly deadlineAtMs: Millis;
  readonly payload: CommandPayload;
}
interface TranscriptEntry {
  readonly kind: "assistant" | "tool" | "child";
  readonly eventId: Ref;
  readonly commandId: Ref;
  readonly proposalId: Ref | null;
  readonly childId: Ref | null;
  readonly artifact: ArtifactRef;
}
interface NextRunState {
  readonly position: FlowPosition;
  readonly usage: RunUsage;
  readonly pendingActions: readonly ActionProposal[];
  readonly transcriptAppend: readonly TranscriptEntry[];
}
type PlannedPosition =
  | Exclude<FlowPosition, { readonly commandId: Ref }>
  | { readonly kind: "AwaitingModel"; readonly commandOrdinal: Counter }
  | { readonly kind: "AwaitingPermission" | "AwaitingTool";
      readonly proposalId: Ref; readonly commandOrdinal: Counter }
  | { readonly kind: "AwaitingChild"; readonly childId: Ref; readonly commandOrdinal: Counter };
interface PlannedRunState extends Omit<NextRunState, "position"> {
  readonly position: PlannedPosition;
}
interface TransitionPlan {
  readonly next: PlannedRunState;
  readonly commands: readonly CommandPayload[];
}
interface AdvanceDecision {
  readonly decisionId: Ref;
  readonly decisionDigest: Digest;
  readonly inputDigest: Digest;
  readonly runId: Ref;
  readonly attemptId: Ref;
  readonly expectedVersion: Counter;
  readonly expectedCancelEpoch: Counter;
  readonly consumedEventId: Ref;
  readonly consumedSequence: Counter;
  readonly next: NextRunState;
  readonly commands: readonly EngineCommand[];
}
type AdvanceResult =
  | { readonly kind: "advance"; readonly decision: AdvanceDecision }
  | { readonly kind: "ignore"; readonly reason: "duplicate" | "terminal";
      readonly existingCommitId: Ref | null }
  | { readonly kind: "reject"; readonly error: FlowError };
interface FlowAdvancePort {
  advance(input: AdvanceInput): AdvanceResult;
}
```

`advance` 同步、无 I/O，所有预期错误使用 reject，不抛出领域异常；非预期代码异常由调用方转为内部故障并禁止提交。拒绝不消耗 sequence、不自动把 Run 标为 Failed；合法外部失败事件产生 advance，其 next.position 为 Failed/Suspended。`ignore` 不调用 Factory、不生成命令也不增加 Run.version；duplicate 必须返回既有 commitId，terminal 返回 null（已有重复优先返回重复收据）。

`field` 仅允许 schema 字段路径，不携带输入值。错误日志只能记录白名单 code、阶段与技术分类；原始身份、Prompt、参数、资源路径不得进入 FlowError。ContextRequired 可由 Coordinator 组装对应 Context 后对同一事件重算；其他拒绝先修正来源或交受控处置，禁止热循环重试。

早期概念名映射：ProposeAction = RequestPermission；CompleteRun/FailRun/SuspendRun 是 next.position 状态变更，不是需要外部执行的命令；JoinChildRun = AwaitingChild 的等待与 ChildCompleted 消费，不额外执行一次 Join 副作用；CreateChildRun 保留。新增 DispatchTool 明确已授权派发意图，新增 CancelOutstanding 仅可取消/查询既有动作，不能创建新动作。

Factory 输入 TransitionPlan 使用 `next` 与有序 CommandPayload，不能接受已有 commandId。Factory 校验 commandOrdinal 为 commands 的有效下标、对应命令种类与目标等待状态一致，再分配确定性命令 ID 填充 position.commandId；next 不包含任意可写字段、版本、route 或权限快照。每次最多 2 个命令（终止时清理及核对），正常推进最多 1 个。

### 21.4 完整推进规则与优先级

每次按以下顺序判断，命中即返回：结构/来源绑定/事件身份校验 → 已提交重复 → 终态忽略 → 取消标志 → Deadline 到期 → 事件与当前等待的因果匹配 → 对应迁移规则。优先级固定为终态 > 取消 > 超时 > 正常/失败结果。恶意/错配事件不能通过取消标志绕过 Guard。消耗事件仍只允许下一个 sequence。

取消/超时生成 Cancelled 和 CancelOutstanding，清空 pendingActions，保留已经计入的用量；清理命令可以在 Run 截止后执行，使用独立 30 秒清理窗口，不能借此恢复业务派发。已发生工具结果由执行事实记录保留，终态不改为 Suspended。未满足状态表的其他事件全部 FLOW_INVALID_TRANSITION；提前到达但合法的外部事件由接收方持久化并等待，不能猜测完成。

| 当前状态 | 事件 / 条件 | 下一状态及数据变更 | 命令与用量 |
|---|---|---|---|
| Ready | AdvanceRequested；pendingActions 非空 | AwaitingPermission；使用首个 Proposal | RequestPermission；不增加调用用量 |
| Ready | AdvanceRequested；无待办；contextFailure 非空 | Failed FLOW_CONTEXT_UNAVAILABLE / FLOW_CONTEXT_LIMIT_EXCEEDED | 原事件 T2 提交，不调用模型 |
| Ready | AdvanceRequested；无待办；Frame 缺失/不匹配 | reject FLOW_CONTEXT_REQUIRED | 不提交；组装后重算 |
| Ready | AdvanceRequested；Frame 合法、turnsReserved < maxTurns | AwaitingModel | InvokeModel；turnsReserved +1 |
| Ready | 需新模型但轮次耗尽 | Failed FLOW_BUDGET_EXCEEDED | 无业务命令 |
| AwaitingModel | ModelCompleted(answer) | Completed；outputRef，追加输出 Artifact | 无；不再调用模型 |
| AwaitingModel | ModelCompleted(tools)；剩余工具额度 >= 数组长度 | AwaitingPermission；保存整个有序 Proposal 数组 | 对首项 RequestPermission；工具额度暂不扣减 |
| AwaitingModel | ModelCompleted(tools)；额度不足或输出过大 | Failed FLOW_BUDGET_EXCEEDED / FLOW_CONTEXT_LIMIT_EXCEEDED | 不执行部分数组 |
| AwaitingModel | ModelCompleted(child)；子集和数量/深度满足 | AwaitingChild；确定 childId | CreateChildRun；childrenReserved +1 |
| AwaitingModel | ModelCompleted(child)；约束不满足 | Failed FLOW_BUDGET_EXCEEDED（技术额度）或 FLOW_SCOPE_MISMATCH（子集证明失配） | 无创建；PDP/ChildRunPort 最终复核权限 |
| AwaitingModel | ModelFailed；effect=UNKNOWN 或 KNOWN_APPLIED 且无可恢复结果 | Suspended(model_unknown) | RequestReconciliation；不自动重发模型 |
| AwaitingModel | ModelFailed；明确未执行或明确失败无未知费用 | Failed FLOW_MODEL_FAILED | 首版不自动重试模型 |
| AwaitingPermission | PermissionResolved(allow)；Permit 引用绑定且未到期、工具预算充足 | AwaitingTool | DispatchTool；toolsReserved +1；PEP 仍须最终验证 |
| AwaitingPermission | PermissionResolved(ask) | Suspended(approval)，保留 Proposal 队列 | 无；提交后释放执行槽 |
| AwaitingPermission | deny / unavailable / 已过期 allow | Failed FLOW_PERMISSION_DENIED / FLOW_PERMISSION_UNAVAILABLE / FLOW_PERMIT_INVALID | 无工具派发，清空待办 |
| AwaitingTool | ToolObserved；effect=UNKNOWN | Suspended(tool_unknown)，保留当前 Proposal | RequestReconciliation；零自动重试 |
| AwaitingTool | ToolObserved；success 且结果有界、effect=KNOWN_APPLIED 或 NONE（只读） | Ready；移除首 Proposal，追加结果 Artifact | 无；提交后调度 AdvanceRequested，继续下一 Proposal 或模型 |
| AwaitingTool | ToolObserved；已知失败 | Failed FLOW_TOOL_FAILED，清空待办 | 首版不自动重试工具，不回退已预留用量 |
| Suspended(approval) | ApprovalResolved(approved=true)；匹配原审批/Proposal | AwaitingPermission，保留原队列 | 新 RequestPermission，PDP 根据审批事实重新签发；不生成模型调用 |
| Suspended(approval) | ApprovalResolved(false) | Failed FLOW_PERMISSION_DENIED | 无 |
| Suspended(tool_unknown) | EffectReconciled(tool_completed)；可验证的结果 | Ready，移除原首 Proposal并追加结果 | 无；结果必须来自可信执行核对 |
| Suspended(model_unknown) | EffectReconciled(model_completed)；可验证最终文本 | Completed，追加最终输出 | 无；首版不能用此事件恢复半包工具计划 |
| Suspended(unknown) | EffectReconciled(not_applied/failed)，或模型核对无法恢复完整最终文本 | Failed FLOW_RECONCILIATION_FAILED | 无；需重试时用户另建 Run，不静默重复费用/动作 |
| AwaitingChild | ChildCompleted(completed)；结果有界 | Ready；追加 Child 结果 | 无；下次推进再调用模型 |
| AwaitingChild | ChildCompleted(failed/cancelled) | Failed FLOW_CHILD_FAILED | 无 |
| 任意非终态 | cancellationRequested=true | Cancelled(requested) | CancelOutstanding |
| 任意非终态 | 未取消且 nowMs >= 有效 Deadline | Cancelled(deadline) | CancelOutstanding |
| 任意终态 | 合法迟到新事件 | ignore terminal | 零新业务动作，不新增 Run 版本 |

`Evaluating` 是 Resolver 处理 ModelCompleted 的局部阶段，不持久化、不消耗额外事件，也不等待第二个 FinalAnswerProduced。Ready/权限/工具/Child 等状态只由上述表驱动。Core 不判 RBAC；Child 子集使用已验证 envelopeSubsetRef 与冻结预算边界，权限最终由 ChildRunPort 验证，拒绝时通过可信 ChildCompleted(failed) 回收。

资源检查只在即将预留对应动作时触发，不因剩余额度为零而拒收已完成结果。第 8 个工具已执行完后允许完成当前 Run；若接下来还需模型且 maxTurns 已耗尽则失败。用量在命令提交时预留、终态不退还，重投/查询/审批恢复不重复增加。

### 21.5 确定性 ID、摘要与幂等范围

规范化算法 `FE-C14N-1`：入口先验证 21.1 的 JSON 子集；对象键按 UTF-16 码元排序，字符串按下述唯一转义编码，不进行 Unicode 归一化；数组保持原顺序；整数使用十进制无前导零，负零转换为 0；null 保留。最终 UTF-8 字节使用 SHA-256。现有 authorization-digest.ts 仅在输入满足此严格子集时可复用，不能依赖它将 undefined 丢弃或把非法值转换成 null 的行为。

字符串编码严格等同对已验证字符串使用 ECMAScript JSON.stringify：仅引号、反斜线及 U+0000—001F 转义；退格/制表/换行/换页/回车使用短转义，其余控制字符使用小写十六进制。正斜线不转义，非 ASCII 合法字符直接 UTF-8（包括 U+2028/U+2029），拒绝孤立代理项，无格式空格/BOM/末尾换行。精确字节见随附向量；禁止使用另一种合法 JSON 转义形式计算摘要。

定义 H(x) = `sha256:` + SHA256(FE-C14N-1(x))，ID(x) 为摘要去掉 `sha256:` 后加对应前缀。摘要只验证内容一致性，不是授权证明，也不是可公开的低熵敏感内容脱敏方式。

| 名称 | 精确计算 / 唯一范围 |
|---|---|
| event.payloadDigest | H({source, causationId, payload})；事件入口按 (runId,eventId) 唯一 |
| inputDigest | H({protocolVersion,run,session,context,contextFailure,event,priorReceipt,nowMs,deadlineAtMs})；排除 requestId、traceparent、correlationId |
| decisionId | `dec:` + SHA256(FE-C14N-1({v:"FE-CON-1",runId,attemptId,expectedVersion,eventId,inputDigest})) |
| commandId | `cmd:` + SHA256(FE-C14N-1({decisionId,ordinal,payload}))；ordinal 从 0 起 |
| idempotencyKey | 等于 commandId；首版不为同一命令额外引入不同键 |
| childId | `child:` + SHA256(FE-C14N-1({runId,eventId,kind:"child"}))；独立于 Attempt，便于恢复查询 |
| incidentRef | `inc:` + SHA256(FE-C14N-1({runId,targetCommandId,kind:"unknown"})) |
| decisionDigest | H(AdvanceDecision 去除 decisionDigest 字段)；可重算验证，禁止循环哈希 |
| commitId | 等于 decisionId；唯一约束 (runId,commitId)，同 ID 异 digest 冲突 |
| actionDigest | H({proposalId,toolDescriptorRef,toolDescriptorDigest,argumentsRef})；PDP/执行边界均复算并绑定执行信封与授权 epoch |

重新计算相同输入即产生相同结果；推进期间 nowMs 变化属于不同输入，不保证新 decisionId 相同。CAS 失败且权威确认未提交时可以重算新决策；已提交命令即使发生接管也必须沿用原 commandId、payload 和 originAttemptId。新的执行资格通过单独 dispatch claim 传递，不能改写已提交命令。

幂等记录、输入事件、提交回执、命令 payloadDigest 与执行状态保留到 Run 终态后 30 天；非终态或未解决 incident 不得删除。过期 Run 引用返回 GONE，不自动重新创建；30 天后无收据的同 ID 请求不能被当成第一次请求静默重放。首版 Run Inbox 上限 4096 条，达到上限前保留 32 条用于取消、超时与恢复，普通输入满时拒绝受理而非丢弃已受理事件。

### 21.6 RunRegistry 事务与执行记录

FlowEngine 不持有 Repository。Coordinator 的 StateCommitPort 是 RunRegistry 的用例适配门面，不另建 State Store。首版 SQLite 单库可实现下列逻辑事务，但不要求 Session、Artifact、安全 Permit 或外部 Tool Store 与 Run 同一事务。

**事务 T1：受理事件。** 验证来源/绑定及 Artifact 已发布 → 检查 eventId 及载荷一致性 → 按 21.2 的可消费规则选择 admitted Inbox 或不占 sequence 的 DeferredReceipt；重复返回原 receipt，尚未 admitted 的 sequence=null。事务成功后才确认上游接收，提示队列投递失败由 Inbox 扫描恢复。普通事件不得被伪装为清理事件占用保留配额。

**事务 T2：消费与决策提交。** 在一个事务内依次检查：既有 commitId 回执（同 digest 返回原回执）→ 当前执行 claim → Run.version=expectedVersion → cancelEpoch=expectedCancelEpoch → 下一个未消费事件身份/摘要一致 → next 与命令合法且符合冻结预算 → 更新 Run.position/usage/pendingActions 与转录索引 → consumedSequence 前进一位 → version+1 → 插入命令 outbox、消费收据与 DomainEvent。任意失败全部回滚。旧 Attempt/Fence 只能查询，不能更新。Session 不在此事务中写入；Artifact 先发布，T2 只引用，孤立 Artifact 由 GC 回收。

取消是独立 RunRegistry 命令：幂等增加 cancelEpoch、置 cancellationRequested、使旧业务派发 claim 失效并增加 Run.version，再唤醒 Core。所有业务派发都复核此状态。取消已完成 Run 返回原终态，不把它重新打开。终态和清理/迟到执行事实分表保存，清理记录更新不改变终态 Run.version。

```typescript
interface ExecutionClaim {
  readonly ownerId: Ref;
  readonly attemptId: Ref;
  readonly fence: Counter;
  readonly expiresAtMs: Millis;
}
interface CommitRequest {
  readonly input: AdvanceInput;
  readonly decision: AdvanceDecision;
  readonly claim: ExecutionClaim;
}
type CommitResult =
  | { readonly kind: "committed"; readonly commitId: Ref; readonly runVersion: Counter }
  | { readonly kind: "conflict"; readonly actualVersion: Counter; readonly reason: "version" | "cancel" | "claim" }
  | { readonly kind: "rejected"; readonly code: "INVALID_DECISION" | "IDEMPOTENCY_CONFLICT" | "EVENT_MISMATCH" };
type CommitQuery =
  | { readonly kind: "committed"; readonly commitId: Ref; readonly runVersion: Counter }
  | { readonly kind: "absent" }
  | { readonly kind: "gone" };
type CommandStatus = "PENDING" | "CLAIMED" | "ACCEPTED" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "CANCELLED";
interface CommandRecord {
  readonly command: EngineCommand;
  readonly payloadDigest: Digest;
  readonly status: CommandStatus;
  readonly dispatchClaim: ExecutionClaim | null;
  readonly providerReceiptRef: Ref | null;
  readonly resultRef: ArtifactRef | null;
  readonly effect: Effect;
}
interface StateCommitPort {
  commit(request: CommitRequest): Promise<CommitResult>;
  queryCommit(runId: Ref, commitId: Ref): Promise<CommitQuery>;
  queryCommand(runId: Ref, commandId: Ref): Promise<CommandRecord | null>;
}
```

传输/存储不可用抛出边界 TransportError，不伪造 absent/conflict。commit 超时后查询同一 commitId；queryCommit 的 absent 只说明查询时点无提交，原未完成事务仍可能稍后提交，因此只有撤销/失效旧 claim 并在权威事务屏障后确认 absent 才可重算。否则继续查询或报告 UNKNOWN，不产生第二个动作。

派发状态机：PENDING → CLAIMED（原子领取）→ ACCEPTED（执行端返回耐久受理凭证）→ SUCCEEDED/FAILED。CLAIMED 后进程丢失且无法确认执行端受理，即 UNKNOWN，不能直接回到 PENDING。确定未跨执行边界且旧领取已失效，可按同一 commandId 再领取。PENDING 可因取消变 CANCELLED；ACCEPTED 只能请求取消并按真实结果收敛，不能伪称未发生。

执行端要求：Tool/Child 必须先以 commandId 耐久去重再执行；相同 commandId 异载荷拒绝。Permit 在 L3 ExecutionGuard 调用安全端口原子校验/消费，并绑定原 commandId；消费返回的耐久授权回执允许同一命令查询/恢复，不能授权另一命令。安全服务不可用、Permit 无效或原受理不可确定则零新副作用。Tool 执行记录与 Permit 不共享事务时采用“先受理命令、再消费 Permit、最后执行”的可查询阶段记录，任何中间崩溃先查询，不重复签发动作。

### 21.7 租约、模型幂等与恢复决策

**FE-Q-005 的具体化。** 旁观者只读不领取执行资格。单机本地 Scheduler 使用 RunRegistry 的短时执行 claim（TTL 30 秒，每 10 秒续期）；每次更新按 ownerId/attemptId/fence 条件写，接管时原子增加 fence 并创建新 Attempt。此为本地崩溃识别与写入排他，不引入分布式租约服务。多 Worker/跨机扩展仍须单独部署档案与 ACR。SQLite 首版使用同机权威时钟；时钟回退或租约时间不可验证时停止新派发，不能延长旧执行权。租约超时只说明 Worker 不可信，不说明工具未执行。

claim 只用于提交/派发权限，不进入 Core 输入及 decisionDigest。恢复器在新 Attempt 下查询旧命令事实，沿用旧 commandId；使用当前 dispatch claim 调用执行端查询/恢复。对于已确认成功的旧结果，以新 recovery 事件纳入当前 Run，旧事件历史不可重写。此前未消费的旧 Attempt Inbox 项在接管事务中标记 superseded，并按来源权威重建其业务事实，禁止留下阻塞新 sequence 的缺口；消费位置推进与 superseded 收据同事务记录，不生成业务命令。

**FE-Q-006 的首版决定。** 不假设 Provider 提供幂等。InvokeModel 在 PENDING 可安全按同一 commandId 领取；一旦 CLAIMED 且发送情况不确定，或已 ACCEPTED 后结果丢失，标记 UNKNOWN 并挂起核对，不自动重新请求模型。已验证完整最终文本可完成 Run，确定未执行或无法恢复有效完整结果则失败；用户重试须另建 Run。所有自动模型调用重试次数为 0；HTTP 传输 Adapter 也不得隐藏自动重发。未来启用 Provider key/checkpoint 必须修改契约版本、补对应查询测试，不作为首版默认能力。

首版工具已知失败同样不自动重试，UNKNOWN 必须挂起核对；图 E05 中“允许重试”分支在本版本恒为否。只允许状态读取、提交查询等无新副作用的有界重试。Ask 不算失败重试，审批完成后重新 RequestPermission 是新事件推进；原 Proposal 和工具用量不改变。

### 21.8 端口数据与安全职责分配

| 端口门面 | 请求与返回 | 权威提供方 / 必须检查 |
|---|---|---|
| SnapshotLoader | (runId,eventId) → AdvanceInput 的 run/session/event/priorReceipt；context 初始可空 | RunRegistry 提供同一读取视图；Context 通过 sourceRunVersion 绑定后再合并 |
| ContextAssemblyPort | FrozenBindings、transcriptHeadRef、RunBudget、sourceRunVersion → ContextFrame | ContextEngine 校验资源作用域与输入 token 上限，不修改 Session |
| ModelInvocationPort | EngineCommand(InvokeModel)+dispatchClaim → 耐久受理/规范化模型事件或 UNKNOWN | L2 Adapter 隔离 Provider；不接受 tenant/user/token 裸载荷 |
| PermissionDecisionPort | EngineCommand(RequestPermission)+冻结执行信封 → PermissionResolved | L1 PEP 调用 PDP；PDP 决策与审批事实权威；未知响应拒绝 |
| ToolDispatchPort | EngineCommand(DispatchTool)+dispatchClaim → 耐久受理及 ToolObserved | L3 ExecutionGuard 消费 Permit，Tool Runtime 执行和去重；拒绝越权/旧 claim |
| ChildRunPort | EngineCommand(CreateChildRun)+dispatchClaim → 稳定 childId 及 ChildCompleted | 子集授权与预算深度验证、受理去重；不绕过 Scheduler |
| StateCommitPort | CommitRequest、查询键 → CommitResult/CommitQuery/CommandRecord | RunRegistry；Repository 仅实现机制，不拥有迁移规则 |
| ObservabilityPort | code、阶段、耗时、计数、受限相关引用 → 非阻塞受理/丢弃计数 | 调用方；禁止 Prompt/参数/digest 直接作为指标标签 |

这些是对现有边界能力的细化门面，不增加新的聚合数据所有者。跨边界 RequestMetadata 沿用 traceparent/deadlineUtc，适配层在边界转换为本章 operation 毫秒字段。Core 只使用不透明 executionEnvelopeRef，不导入租户、用户或 RBAC 模型。现有旧短时 Grant 明确不等于耐久一次性 Permit，不能直接用于此设计的 DispatchTool 上线验收，也不得复制进 Session 充当权限状态。

### 21.8.1 五角色评审后的补充协议

**Context失败唯一推进入口。** Coordinator 对 ContextAssemblyPort 最多执行3次有界查询；永久失败或用尽查询预算后，保留原 AdvanceRequested，传 context=null 与显式 contextFailure（unavailable/limit_exceeded）调用 Core。context 与 contextFailure 不能同时非空，failure 只在 Ready、无 pendingActions 的正常路径有效；取消/超时优先。错误事实纳入 inputDigest 和 T2 消费回执，Coordinator 不自行修改 FlowPosition，也不另加一个被队首挡住的失败事件。T2 从 CommitRequest.input 复核 inputDigest、冻结绑定、next可写字段与预算，保存可审计输入引用；不接受任意 patch。

**转录与恢复。** 每个 ModelCompleted 必须提供 assistantTurnRef，内容为完整规范化助手消息，保留有序文本块、Proposal及其工具描述/参数引用或 Child 请求。answer/tools/child 三个分支都追加 kind=assistant 的 TranscriptEntry。ToolObserved 成功追加 kind=tool，proposalId必填；ChildCompleted成功追加kind=child，childId必填；其余对应引用为null，commandId匹配原命令。Context按条目顺序重建完整轮次，不能只拼接裸工具结果。T2同事务追加条目，transcriptHeadRef=`tr:`+SHA256(FE-C14N-1({previousHead,entries}))；(runId,eventId,kind,proposalId,childId)唯一，不删除历史Proposal事实。

**核对事实匹配。** EffectReconciled必须精确匹配Suspended.reason的类型、目标commandId、incidentRef，causationId=目标commandId且source=recovery。tool_unknown仅接受tool_completed/not_applied/failed；model_unknown仅接受model_completed/not_applied/failed。completed必须有经可信执行回执验证的非空有界resultRef；其余resultRef=null。任何失配返回FLOW_EVENT_CONFLICT，不解除挂起。工具核对追加tool转录并保留原Proposal因果，模型核对仅接受完整最终文本并追加assistant转录，不能恢复半包工具计划。

**执行首次启动线性化。** Tool执行端持久阶段为 RECEIVED → AUTHORIZED → STARTED → SUCCEEDED/FAILED/UNKNOWN；每个commandId唯一。Permit消费结果只能把同命令置为AUTHORIZED，不能直接执行。首次启动必须调用安全服务的authorizeStart(permitReceiptRef,commandId,actionDigest,executionEnvelopeRef,currentClaim)，重新检查当前claim的owner/attempt/fence及到期、Run取消状态、command/Run Deadline、Permit自身expiresAtMs、当前授权epoch、撤销及原消费绑定；服务不可用则不启动。返回绑定commandId的一次性startGrant，执行端在本地事务以CAS从AUTHORIZED到STARTED并保存startGrant；只有获胜者可调用Provider，其余只查询。STARTED即使没有结果也不能重新执行；崩溃后先核对，无法确认则UNKNOWN。authorizeStart线性化之前已失效的Permit不能凭旧消费回执获得新执行机会。authorizeStart是权限生效线性化点：此前撤销阻止启动，此后撤销视为在途取消，系统不宣称跨外部服务瞬间撤回已生效动作。

**终态incident处置。** 独立IncidentStore保存{incidentRef,runId,commandId,kind,version,status:open/resolved,knownEffect,evidenceRef,resolvedAtMs}；IncidentResolutionPort.resolve使用受控运维身份、expectedVersion和幂等resolutionId原子绑定可信证据。同ID异证据拒绝；无权访问原作用域拒绝。终态Run只更新incident和执行事实，不发送可重新推进的EffectReconciled。非终态核对事务写通知记录，由恢复器可靠投递匹配事件；重投幂等。关闭incident不改变Run终态，不授权重试；关闭后7天删除诊断材料，执行/幂等事实仍按30天保留规则。

**持续扫描与容量。** 每1秒扫描持久Ready/runnable标记、已到期非终态Run和PENDING命令，按runId游标每批256条；扫描/通知对同版本的wake和同截止时间的Deadline事件使用唯一键。启动先扫描再接受新派发；至少每5秒完成一次最多4096个活动Run的扫描。Deadline到期按冻结deadlineAtMs确保耐久终止事件，原命令派发复核截止时间，不等待队列处理才停止。DeferredReceipt默认每Run128条，单条64KiB、TTL最长1小时；超期进入隔离记录并报告，不静默变成成功消费。

首版本地持久总配额10GiB，1GiB为状态/取消/恢复保留；活跃Run上限4096，单Run转录Artifact累计32MiB，普通Journal/Deferred/Outbox总量计入配额。使用达80%告警，90%停止新Run与新业务派发，仅允许清理/核对/已知结果写入；保留区也耗尽则失败关闭并报告存储不可用，不能丢弃已受理事实。每小时GC已到期终态且无open incident的记录；非终态/open incident不删，容量压力通过拒绝新工作处理。磁盘可用字节小于1GiB亦触发同一保护，不能只依赖逻辑配额。

### 21.9 首版限额、可观测性与验收数据

以下是首版本地档案的设计目标，不是测量结果。配置启动校验并冻结到 configVersion；新配置仅对新 Run 生效，活动 Run 不热改预算或限额。

| 配置 / 指标 | 默认与硬范围 | 超限或失败处理 |
|---|---|---|
| maxConcurrentRuns / maxQueueDepth | 4（1—16）/ 256（1—4096） | 拒绝新增提示但保留耐久可运行事实；入口满载稳定返回 RESOURCE_EXHAUSTED |
| maxTurns / maxToolCalls / maxChildren / maxDepth | 16（1—64）/ 32（0—128）/ 2（0—8）/ 1（0—2） | 动作前检查并预留，耗尽停止新动作 |
| maxContextBytes / maxInputTokens / outputReserveTokens | 1 MiB（1—4 MiB）/ 32768（1—131072）/ 4096（0—32768） | 输入加预留不超过已冻结模型窗口；否则不派发 |
| maxOutputBytes / proposalsPerTurn | 256 KiB（1—1 MiB）/ 最多 8 | Adapter 提前限流，Core 重验引用大小，非法输出失败 |
| 事件 JSON / 命令 JSON / 输入 JSON | 64 KiB / 64 KiB / 2 MiB | 入口按 UTF-8 实际字节拒绝；正文用 Artifact 引用 |
| Run Deadline / modelCallTimeout / toolCallTimeout | 10 分钟 / 120 秒 / 60 秒；均收敛到 Run 剩余时间 | 不自动重试模型/工具；不确定结果记 UNKNOWN |
| commitRetryLimit / queryRetryLimit | 3 / 3（均 0—5）；100/200/400ms 退避 | 超预算停本次尝试，持久事实恢复；不得无界重算 |
| cleanupTimeout / claimTTL / claimRenew | 30 秒 / 30 秒 / 10 秒 | 到期记录未完成清理；旧 claim 不可派发 |
| telemetryBufferSize / retention | 1024 条且 1 MiB / 非关键记录 60 秒 | 满或过期丢弃计数；安全审计不可丢弃 |
| Core CPU P99 / 单次额外内存 | 10ms / 8 MiB，本地 Node 22+ 单进程参考档案 | 固定 2 MiB 最大输入、1 万次推进基准；超标阻断性能验收，记录机器/版本 |
| 恢复扫描目标 | State 可用后 5 秒内扫描并识别最多 4096 条 Run 的可恢复项 | 不等于 5 秒内完成全部外部动作；超标告警与性能验收失败 |

日志字段白名单：event kind、error code、phase、版本、计数、durationMs；run/attempt/command 引用仅进入受访问控制的诊断日志，不作为 metrics 标签。指标标签只允许 phase、result、code 的封闭集合。告警：UNKNOWN 新增任一条立即高优先级处置；PEP 旁路尝试任一条立即安全告警；5 分钟窗口至少 100 次提交且冲突率 >20% 告警；队列占用 >80% 持续 60 秒告警；遥测丢弃率 >1% 持续 5 分钟告警。必要安全审计存储失败禁止新派发，普通遥测失败不阻塞。

诊断包默认只含脱敏元数据、契约/代码/configVersion、事件顺序、提交/派发阶段与错误码，不含 Artifact 正文、参数摘要或 Permit 内容；受控调试才加载专用合成回放数据。诊断包保留 7 天，权限跟随租户隔离的运维授权，不能靠不透明 ID 代替授权。
