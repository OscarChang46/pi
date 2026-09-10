---
doc_id: SYS-CON-004
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: CD-1组件开发补充契约与首版本地一致性协议
parent: SYS-DES-001
interfaces: [BND-L1-001, BND-L12-001, BND-SEC-001, BND-L13-001, BND-L34-001, BND-MEM-001, BND-INF-001, BND-OPS-001, BND-EXT-001, BND-MOD-001]
diagrams: []
supersedes: []
---

# CD-1：组件开发补充契约 v1.0.0

> [!IMPORTANT]
> **状态：候选。** 本文关联 ACR-2026-0011，不是已发布 Schema，也不代表架构已经批准或代码已经实现。

FE-SYS-1 已将系统级 FlowEngine 契约迁移到[系统协议索引](../layers/l1-control/components/flow-engine/protocol-index.md)。本文提及的 FE-CON-1 只约束 ReAct 业务适配；资源分配组件及其操作已删除，不再是框架开发要求。

## 如何阅读与引用

本文只维护跨组件开发所需的字段、操作、错误和本地一致性协议。边界方向、组件行为和专项详细协议仍由各自的权威文档维护，本文通过链接引用，不复制第二套正文。

### 规范表达

- `必须`、`禁止`：强制契约；实现与测试必须满足。
- `应`：默认要求；偏离时必须记录理由和影响。
- `可`：允许的实现选择，不构成兼容承诺。
- `{...}`：完整字段规格；`|`：封闭联合；`[]`：有序数组；`null`：必须显式编码。
- 文中的结构使用与语言无关的契约记法，不是可直接编译的 TypeScript。

### 权威来源索引

| 主题 | 权威来源 | 本文职责 |
|---|---|---|
| 系统与层边界 | [总设计](../agent-kernel-design.md)、各 BND 文档 | 不改变依赖方向，只细化字段与操作 |
| FlowEngine 系统协议 | [FE-SYS-1 协议索引](../layers/l1-control/components/flow-engine/protocol-index.md) | 仅引用公共类型和事务语义 |
| FlowEngine ReAct 适配 | [FlowEngine 组件设计](../layers/l1-control/components/flow-engine/README.md) | 约束业务适配使用的 FE-CON-1 类型 |
| Context 组装 | [CTX-CON-1](context-assembly-contract.md) | 引用 AssemblyBasis、AssemblyCandidate 等唯一类型 |
| Security 判定内部协议 | [SEC-DEC-1](../layers/security-plane/contracts/security-decision-contract.md) | 维护公开 DTO 与操作，内部求值和恢复由专项契约细化 |
| L3 工具执行内部协议 | [L3 详细契约](l3-tool-runtime-detail.md) | 维护公共工具调用字段与操作 |
| 范围外执行、基础设施、运维 | [L4 依赖](../layers/l4-execution-runtime/kernel-dependencies.md)、[Infrastructure 依赖](../layers/infrastructure-plane/kernel-dependencies.md)、[Operations 依赖](../layers/operations-plane/kernel-dependencies.md) | 只声明 Kernel 所需依赖，不设计外部实现 |
| 候选变更与范围 | [ACR-2026-0011](../../governance/changes/ACR-2026-0011-component-development-designs.md) | 记录本轮候选范围和决策状态 |

### 章节导航

1. [公共类型](#公共类型)
2. [错误、幂等与容量](#错误幂等与容量)
3. [协作与事务](#协作与事务)
4. [Kernel 观测责任](#kernel观测责任)
5. [分组件字段与操作](#分组件字段与操作)
6. [授权闭环](#授权闭环r1替代首轮工具专用decisionrequest)
7. [Child 业务输入与 Session 协调要求](#child业务输入与session协调要求)
8. [Session 与 Context 冻结闭环](#session与context冻结闭环r1)
9. [扫描闭环](#扫描闭环r1)
10. [UNKNOWN 核对闭环](#unknown核对闭环r1)
11. [必要审计完成点](#必要审计完成点r1)

## 公共类型

除标注为进程内回调或流的类型外，所有类型使用 FE-C14N-1 JSON 子集：

- 拒绝未知字段、重复键、孤立代理项、浮点数和非安全整数；
- 最大嵌套深度为 32；
- 文本必须是合法 Unicode；线格式统一使用 UTF-8。

### 标量与外部类型

| 类型 | 语义 |
|---|---|
| `Ref` / `Digest` | 沿用 FE 定义 |
| `Count` | 非负安全整数 |
| `Millis` | 非负 UTC 毫秒 |
| `Bool` | JSON boolean |
| `Version` | 首版固定为 `1.0.0` |
| `Text` | 合法 Unicode，UTF-8 编码不超过 64 KiB |
| `Json` | 满足上限的 JSON 子集；不得替代明确 Schema |
| `Artifact` | FE `ArtifactRef`；读取仍须授权，摘要不构成访问权 |
| `RunBudget` / `FrozenBindings` / `ExecutionClaim` / `RunSnapshot` | 使用 [FE-CON-1](flow-engine-contract-v1.md) 的精确定义，禁止同名简化副本 |

### 请求与错误类型

```text
RequestMeta = {
  protocolVersion: Version,
  requestId: Ref,
  correlationId: Ref,
  traceparent: Text,
  deadlineAtMs: Millis
}

CommandMeta = RequestMeta + {
  commandId: Ref,
  idempotencyKey: Ref
}

Error = {
  code: ErrorCode,
  retryable: Bool,
  detailsRef: Ref|null
}
```

- 旧边界的 `deadlineUtc` 由 Adapter 严格转换为 `deadlineAtMs`。
- 首版 `commandId = idempotencyKey`；同一操作重投时两者不得改变。FE 命令身份沿用 FE 公式。
- `detailsRef` 只允许引用脱敏信息，禁止透传原始异常。
- `TrustedScope` 是 Host 建立的进程内可信上下文，包含 `executionEnvelopeRef` 与 `ScopedAdapter` 能力。它只可在网络认证后创建，不能由 JSON 自行构造。

### 执行与分页类型

```text
ExecutionReceipt = {
  commandId: Ref,
  receiptRef: Ref,
  status: accepted | completed | unknown
}

ExecutionQuery = {
  state: absent | pending | accepted | running | completed
       | failed | unknown | gone,
  result: ExecutionResult|null
}

CancelExecutionResult = {
  commandId: Ref,
  state: requested | stopped | unknown
}

CancelReceipt = {
  runId: Ref,
  cancelEpoch: Count,
  terminal: Bool
}

CommitReceipt = {
  transactionId: Ref,
  version: Count
}

EventPage = {
  events: RuntimeEvent[],
  nextSequence: Count,
  earliestSequence: Count,
  hasMore: Bool
}

DescriptorPage = {
  items: DefinitionVersion[],
  nextCursor: Ref|null
}

AuditPage = {
  events: AuditEvent[],
  nextSequence: Count,
  hasMore: Bool
}
```

- `ExecutionReceipt.accepted` 表示耐久受理；L2 由 L1 命令记录提供，L3 由 `ToolCall` 提供。
- `ExecutionQuery.completed` / `failed` 必须包含 `result`；其他状态必须为 `null`。查询操作本身不支持返回 `unknown`。
- `CancelExecutionResult.stopped` 必须有停止证据，不能根据 HTTP 成功推定。
- FE 的 `CommitRequest`、`CommitResult`、`CommitQuery` 和 `CommandRecord` 原样引用。
- `IngressEvent` 是移除 `sequence` 的 FE `RuntimeEvent`；T1 分配权威 Run 序号。L2 片段 `index` 不是 Run sequence。
- `EventPage.events` 按 sequence 升序；历史不足时返回 `GONE`。
- `DescriptorPage.nextCursor` 由服务生成，并绑定 Scope 和 filter 版本。

### 运维与流类型

| 类型 | 封闭值或规则 |
|---|---|
| `MetricPoint` | 映射 Operations `TelemetrySignal`：gauge 保留 payload 全部字段；counter 将 delta 累加为 value，并保留 name / component / sampledAtMs；operation 不进入快照 |
| `MetricName` | `queue_depth`、`active_runs`、`resource_used`、`durable_bytes`、`scan_lag_ms`、`open_incidents`、`conflict`、`commit`、`telemetry_drop`、`permission_bypass`、`effect_unknown`；各 kind 的合法子集见 [Operations 依赖](../layers/operations-plane/kernel-dependencies.md) |
| `ComponentCode` | [document-manifest.yaml](../document-manifest.yaml) 中的固定 ID；新增值必须变更契约 |
| `PhaseCode` | `validate`、`read`、`commit`、`dispatch`、`execute`、`recover`、`cleanup` |
| `ResultCode` | `ok`、`rejected`、`failed`、`unknown`、`dropped` |
| `HealthCode` | `state_unavailable`、`clock_untrusted`、`audit_unavailable`、`pdp_unavailable`、`runtime_unavailable`、`capacity_exhausted`、`storage_protected`、`exporter_degraded`、`isolation_unavailable` |
| `SecretPurpose` | `model`、`tool`、`sandbox` |
| `CandidateStatus` / `ApprovalState` / `ScopePhase` / `ProcessState` | 使用对应组件字段的封闭联合，禁止任意字符串 |
| `BoundedStream` / `AsyncStream` | 进程内异步迭代接口，必须提供 cancel 和容量上限；跨进程时转换为 Transport 帧 |

### 边界操作通则

所有边界操作都组合 `(meta, trustedScope, payload)`：

- 查询使用 `RequestMeta`，写操作使用 `CommandMeta`；
- 返回声明的成功值或 `Error`；
- 纯内部函数只接收冻结值，不读取实时时钟；
- `Method` 是本文操作的封闭完全限定名：`组件ID.operation`；
- `MethodPayload` 与 `MethodResult` 必须按操作静态绑定，禁止反射任意方法；
- 初始化和公开健康检查只返回粗粒度信息；其他读写、审批和管理操作必须具有对应 Scope 能力。

## 错误、幂等与容量

### 错误全集

```text
PROTOCOL_UNSUPPORTED     SCHEMA_INVALID          FRAME_LIMIT
ACCESS_DENIED            NOT_FOUND               GONE
IDEMPOTENCY_CONFLICT     VERSION_CONFLICT        STALE_SNAPSHOT
STALE_CLAIM              INVALID_STATE            SCOPE_MISMATCH
DIGEST_MISMATCH          BINDING_MISMATCH         EVENT_MISMATCH
SEQUENCE_GAP             PARSE_CONFLICT           NO_ROUTE
ROUTE_UNAVAILABLE        RUNTIME_UNAVAILABLE      CONTEXT_LIMIT
OUTPUT_LIMIT             RESOURCE_EXHAUSTED       DEADLINE_EXCEEDED
CANCELLED                DEPENDENCY_UNAVAILABLE   TRANSPORT_UNAVAILABLE
PERMISSION_UNAVAILABLE   ACTION_APPROVAL_REQUIRED PERMIT_EXPIRED
PERMIT_REVOKED           PERMIT_CONSUMED          AUDIT_UNAVAILABLE
CLOCK_UNTRUSTED          SECRET_UNAVAILABLE       ISOLATION_UNAVAILABLE
UNKNOWN                  INTERNAL
```

- 仅 `DEPENDENCY_UNAVAILABLE` 或 `TRANSPORT_UNAVAILABLE` 的只读查询可设置 `retryable=true`，其他错误均为 `false`。
- `VERSION_CONFLICT`：丢弃旧候选并重算，禁止原写重放。
- `UNKNOWN`：只能查询权威事实，禁止猜测或自动重放。
- Provider 的 `AUTH_FAILED`、`RATE_LIMITED` 等错误属于 `AdapterFault`，不得透传原始异常。

### 幂等与保留

- 写入唯一键：`(可信 scopeKey, 组件 ID, commandId)`。
- 载荷摘要：`H(操作名, 语义 payload)`；排除 trace、request 和当前查询截止时间。
- 重复回执检查先于 `expectedVersion` 检查；同键异载荷返回冲突。
- FE 命令身份不得改写。
- Run 相关回执至少保留到终态后 30 天；非终态 Run 或仍有 open incident 的记录不得删除。
- 其他聚合至少保留 30 天，且必须等活跃引用解除后才可删除。
- 过期 ID 保留不可重用墓碑；墓碑计入配额，配额耗尽时拒绝新工作。

### 首版容量档案

以下值引用 FE 21.8.1 / 21.9 的首版档案：

| 维度 | 默认值 | 硬上限或约束 |
|---|---:|---:|
| 并发执行 | 4 | 16 |
| 活动 Run | 4,096 | 4,096 |
| 提示队列 | 256 | 4,096 |
| 单 Run 模型轮数 | 16 | 16 |
| 单 Run 工具次数 | 32 | 32 |
| Child 数量 / 深度 | 2 / 1 | 2 / 1 |
| 上下文 | 1 MiB | 1 MiB |
| 输入 token + reserve | 32,768 + 4,096 | 固定档案 |
| 输出 | 256 KiB | 256 KiB |
| 单事件 / 命令 | 64 KiB | 64 KiB |
| Run / 模型 / 工具 / 清理超时 | 10 min / 120 s / 60 s / 30 s | 固定档案 |
| 读或提交确认重试 | 最多 3 次；100/200/400 ms | 模型与工具自动执行重试为 0 |

当 `now >= deadline` 时停止启动新业务；向下游传播的 deadline 只能缩短，不能延长。

Kernel需要基础设施提供统一容量快照、配额保护与引用保留保证；所需限额及依赖条件放在[Infrastructure依赖要求](../layers/infrastructure-plane/kernel-dependencies.md)，不在本轮设计具体存储/GC机制。

## 协作与事务

### 组件协作边界

`Host FlowCoordinator` 是装配职责，不是新的状态聚合：

1. 加载 Run 的冻结输入；
2. 组装 Context；
3. 调用 Core；
4. 完成 T2 提交后领取命令。

下游路由固定如下：

| 动作 | 调用路径 | 边界约束 |
|---|---|---|
| 模型 | 业务 Activity 适配 → L2 `AgentRuntime` → 公共 `AgentAdapterPort` | L2 只执行一个已提交模型步骤，不拥有第二套 ReAct 规则 |
| 权限 | L1 PEP → PDP | PDP 判定，L1 只协调 |
| 工具 | L1 → L3 Tool Runtime | L3 在实际执行点校验并消费 Permit |
| Child | L1 → SessionManager `SessionForkJoinPort` | SessionManager 拥有 Fork/Join 协调 |

SessionManager 内部 Coordinator 通过 `FlowRunCommandPort` 请求 FE 执行单个 Child Flow，并通过 event bus / inbox 消费终态。FE 不拥有 `JoinBarrier` 或 `Reducer`。FE 中的 `ModelInvocationPort` 只是概念门面，禁止将 Pi 私有 Port 导出到公共 contracts。

RunRegistry拥有T1/T2/claim；Scheduler决定何时调用。首版本地claim30秒/10秒续期，不引入跨机租约服务。

### RunRegistry 辅助操作

```text
ensureRunnable({
  runId: Ref,
  basisVersion: Count
}) -> {
  eventId: Ref|null
}

quarantineHead({
  runId: Ref,
  expectedVersion: Count,
  claim: ExecutionClaim,
  eventId: Ref,
  rejectionCode: ErrorCode
}) -> {
  version: Count
}

scan({
  cursor: Ref|null,
  limit: Count
}) -> {
  runIds: Ref[],
  nextCursor: Ref|null
}

resolveIncident({
  incidentRef: Ref,
  expectedVersion: Count,
  resolutionId: Ref,
  evidenceRef: Ref,
  knownEffect: Effect
}) -> {
  version: Count,
  status: resolved
}
```

- `ensureRunnable` 原子去重 wake。
- `quarantineHead` 复核拒绝证据后，原子完成隔离、游标前进和版本递增；不得产生业务命令。
- `scan.limit` 取值范围为 1–256。
- `resolveIncident` 只接受受控恢复身份与可信执行回执；冲突不得覆盖，终态 Run 不得改变。
- `Incident` 字段沿用 FE 21.8.1。

### 工具执行事务边界

```text
RECEIVED -> AUTHORIZED -> STARTED -> SUCCEEDED | FAILED | UNKNOWN
```

- `consume` 后必须调用 `authorizeStart`；只有赢得 `STARTED` CAS 的执行者可以调用 L4。
- Security 与 Tool 是独立聚合，分别提交；事务不得包围外部 I/O。
- 首版本地 `authorizeStart` 通过同一 SQLite 权威读取 Run 的取消状态、claim 与 Permit；事务只写安全授权和必要审计。
- 跨库或跨机实现必须另立 ACR，禁止读取旧缓存放行。
- `authorizeStart` 前发生的撤销或取消阻止启动；其后发生的取消属于在途取消。
- `STARTED` 后无法确认结果时进入 `UNKNOWN`；即使动作可能尚未发出，也禁止自动再次执行。

## Kernel观测责任

### 告警条件

| 条件 | 触发窗口 | 优先级 / 责任方 |
|---|---|---|
| 新增 `UNKNOWN` 或权限旁路 | 每 1 条立即触发 | 高；组件实施负责人 / 安全负责人 |
| 队列使用率 > 80% | 持续 60 秒 | 存储运维负责人 |
| 5 分钟内至少 100 次提交且冲突率 > 20% | 5 分钟 | 组件实施负责人 |
| 遥测丢弃率 > 1% | 持续 5 分钟 | 运维负责人 |
| 扫描滞后 > 5 秒 | 持续 10 秒 | 组件实施负责人 |

通知渠道故障时仍必须保留 `Incident`；安全阻断不得依赖告警是否送达。

### 保留与脱敏

| 数据 | 保留要求 |
|---|---|
| 普通日志 | 7 天，且最多 50 MiB |
| 内存遥测 | 60 秒 / 1,024 条 / 1 MiB，以先达到者为准 |
| 诊断记录 | 7 天 |
| 安全与幂等记录 | 至少 30 天，并随活跃引用延长 |

诊断数据只允许包含版本、阶段、计数、错误和受控 Ref；禁止包含 Prompt、参数、digest、Permit 或路径。指标禁止使用动态 ID 标签。

## 分组件字段与操作

<a id="protocol-facade"></a>

### L1-CMP-001 protocol-facade

> **分类：** 契约门面  
> **详细设计：** [Protocol Facade 组件设计](../layers/l1-control/components/protocol-facade.md)

#### 数据契约

```text
ConnectionState = {
  connectionId: Ref,
  version: Version,
  capabilities: Ref[],
  maxFrameBytes: Count,
  lastAck: Count
}

Lifecycle = NEW | READY | DRAINING | CLOSED
```

`ConnectionState` 不持久化。

#### 操作契约

```text
initialize({
  versions: Version[],
  capabilities: Ref[],
  maxFrameBytes: Count
}) -> {
  version: Version,
  capabilities: Ref[],
  maxFrameBytes: Count
}

call({
  method: Method,
  payload: MethodPayload
}) -> MethodResult
```

`Method` 与载荷逐项复用 Gateway、审批、健康和生命周期操作，禁止任意字符串反射。服务端决定初始状态；`issue` / `submit` 请求不得自选已批准或已生效状态。

<a id="agent-system-gateway"></a>

### L1-CMP-002 agent-system-gateway

> **分类：** 契约门面  
> **详细设计：** [Agent System Gateway 组件设计](../layers/l1-control/components/agent-system-gateway.md)

#### 数据契约

```text
StartIntent = {
  agentId: Ref,
  agentVersion: Count,
  sessionId: Ref,
  sessionVersion: Count,
  goalRef: Artifact,
  routeProposalRef: Ref,
  budget: RunBudget,
  deadlineAtMs: Millis
}

AdmissionReceipt = {
  runId: Ref,
  version: Count,
  acceptedAtMs: Millis
}
```

Gateway 不持久化私有事务。

#### 操作契约

```text
startRun(StartIntent) -> AdmissionReceipt
getRun({runId: Ref}) -> RunSnapshot
cancelRun({runId: Ref}) -> {
  runId: Ref,
  cancelEpoch: Count,
  terminal: Bool
}
readRunEvents({
  runId: Ref,
  afterSequence: Count,
  limit: Count
}) -> EventPage
listAgents({
  cursor: Ref|null,
  limit: Count
}) -> DescriptorPage
```

服务端决定初始状态；`issue` / `submit` 请求不得自选已批准或已生效状态。

<a id="agent-registry"></a>

### L1-CMP-003 agent-registry

> **分类：** 独立组件  
> **详细设计：** [Agent Registry 组件设计](../layers/l1-control/components/agent-registry.md)

#### 数据契约

```text
DefinitionVersion = {
  agentId: Ref,
  version: Count,
  descriptorRef: Artifact,
  capabilities: Ref[],
  personaRef: Artifact,
  constraintRef: Ref,
  publishedAtMs: Millis
}

DefinitionHead = {
  agentId: Ref,
  version: Count,
  state: active | retired
}
```

#### 操作契约

```text
publish({
  definition: DefinitionVersion,
  expectedVersion: Count
}) -> {
  agentId: Ref,
  version: Count
}
retire({agentId: Ref, expectedVersion: Count}) -> DefinitionHead
get({agentId: Ref, version: Count|null}) -> DefinitionVersion
list({
  capabilities: Ref[],
  cursor: Ref|null,
  limit: Count
}) -> DescriptorPage
```

服务端决定初始状态；`issue` / `submit` 请求不得自选已批准或已生效状态。

<a id="capability-router"></a>

### L1-CMP-004 capability-router

> **分类：** 独立组件  
> **详细设计：** [Capability Router 组件设计](../layers/l1-control/components/capability-router.md)

#### 数据契约

```text
RouteInput = {
  requirements: Ref[],
  definitionVersions: Ref[],
  capabilitySnapshotRef: Ref,
  envelopeRef: Ref
}

RouteProposal = {
  proposalId: Ref,
  candidates: RouteCandidate[],
  expiresAtMs: Millis
}

RouteCandidate = {
  agentId: Ref,
  agentVersion: Count,
  adapterBindingRef: Ref,
  satisfied: Ref[],
  preferenceRank: Count
}
```

#### 操作契约

```text
propose(RouteInput) -> RouteProposal
```

Gateway 调用 `propose`，Router 读取 `AgentRegistryQueryPort` 与 `AdapterCapabilityPort`。RunRegistry 只验证并冻结首个候选，不执行另一套排序。服务端决定初始状态；`issue` / `submit` 请求不得自选已批准或已生效状态。

<a id="session-manager"></a>

### L1-CMP-005 session-manager

> **分类：** 独立组件  
> **详细设计：** [Session Manager 组件设计](../layers/l1-control/components/session-manager.md)  
> **功能实现：** [Root Session](../layers/l1-control/components/session-manager/sr-01-root-session-lifecycle.md) / [单活 Run](../layers/l1-control/components/session-manager/sr-02-single-active-run.md) / [Sub-session Fork/Join](../layers/l1-control/components/session-manager/sr-03-subsession-fork-join.md)  
> **状态机：** [Join Barrier 状态机](../layers/l1-control/components/session-manager/join-barrier-state-machine.md)

#### Session 数据契约

```text
ActiveRunBindingState = RESERVED | SUBMIT_UNKNOWN | ACTIVE | RELEASING

ActiveRunBinding = {
  runId: Ref,
  bindingVersion: Count,
  state: ActiveRunBindingState,
  reserveCommandId: Ref,
  admissionCommandId: Ref,
  payloadDigest: Digest,
  admissionReceiptRef: Ref|null,
  terminalReceiptRef: Ref|null,
  stateVersion: Count
}

SessionRecord = {
  sessionId: Ref,
  version: Count,
  agentId: Ref,
  state: active | archived,
  parent: {sessionId: Ref, version: Count}|null,
  headRef: Ref,
  activeRunBinding: ActiveRunBinding|null
}

SessionDelta = {
  deltaId: Ref,
  sourceRunId: Ref,
  sourceBindingVersion: Count,
  slice: TranscriptSlice
}

TranscriptSlice = {
  firstSequence: Count,
  lastSequence: Count,
  sourceHeadRef: Ref,
  commitIds: Ref[],
  turns: HistoryTurn[]
}

HistoryTurn = {
  modelCommandId: Ref,
  assistant: TranscriptEntry,
  results: TranscriptEntry[]
}
```

`TranscriptEntry` 复用 FE 定义；`SessionSnapshot` 沿用 FE-CON-1。`activeRunBinding` 基数固定为 `0..1`，不存在 `runIds`、`pendingRuns` 或 `maxRunsPerSession`。`SessionRecord`、`SessionSnapshot` 和 `SessionDelta` 均禁止增加 Run 权威状态、Grant、Permit、策略快照、权限集合、授权 epoch 或 permission ceiling 字段。

#### Sub-session 数据契约

```text
ChildSpec = {
  memberId: Ref,
  ordinal: Count,
  childSessionId: Ref,
  childRunId: Ref,
  agentRef: Ref,
  inputRef: Artifact,
  childExecutionEnvelopeRef: Ref,
  parentContextSlice: ParentContextSliceSpec
}

JoinPolicy =
  ALL_SUCCESS
  | {kind: WAIT_ALL, minSuccesses: Count, includeFailures: Bool}
  | {kind: QUORUM, minSuccesses: Count, cancelRemainder: Bool}

ReducerSpec = {ref: Ref, version: Version}

ForkSpec = {
  groupId: Ref,
  parentSessionId: Ref,
  parentSessionVersion: Count,
  parentRunId: Ref,
  children: ChildSpec[],
  joinPolicy: JoinPolicy,
  reducer: ReducerSpec,
  deadlineAtMs: Millis
}

ForkReceipt = {
  groupId: Ref,
  state: PREPARING,
  version: Count,
  memberCount: Count
}

ChildTerminalEvent = {
  eventId: Ref,
  groupId: Ref,
  childRunId: Ref,
  runVersion: Count,
  outcome: SUCCEEDED | FAILED | TIMED_OUT | CANCELLED | UNKNOWN,
  resultRef: Artifact|null,
  errorRef: Ref|null
}

BarrierState =
  PREPARING | SCATTERING | WAITING | REDUCE_READY | REDUCING
  | FAILURE_READY | FAILURE_BUILDING | PARENT_COMMIT_READY
  | WAKE_PENDING | CANCEL_PENDING | COMPLETED | FAILED | CANCELLED
  | SUSPENDED_UNKNOWN | SUSPENDED_CONFLICT

JoinDecisionKind = REDUCE | FAIL | CANCEL
ParentOutcomeKind = SUCCESS | FAILURE | CANCELLED
GroupCleanupState = NOT_REQUIRED | CANCEL_REQUESTED | CANCELLING | SETTLED | UNKNOWN

BarrierSuspension = {
  suspendedFromState: BarrierState,
  blockingUnknownCount: Count,
  suspensionSetDigest: Digest,
  incidentSetRef: Ref,
  observedAtMs: Millis
}

JoinGroupView = {
  groupId: Ref,
  state: BarrierState,
  version: Count,
  total: Count,
  succeeded: Count,
  failed: Count,
  timedOut: Count,
  cancelled: Count,
  pending: Count,
  decisionKind: JoinDecisionKind|null,
  outcomeKind: ParentOutcomeKind|null,
  cleanupState: GroupCleanupState,
  reductionRef: Ref|null,
  outcomeRef: Artifact|null,
  parentCommitRef: Ref|null,
  wakeReceiptRef: Ref|null,
  suspension: BarrierSuspension|null
}
```

每个 `UNKNOWN` 的完整命令身份由 `JoinRepository` 私有 `join_unknown_effect` 行保存。`Barrier` / `JoinGroupView` 只暴露阻塞数量和集合摘要，防止多个 Child 的未知结果互相覆盖。

`childExecutionEnvelopeRef` 只引用 Security Plane 的 Child 授权状态，不内嵌权限内容。`ParentContextSliceSpec` 与 `TokenAccounting` 的唯一完整定义在 [CTX-CON-1](context-assembly-contract.md)。

#### Child 终态规范化

`ChildTerminalEvent` 是协调层旧名称，禁止将 RunRegistry 原始终态直接交给 Barrier。规范输入收紧为：

```text
ChildRunFinalizedEvent = ChildTerminalEvent + {
  sessionBindingVersion: Count,
  releaseReceiptRef: Ref
}
```

Run 来源的成功或失败事件必须依次完成：

1. SessionManager 匹配当前 `runId + bindingVersion`；
2. 完成 Child Session finalization；
3. 取得 release 回执；
4. 调用 `acceptChildTerminal`。

下次代码 Schema 落地时，方法参数直接使用 `ChildRunFinalizedEvent`。deadline / cancel 由 Barrier 本地事件产生，不得伪造 Child 成功结果。

#### 外部安全引用

<a id="security-evidence-refs"></a>

```text
SecurityEvidenceRefs = {
  executionEnvelopeRef: Ref,
  decisionCommandId: Ref,
  permitRef: Ref,
  permitReceiptRef: Ref,
  startGrantRef: Ref,
  bindingDigest: Digest
}
```

`SecurityEvidenceRefs` 只允许由 Coordinator 在 `PermissionDecisionPort.decide`、`PermitValidationPort.consume` 和 `authorizeStart` 成功后组合。它可保存于 `JoinMember` 或命令回执，但不得进入 `AgentSession` 聚合。Ref 查询仍需 `TrustedScope`；任何 Ref 都不构成 bearer 授权。

#### Session 操作契约

```text
SessionAnchor = {
  sessionId: Ref,
  version: Count,
  headRef: Ref
}

SessionCreationIntent = {
  logicalKey: Ref,
  agentDefinitionRef: Ref,
  contextPolicyRef: Ref,
  parent: SessionAnchor|null
}

SessionLookupResult =
  {state: found, anchor: SessionAnchor}
  | {state: absent}

EnsureSessionCommand = {
  commandId: Ref,
  intent: SessionCreationIntent
}

EnsureSessionResult = {
  anchor: SessionAnchor,
  created: Bool
}

SessionQueryPort.lookup({logicalKey: Ref}) -> SessionLookupResult
SessionCommandPort.ensure(EnsureSessionCommand) -> EnsureSessionResult
append({sessionId: Ref, expectedVersion: Count, delta: SessionDelta}) -> SessionRecord
branch({
  parentId: Ref,
  parentVersion: Count,
  childId: Ref,
  securityEvidence: SecurityEvidenceRefs
}) -> SessionRecord
archive({sessionId: Ref, expectedVersion: Count}) -> SessionRecord
snapshot({sessionId: Ref, version: Count}) -> SessionSnapshot

SessionRunCommandPort.reserveRun({
  sessionId: Ref,
  expectedSessionVersion: Count,
  runId: Ref,
  commandId: Ref,
  payloadDigest: Digest
}) -> RunBindingReceipt

acceptAdmission({
  sessionId: Ref,
  runId: Ref,
  bindingVersion: Count,
  admissionReceiptRef: Ref,
  outcome: CONFIRMED | REJECTED | UNKNOWN
}) -> RunBindingReceipt

acceptTerminal({
  sessionId: Ref,
  runId: Ref,
  bindingVersion: Count,
  terminalReceiptRef: Ref
}) -> RunBindingReceipt

finalizeRelease({
  sessionId: Ref,
  runId: Ref,
  bindingVersion: Count,
  commandId: Ref
}) -> SessionRecord
```

- `lookup` 是纯读；`absent` 不生成 Session ID、回执或其他持久事实。
- `ensure` 只接受 `parent=null` 的 Root 意图。Session ID 由 SessionManager 在命令提交时生成，调用方不得预先指定。
- `ensure` 保存 `commandId + payloadDigest + 原始 EnsureSessionResult`；同命令同载荷重放返回原结果，同命令异载荷返回 `IDEMPOTENCY_CONFLICT`。
- 同一 `(scopeKey,logicalKey)` 只绑定一个 Root。竞争失败的命令返回赢家锚点及 `created=false`；调用方必须丢弃空历史候选并用 `{kind:existing,anchor}` 重新组装。
- 不同 Run 占用非空绑定时返回 `SESSION_RUN_ACTIVE`。
- `UNKNOWN` 不释放绑定。
- `archive` 要求绑定为空。
- `branch.securityEvidence` 只供可信 Coordinator 进程内调用；外部 Client 或 JSON 不得构造。

#### Fork / Join 操作契约

```text
SessionForkJoinPort.fork(ForkSpec) -> ForkReceipt
cancelGroup({groupId: Ref, expectedVersion: Count, reason: Ref}) -> JoinGroupView
getGroup({groupId: Ref}) -> JoinGroupView

JoinRecoveryPort.reconcileUnknown({
  groupId: Ref,
  unknownCommandId: Ref
}) -> JoinGroupView

resolveConflict({
  groupId: Ref,
  resolutionId: Ref,
  mode: RETRY_APPEND | ABANDON_NO_WAKE,
  parentExpectedVersion: Count|null,
  evidenceRef: Ref
}) -> JoinGroupView
```

`JoinRecoveryPort.reconcileUnknown` 只查询原外部命令。`resolveConflict` 只供受信恢复主体调用，并必须写审计。`acceptChildTerminal(ChildRunFinalizedEvent)` 只对可信 event-bus adapter 开放。服务端决定初始状态；`issue` / `submit` 请求不得自选已批准或已生效状态。

<a id="run-registry"></a>

### L1-CMP-006 run-registry

> **分类：** 独立组件  
> **详细设计：** [Run Registry 组件设计](../layers/l1-control/components/run-registry.md)

#### 数据契约

直接复用 FE-CON-1 的 `RunSnapshot`、`AdvanceInput`、`AdvanceDecision`、`ExecutionClaim` 和 `CommandRecord`。

```text
SessionRunBindingRef = {
  sessionId: Ref,
  runId: Ref,
  bindingVersion: Count,
  bindingReceiptRef: Ref
}
```

绑定 Session 的 `StartIntent` 必须携带该引用，且两处 `runId` 必须完全一致。附表包括 `Inbox`、`DeferredReceipt`、`CommitReceipt`、`Outbox`、`Transcript`、`LateFact`、`Incident` 和 `AdmissionIndex`。主键均包含授权存储的 `scopeKey` 与 `runId`；内部 `scopeKey` 由 `ScopedRepository` 注入，不进入 Core。

#### 操作契约

```text
admit(StartIntent) -> AdmissionReceipt
admitEvent({event: IngressEvent}) -> {
  eventId: Ref,
  sequence: Count|null,
  status: admitted | deferred | duplicate | late
}
load({runId: Ref}) -> AdvanceInput
commit(CommitRequest) -> CommitResult
claim({runId: Ref, ownerId: Ref}) -> ExecutionClaim
renew({runId: Ref, claim: ExecutionClaim}) -> ExecutionClaim
takeover({runId: Ref, expectedFence: Count, ownerId: Ref}) -> ExecutionClaim
cancel({runId: Ref}) -> CancelReceipt
```

`queryCommit` / `queryCommand` 沿用 FE-CON-1；`ensureRunnable`、`quarantineHead`、`scan` 和 `resolveIncident` 见[共同事务协议](#runregistry-辅助操作)。`admit` 不创建或抢占 Session 绑定。缺失、旧代次或异 `runId` 的 `SessionRunBindingRef` 必须失败关闭。终态事件回传同一 `bindingVersion`，由 SessionManager 异步释放。服务端决定初始状态。

<a id="run-scheduler"></a>

### L1-CMP-007 run-scheduler

> **分类：** 独立组件  
> **详细设计：** [Run Scheduler 组件设计](../layers/l1-control/components/run-scheduler.md)

#### 数据契约

```text
WakeHint = {runId: Ref, basisVersion: Count}
DispatchTicket = {
  runId: Ref,
  claim: ExecutionClaim,
  resourceHandle: Ref,
  runtimeRef: Ref
}
```

只有队列、去重 set 和游标驻留内存；claim 的权威状态在 RunRegistry。

#### 操作契约

```text
notify({runId: Ref, basisVersion: Count}) -> {queued: Bool}
tick({nowMs: Millis}) -> {scanned: Count, queued: Count}
drain({deadlineAtMs: Millis}) -> {remaining: Count}
```

组件调用 `RunQuery` / `RunExecution`、`ExecutionResource` 和 `RuntimeDispatch` Port。服务端决定初始状态。

<a id="context-engine"></a>

### L1-CMP-009 context-engine

> **分类：** 独立组件  
> **详细设计：** [Context Engine 组件设计](../layers/l1-control/components/context-engine.md)  
> **专项契约：** [CTX-CON-1](context-assembly-contract.md)

#### 数据契约

```text
MemorySource = {
  spaceId: Ref,
  spaceVersion: Count,
  queryRef: Artifact,
  indexVersion: Ref,
  algorithmVersion: Ref,
  epoch: Count,
  required: Bool
}
```

`MemorySource` 由 CD-1 拥有。新组装接口的 `SessionInput`、`AssemblyBasis`、`AssemblyCandidate`、`ContextPayload`、`AssemblyTrace` 和 `TokenAccounting` 由 CTX-CON-1 唯一定义。本文不再复制 `ContextRequest` / `AssemblyReceipt`，也不得把新候选当成旧 `ContextFrame`。

#### 操作契约

```text
ContextPort.assemble(
  RequestMeta,
  TrustedScope,
  AssemblyBasis
) -> AssemblyCandidate | Error
```

- `ContextAssemblyPort` 是同一用例的适配名，输入输出完全一致，不额外发布或确认回执。
- `ContextEstimatorPort` 使用冻结格式和 `ModelInputAdapter` 版本复用 Pi 粗估。
- Token 是软目标；字节与结构是硬约束。必选内容估算超目标时返回带标记的候选，不承诺 Provider 一定不超窗。
- 调用方先组装；成功后按需创建或绑定 Session，整体保存候选，并由 Run 条件提交固定 `promptRef`。
- 恢复和适配规则见 CTX-CON-1 §1–3。

<a id="memory-manager"></a>

### L1-CMP-010 memory-manager

> **分类：** 独立组件  
> **详细设计：** [Memory Manager 组件设计](../layers/l1-control/components/memory-manager.md)

#### 数据契约

```text
MemoryEntry = {
  entryId: Ref,
  version: Count,
  contentRef: Artifact,
  sourceRef: Ref,
  sensitivity: public | scoped | restricted,
  supersedes: Ref|null
}

MemoryCandidateInput = {
  candidateId: Ref,
  spaceId: Ref,
  entry: MemoryEntry
}

MemoryCandidate = MemoryCandidateInput + {
  status: pending | approved | rejected | applied,
  version: Count
}

MemoryRankedEntry = {
  entry: MemoryEntry,
  scoreRank: Count
}

MemoryView = {
  viewId: Ref,
  spaceId: Ref,
  version: Count,
  epoch: Count,
  indexVersion: Ref,
  algorithmVersion: Ref,
  queryDigest: Digest,
  rankedEntries: MemoryRankedEntry[]
}
```

`scoreRank` 是冻结查询结果中的非负整数排名，数值越小越优先；相同 rank 按 `entryId` ASCII 升序。View 内 `entryId` 唯一，且版本属于指定 Space 快照。排名不写入 `MemoryEntry`；过滤后的排名可不连续，消费者禁止重新评分。Context 调用方保存 View，并按 CTX-CON-1 `MemoryAssemblySource` 传递 `viewRef`。首次准备不得以计划 Run 调用本操作。

#### 操作契约

```text
query({runId: Ref, source: MemorySource, limit: Count}) -> MemoryView
submit({runId: Ref, candidate: MemoryCandidateInput}) -> MemoryCandidate
apply({
  runId: Ref,
  candidateId: Ref,
  expectedVersion: Count,
  claim: ExecutionClaim
}) -> {
  entryId: Ref,
  version: Count
}
inspect({candidateId: Ref}) -> MemoryCandidate
```

`query` 也是带安全回执的 `CommandMeta` 操作。`apply` 必须在内部请求 PDP，禁止接受客户端自签 Permit。

<a id="agent-runtime-loop"></a>

### L2-CMP-001 agent-runtime-loop

> **分类：** 独立组件  
> **详细设计：** [Agent Runtime Loop 组件设计](../layers/l2-cognitive/components/agent-runtime-loop.md)

#### 数据契约

```text
ModelStepRequest = {
  command: EngineCommand,
  claim: ExecutionClaim,
  payload: ContextPayload,
  formatVersion: Ref,
  modelAdapterVersion: Ref,
  catalogRef: Ref,
  adapterBindingRef: Ref
}

StepProjection = {
  commandId: Ref,
  phase: received | calling | reporting | finished | unknown,
  ackEventId: Ref|null
}
```

权威命令在 L1；L2 投影可丢弃。新请求的 `payload` 必须来自已采纳候选。`catalogRef` 必须与冻结 tools 一致，禁止根据当前目录扩充工具。Trace 与 Session 内部绑定不得进入模型载荷。

#### 操作契约

```text
dispatch(ModelStepRequest) -> ExecutionReceipt
inspect({commandId: Ref}) -> ExecutionQuery
cancel({commandId: Ref}) -> CancelExecutionResult
```

出站端口为 `AgentAdapterPort` 和 `RuntimeEventPort`。`resume` 只能查询或回传既有结果，禁止隐式发起新模型请求。

<a id="parser-normalizer"></a>

### L2-CMP-002 parser-normalizer

> **分类：** 内部职责  
> **详细设计：** [Parser Normalizer 组件设计](../layers/l2-cognitive/components/parser-normalizer.md)

#### 数据契约

```text
NormalizedChunk = {
  commandId: Ref,
  index: Count,
  kind: text | candidate | usage | end,
  payloadRef: Artifact|null
}
ParseWindow = {nextIndex: Count, bytes: Count, ended: Bool}
ValidatedCompletion = {
  assistantTurnRef: Artifact,
  output: ModelOutput,
  usage: Usage
}
```

#### 操作契约

```text
begin({commandId: Ref, catalogRef: Ref, maxOutputBytes: Count}) -> {windowId: Ref}
push({windowId: Ref, chunk: NormalizedChunk}) -> {acceptedIndex: Count}
finish({windowId: Ref}) -> ValidatedCompletion
abort({windowId: Ref}) -> {closed: Bool}
```

这些是 L2 内部方法，禁止用于从外部插入安全事件。

<a id="agent-adapter-boundary"></a>

### L2-CMP-003 agent-adapter-boundary

> **分类：** 契约门面  
> **详细设计：** [Agent Adapter Boundary 组件设计](../layers/l2-cognitive/components/agent-adapter-boundary.md)  
> **输入格式：** [CTX-CON-1](context-assembly-contract.md)

#### 数据契约

```text
AdapterRequest = {
  commandId: Ref,
  payload: ContextPayload,
  formatVersion: Ref,
  modelAdapterVersion: Ref,
  catalogRef: Ref,
  deadlineAtMs: Millis,
  maxOutputBytes: Count
}
Usage = {
  inputTokens: Count|null,
  outputTokens: Count|null,
  source: provider | unknown
}
AdapterFault = {
  code: AUTH_FAILED | RATE_LIMITED | TIMEOUT | PROTOCOL_INVALID
        | OUTPUT_LIMIT | UNAVAILABLE,
  effect: Effect
}
```

#### 操作契约

```text
invoke(AdapterRequest) -> AsyncStream<NormalizedChunk>
cancel({commandId: Ref}) -> CancelExecutionResult
```

- 新候选优先通过冻结的 `PiModelInputAdapter` 复用 Pi 消息与 Provider 转换。
- 禁止恢复 `runtimeMessageRef`、忽略 task / materials / memory，或在采纳后再次自动压缩。
- 投影使用 CTX-CON-1 `pi-context-1` 的固定块顺序和字段；Provider 协议复用 Pi。
- 相关 L2 实现必须用固定向量验证。
- 异步流必须以一个 `end` 或一个 `AdapterFault` 结束；禁止以 EOF 表示成功。
- `ModelInvocationPort` 只可作为 PiAdapter 私有协作者名称。

<a id="pi-agent-adapter"></a>

### L2-CMP-004 pi-agent-adapter

> **分类：** 独立组件  
> **详细设计：** [Pi Agent Adapter 组件设计](../layers/l2-cognitive/components/pi-agent-adapter.md)

#### 私有数据

```text
PiCallState = {
  commandId: Ref,
  providerRequestId: Ref|null,
  phase: prepared | sent | streaming | ended | unknown,
  bytes: Count
}
```

Kernel 侧只返回 `AdapterRequest`、`NormalizedChunk` 或 `AdapterFault`，不得导出私有 `PiCallState`。

#### 操作与实现约束

- `invoke` / `cancel` 严格实现 `AgentAdapterPort`。
- 私有 `send` 使用 `ModelEgress` 请求。
- 实现绑定当前仓库 Pi workspace 的公开 API；开发前必须以 `node_modules` 中的真实类型校验。
- 禁止动态猜测类型或修改生成模型表。

<a id="tool-catalog-router"></a>

### L3-CMP-001 tool-catalog-router

> **分类：** 独立组件  
> **详细设计：** [Tool Catalog Router 组件设计](../layers/l3-tool-runtime/components/tool-catalog-router.md)

#### 数据契约

```text
ToolDescriptor = {
  toolId: Ref,
  version: Count,
  schemaRef: Artifact,
  descriptionRef: Artifact,
  risk: read | write | restricted,
  executionKind: provider | sandbox,
  routeRef: Ref,
  resourceScopeRef: Ref
}
CatalogSnapshot = {
  catalogRef: Ref,
  version: Count,
  descriptors: ToolDescriptor[],
  digest: Digest
}
```

#### 操作契约

```text
publish({expectedVersion: Count, descriptors: ToolDescriptor[]}) -> CatalogSnapshot
visible({scopeRef: Ref, version: Count}) -> CatalogSnapshot
resolve({catalogRef: Ref, toolDescriptorRef: Ref}) -> {
  descriptor: ToolDescriptor,
  routeRef: Ref
}
```

<a id="tool-call-runtime"></a>

### L3-CMP-002 tool-call-runtime

> **分类：** 独立组件  
> **详细设计：** [Tool Call Runtime 组件设计](../layers/l3-tool-runtime/components/tool-call-runtime.md)  
> **专项契约：** [L3 Tool Runtime 详细契约](l3-tool-runtime-detail.md)

#### 数据契约

```text
ToolCall = {
  toolCallId: Ref,
  commandId: Ref,
  originAttemptId: Ref,
  runId: Ref,
  proposal: ActionProposal,
  permitRef: Ref,
  routeRef: Ref,
  phase: received | authorized | started | succeeded | failed | unknown | cancelled,
  version: Count,
  receiptRef: Ref|null,
  startGrantRef: Ref|null,
  resultRef: Artifact|null,
  effect: Effect
}
```

`toolCallId = commandId`；小写 phase 映射到 FE 的大写阶段。

#### 操作契约

```text
dispatch({command: EngineCommand, claim: ExecutionClaim}) -> ExecutionReceipt
inspect({commandId: Ref}) -> ExecutionQuery
cancel({commandId: Ref}) -> CancelExecutionResult
```

输出 `ToolObserved` 必须先持久化，再发送给 L1。

<a id="tool-execution-guard"></a>

### L3-CMP-003 tool-execution-guard

> **分类：** 内部职责  
> **详细设计：** [Tool Execution Guard 组件设计](../layers/l3-tool-runtime/components/tool-execution-guard.md)

#### 数据契约

```text
GuardInput = {
  commandId: Ref,
  permitRef: Ref,
  binding: ActionBinding,
  actualArgumentsRef: Artifact,
  actualRouteRef: Ref,
  claim: ExecutionClaim
}
GuardReceipt = {
  permitReceiptRef: Ref,
  startGrantRef: Ref|null
}
```

Guard 不维护本地许可缓存。

#### 操作契约

```text
consume(GuardInput) -> PermitReceipt
authorizeStart({input: GuardInput, receiptRef: Ref}) -> StartGrant
```

ToolCallRuntime 分别在 `RECEIVED` 和 `AUTHORIZED` 阶段调用这两个操作。

<a id="permission-decision-engine"></a>

### SEC-CMP-001 permission-decision-engine

> **分类：** 独立组件  
> **详细设计：** [Permission Decision Engine 组件设计](../layers/security-plane/components/permission-decision-engine/README.md)  
> **专项契约：** [SEC-DEC-1](../layers/security-plane/contracts/security-decision-contract.md)

本节拥有基础 DTO 与公开操作。SEC-DEC-1 拥有 `PreparedDecision` / `ResourceCeiling`、求值证据、提交与恢复结构；两者均保持候选状态。

#### 数据契约

<a id="policy-snapshot"></a>

```text
PolicySnapshot = {
  policyRef: Ref,
  epoch: Count,
  scopeRef: Ref,
  denyActions: ActionKind[],
  allowActions: ActionKind[],
  askActions: ActionKind[],
  resourceLimitsRef: Ref,
  expiresAtMs: Millis
}
```

<a id="action-kind"></a>

```text
ActionKind = tool.execute/child.create/memory.write/memory.read
```

<a id="decision-request"></a>

```text
DecisionRequest = {
  action: SecurityAction,
  binding: SecurityBinding,
  approvalRef: Ref|null
}
```

<a id="decision"></a>

```text
Decision = {
  kind: allow,
  permitRef: Ref,
  expiresAtMs: Millis
}|{
  kind: ask,
  approvalRef: Ref
}|{
  kind: deny,
  code: ErrorCode
}
```

SecurityAction与当前授权状态见下文“授权闭环”。

#### 操作契约

```text
decide(DecisionRequest)->Decision;
inspect({
  decisionCommandId: Ref
})->Decision
```

`PolicySnapshotPort` 只读取外部已编译快照。内部 `evaluate(proposal, policy, verifiedEnvelope) -> allow | ask | deny` 不得执行 I/O。服务端决定初始状态；`issue` / `submit` 请求不得自选已批准或已生效状态。

<a id="execution-permit"></a>

### SEC-CMP-002 execution-permit

> **分类：** 独立组件  
> **详细设计：** [Execution Permit 组件设计](../layers/security-plane/components/execution-permit.md)

#### 数据契约

<a id="permit-issue-input"></a>

```text
PermitIssueInput = {
  binding: SecurityBinding,
  expiresAtMs: Millis,
  decisionCommandId: Ref
}
```

<a id="permit-record"></a>

```text
PermitRecord = {
  permitRef: Ref,
  binding: SecurityBinding,
  expiresAtMs: Millis,
  state: issued|consumed|revoked|expired,
  commandId: Ref|null,
  version: Count
}
```

<a id="permit-receipt"></a>

```text
PermitReceipt = {
  receiptRef: Ref,
  permitRef: Ref,
  commandId: Ref,
  bindingDigest: Digest
}
```

<a id="start-grant"></a>

```text
StartGrant = {
  grantRef: Ref,
  commandId: Ref,
  claimFence: Count,
  authorizedAtMs: Millis
}
```

私有GrantRecord绑定见授权闭环。

#### 操作契约

```text
issue(PermitIssueInput)->PermitRecord;
consume({
  permitRef: Ref,
  commandId: Ref,
  binding: SecurityBinding
})->PermitReceipt;
authorizeStart({
  receiptRef: Ref,
  commandId: Ref,
  binding: SecurityBinding,
  claim: ExecutionClaim,
  executorRef: Ref
})->StartGrant;
revoke({
  permitRef: Ref,
  expectedVersion: Count
})->PermitRecord;
inspect({
  permitRef: Ref
})->PermitRecord
```

服务端决定初始状态；`issue` / `submit` 请求不得自选已批准或已生效状态。

<a id="pep-enforcement"></a>

### SEC-CMP-003 pep-enforcement

> **分类：** 契约门面  
> **详细设计：** [PEP Enforcement 组件设计](../layers/security-plane/components/pep-enforcement/README.md)

#### 数据契约

<a id="security-binding"></a>

```text
SecurityBinding = {
  runId: Ref,
  agentId: Ref,
  envelopeRef: Ref,
  policyEpoch: Count,
  kind: ActionKind,
  actionDigest: Digest,
  targetDigest: Digest,
  resourceScopeRef: Ref
}
```

<a id="action-binding"></a>

```text
ActionBinding = SecurityBinding
```

ActionBinding 为 SecurityBinding 精确别名。

<a id="authorized-action"></a>

```text
AuthorizedAction = {
  proposal: ActionProposal,
  permitRef: Ref,
  binding: SecurityBinding
}
```

AuthorizedAction 仅工具使用。

#### 操作契约

```text
requestDecision(DecisionRequest)->Decision
```

`requestDecision` 在 L1 调用。`enforce` 通过 `PermitService.consume` / `authorizeStart` 执行。受保护动作包括 `tool.execute`、`memory.write`、`child.create` 及跨 Scope 敏感读取；每个动作必须绑定实际目标，禁止共用一次 Permit。服务端决定初始状态。

<a id="approval-bridge"></a>

### SEC-CMP-004 approval-bridge

> **分类：** 独立组件  
> **详细设计：** [Approval Bridge 组件设计](../layers/security-plane/components/approval-bridge.md)

#### 数据契约

<a id="permission-request"></a>

```text
PermissionRequest = {
  approvalRef: Ref,
  proposalId: Ref,
  actionDigest: Digest,
  runId: Ref,
  envelopeRef: Ref,
  policyEpoch: Count,
  expiresAtMs: Millis,
  externalRef: Ref|null,
  state: pending|approved|denied|expired|cancelled,
  version: Count
}
```

<a id="callback"></a>

```text
Callback = {
  approvalRef: Ref,
  actionDigest: Digest,
  decision: approve|deny,
  externalDecisionId: Ref
}
```

#### 操作契约

```text
submit({
  approvalRef: Ref
})->{
  externalRef: Ref|null,
  state: ApprovalState
};
decide(Callback)->{
  approvalRef: Ref,
  state: ApprovalState,
  version: Count
};
inspect({
  approvalRef: Ref
})->PermissionRequest;
cancel({
  approvalRef: Ref
})->{
  state: ApprovalState
}
```

服务端决定初始状态；`issue` / `submit` 请求不得自选已批准或已生效状态。

## 范围外依赖的类型来源

| 类型或能力 | 权威来源 | 范围说明 |
|---|---|---|
| `ExecutionResult`、`ExecutionLimits`、`ProviderReceipt`、`ExecutionPlan` | [L4 依赖要求](../layers/l4-execution-runtime/kernel-dependencies.md) | 只定义 Kernel 所需边界；具体执行器不在本轮 |
| `Artifact`、`Time`、`Secret`、`Capacity` | [Infrastructure 依赖要求](../layers/infrastructure-plane/kernel-dependencies.md) | 只定义调用条件 |
| `TelemetryRecord`、`MetricSnapshot`、`AuditEvent` | [Operations 依赖要求](../layers/operations-plane/kernel-dependencies.md) | 只定义观测与审计依赖 |

本轮不为这些外部系统建立待开发任务。

## 授权闭环（R1，替代首轮工具专用DecisionRequest）

FE `ActionProposal` 保持不变；`SecurityAction` 是 Security 内部封闭联合。

<a id="security-action-payloads"></a>

#### tool.execute 的 payload

```text
{
  proposal: ActionProposal
}
```

#### child.create 的 payload

```text
{
  parentRunId: Ref,
  childId: Ref,
  originCommandId: Ref,
  spec: ChildSpec,
  admission: ChildAdmissionBindings,
  reservationId: Ref
}
```

#### memory.write 的 payload

```text
{
  spaceId: Ref,
  candidateId: Ref,
  expectedVersion: Count,
  entry: MemoryEntry
}
```

#### memory.read 的 payload

```text
{
  source: MemorySource,
  limit: Count
}
```

<a id="security-action"></a>

```text
SecurityAction = {
  kind: ActionKind,
  payload: 对应精确类型
}
```

### 摘要与策略匹配

- 工具 `actionDigest` 沿用 FE 公式；其他 `kind` 使用 `H({kind, payload})`。
- `targetDigest = H({kind, resourceScopeRef, payload})`。
- 资源范围来自可信描述、Space 或 ChildSubset，不得由模型自签。
- `SecurityBinding` 的 run、agent、envelope 和 epoch 均来自当前 Run 与可信授权状态。
- 策略按 `ActionKind` 精确匹配，顺序固定为：`deny 优先 → 资源子集检查 → ask → 显式 allow → 默认 deny`。
- 禁止根据自由工具名或不透明 Ref 猜测规则。

### 非工具命令身份与缓存

```text
permissionRequestId =
  "perm:" + SHA256(FE-C14N-1({originCommandId, kind, actionDigest}))
```

执行授权消费仍绑定 `originCommandId`，安全服务在内部持久化回执。Memory `query` 使用 `CommandMeta`；相同查询重试只能复用已生成且仍可访问的 View 引用。每次释放内容前必须复核当前授权状态；撤销后返回拒绝，不得返回缓存正文。

### 首版 Ask 行为

- Child / Memory 的 `ask` 固定返回 `ACTION_APPROVAL_REQUIRED`，并记录拒绝执行结果。
- 这些用例不增加审批等待状态，也不产生工具型 `ApprovalResolved`。
- 调用方完成外部批准、可信 Host 更新授权状态后，必须发起新命令。
- 该限制不取消工具 `ask` 或 `ApprovalBridge` 能力。
- Child 的 Ask / Deny / Unavailable 由外部安全回调返回拒绝；FE 只耐久记录输入准备或受理拒绝事实，不创建 Child Run。
- Memory read / write 的 Ask / Deny 不读取正文、不写入 Entry，只返回稳定错误。
- 新动作禁止复用旧 Permit 绕过上述要求。

### Memory 受保护操作

`MemoryManager.apply` 必须：

1. 加载可信 Run 与当前 claim；
2. 校验 claim 属于同一 Run；
3. 依次执行 `PDP → consume → authorizeStart`；
4. 使用原 command 事务 CAS 写入 Entry。

`query` 也必须加载当前 Run 的执行资格。禁止借历史终态 Run 发起新的敏感读取。普通终态结果通过 Gateway 授权查询，与新的 Memory 检索严格分离。Memory 技术查询的 nonce 不是 Authority，任意 `runId` 不得提升权限。

### 当前授权状态与撤销依赖

Security 拥有技术授权状态投影：

<a id="authorization-state"></a>

```text
AuthorizationState = {
  envelopeRef: Ref,
  scopeRef: Ref,
  epoch: Count,
  state: active|revoked,
  policyRef: Ref,
  validUntilMs: Millis,
  version: Count,
  sourceReceiptRef: Ref
}
```

Security 不拥有外部身份规则。可信 Host 通过以下操作安装外部已验证快照：

```text
installAuthorization({
  expectedVersion: Count,
  state: AuthorizationState
})->{
  version: Count
}
```

新建version=0，后续只接受epoch不减且版本CAS。同epoch异内容拒绝。

```text
invalidateAuthorization({
  envelopeRef,
  expectedVersion,
  newEpoch,
  sourceReceiptRef
})->{
  version: Count
}
```

invalidateAuthorization 原子置revoked。接口只对Host服务能力开放，JSON身份不能调用。

#### 本地撤销顺序

- 本地安装 / 失效事务与 `authorizeStart` 使用同一权威本地安全读取序列。
- 失效先提交时，后续不得签发 Permit 或启动动作。
- 远端策略改变只有在 Host 收到本地失效确认后，才能宣称此 Kernel 的撤销已经生效；不承诺未同步的远端更改瞬时生效。
- Host 先失效旧状态，再安装新 epoch 策略；两者间隔期间失败关闭。
- 授权源连接丢失或结果无法确认时，Host 必须先失效本地状态。
- `validUntilMs` 将旧状态最长有效期限制为 30 秒。
- Provider 在途动作不能保证瞬时撤回。

Host 通知保证见[Infrastructure 依赖要求](../layers/infrastructure-plane/kernel-dependencies.md)；本文不设计 RBAC 系统。

#### Permit 生命周期

```text
initial: version=0, state=issued, commandId=null
issued -> consumed | revoked | expired
consumed -> revoked
```

`issue` 生成 `permitRef`。首次 `consume`、`revoke` 或显式 `expire` 各将版本递增 1；同命令回执查询不递增版本。状态不得回到 `issued`。授权或撤销的任意权威读取失败时，禁止签发新 grant。

授权新鲜度续期独立于策略epoch，Host 调用：

```text
renewAuthorization({
  envelopeRef: Ref,
  expectedVersion: Count,
  epoch: Count,
  validUntilMs: Millis,
  sourceReceiptRef: Ref
})->{
  version: Count
}
```

续期约束：

- 只允许 `state=active` 且 epoch 相同的记录续期。
- 可信新来源回执必须证明策略、Scope 与状态未变化。
- CAS 只可修改 `validUntilMs`、`sourceReceiptRef`，并令 `version + 1`。
- `validUntilMs` 必须满足 `now < validUntilMs <= now + 30 秒`。
- 禁止修改 `policyRef`、`scopeRef` 或 `state`，也不得复活 `revoked`。
- 相同 command 和相同输入的重试返回原回执。
- 从过期到续期确认之间不得授权新动作。
- 续期成功不改变 Run 冻结的 policy epoch。
- `installAuthorization` 的“同 epoch 异内容拒绝”规则不适用于这一独立续期操作。

`K-TC-07` 必须覆盖：epoch 7 正常续期且 Permit 绑定不变、修改 Scope 的续期被拒绝、已撤销记录续期被拒绝。

GrantRef 对应安全私有记录：

<a id="grant-record"></a>

```text
GrantRecord = {
  grant: StartGrant,
  ownerId: Ref,
  attemptId: Ref,
  fence: Count,
  executorRef: Ref,
  bindingDigest: Digest,
  receiptRef: Ref
}
```

`STARTED` CAS 必须比较 `GrantRecord` 身份与当前调度 claim，并使用正确 executor 的内部句柄。旧 grant 不得交给新 owner 使用。

- 接管时尚未进入 `STARTED`：使用当前 claim 重新调用 `authorizeStart`，并再次核对 Permit 有效期。
- 接管时已经进入 `STARTED`：只能查询既有执行事实。
- L4 只接收受控 `ExecutionPlan` 与不透明 `grantRef`，不接触 Host 原始身份。

## Child业务输入与Session协调要求

> [!NOTE]
> 本节冻结候选开发契约，不表示代码已经实现。

Session 父子关联、sub-session Fork / Join、Barrier、Reduce、取消编排和 Parent 唤醒，统一属于 [SessionManager 的 SubSessionCoordinator](../layers/l1-control/components/session-manager/sr-03-subsession-fork-join.md)。FE 只执行单个 Child Flow，并幂等消费 Parent resume 指令；FE 不定义 Join 条件、不保存 Barrier，也不读取 Child 黑板。

<a id="child-admission-bindings"></a>

```text
ChildAdmissionBindings = {
  agentId: Ref,
  agentVersion: Count,
  sessionId: Ref,
  sessionVersion: Count,
  routeProposalRef: Ref,
  routeSnapshotRef: Ref,
  executionEnvelopeRef: Ref
}
```

### 输入性质与准备顺序

`ChildAdmissionBindings` 是**外部 Agent 业务输入**：

- 外部适配层选择子程序、冻结 Agent / Route，并让 Security 安装 Child 的最小授权状态。
- Coordinator 将业务绑定作为 `ChildSpec.inputRef` 持久化，只额外保存 `executionEnvelopeRef` 和 Security 回执引用。
- FE 只保存和传递该引用，不解释其中的业务或权限字段。
- `ChildAdmissionBindings` 是分支确认后的受理输入，不能作为组装前必填的 Session 锚点。

组装前必须使用 CTX-CON-1 `SessionInput`：一次性只读 Child 使用 `read_only`；独立 Child 使用绑定确切 Parent 版本的 `create` 意图。Coordinator 的处理顺序固定为：

1. 在受控读取授权下组装候选；
2. 候选成功后，执行实际分支写入所需的 `child.create` PDP / Permit / StartGrant 链；
3. 调用 `SessionBranchPort`；
4. 构造已确认的受理绑定并保存完整候选；
5. 占用 Run 槽位并提交受理。

创建授权不替代父内容读取授权。组装期间原授权过期时，不得直接用于分支写入。恢复时必须核对原创建与采纳事实，禁止更换身份、Parent 版本或改为读取 `latest`。

### 安全所有权

- SessionManager 不拥有安全能力生命周期。
- `AuthorizationState`、`Decision`、`PermitRecord` 和 `GrantRecord` 只存储在 Security。
- Session、Barrier 和 Member 禁止保存这些对象的正文或消费状态副本。
- Parent 的创建 Grant 不得下传为 Child 运行权；Child 使用自己的 `executionEnvelopeRef` 请求后续动作的新判定。
- Security 撤销不删除 Session 历史，但必须使新受保护动作失败关闭，并由 Run / Coordinator 取消路径收敛活动执行。

### 阶段职责

1. **输入准备**
   - Coordinator 冻结 `ForkSpec`、稳定身份与 `SessionInput`。
   - 已有协调意图记录不等于 Child Session 已创建。
   - `assemble` 失败时，`branch` 调用次数必须为 0。
   - 创建命令丢失响应时，按原命令核对，禁止更换 ID。

2. **上下文注入**
   - Coordinator 使用创建意图与 `ParentContextSliceSpec` 取得 `AssemblyCandidate`。
   - 只允许读取 Parent 确切版本中的显式候选。
   - 成功后依次执行 branch、校验 `CandidateSessionBinding`、整体保存候选。
   - 不要求 Context 返回持久回执；保存或绑定未确认时，Run / FE 受理数必须为 0。

3. **Child 受理**
   - 候选保存且 Session 绑定确认后，Coordinator 调用 SessionManager `SessionRunCommandPort`。
   - SessionManager 先以 CAS 写入 Child Session 唯一 `RESERVED` 绑定和 `AdmitRun` outbox；提交后 worker 才可调用 RunRegistry。
   - Run 受理确认后，FE 执行单个 Flow。
   - SessionManager 与 FE 均不得写入对方聚合。

4. **未知结果**
   - 受理或执行响应未知时，只核对原回执；一次 `absent` 不证明拒绝。
   - member 转为 `UNKNOWN` 并挂起；对账前不参与成功或失败计数。

5. **Join**
   - Coordinator 通过 inbox、member CAS 和 barrier CAS 处理乱序与重复事件。
   - 判定只使用冻结的 `JoinPolicy`。
   - `*_count` 只是缓存投影，不是唯一事实来源。

6. **Reduce**
   - Reducer 在数据库事务外，按 Child `ordinal` 读取冻结版本并产生带 provenance 的 Summary。
   - 使用 Fork 时的 Parent 版本 CAS 追加；冲突时挂起，禁止静默 merge。

7. **唤醒**
   - Parent Summary 或失败事实提交确认后，Coordinator 写入 `ResumeParent` outbox。
   - FE 按 `resumeCommandId` / `groupId` 幂等消费，且只迁移一次。

8. **取消与清理**
   - Coordinator 拥有 group 取消栅栏和 Child 清理进度，并通过 FE 取消已受理 Child Run。
   - 专用 Child 只执行幂等逻辑归档，不同步硬删除。
   - Barrier、Security 回执与候选 Artifact 至少保留 30 天，并且只能在 pin、outbox、UNKNOWN 和 incident 全部收敛后物理回收。

模型轮数、工具次数和业务委派额度属于外部业务 / 安全模块。SessionManager 只执行 `ForkSpec` 中冻结的 Child 数量与深度硬界限、`JoinPolicy` 和协调恢复。FE 只执行单 Flow 的框架级循环上限与退出条件。

### 验收引用

唯一详细测试矩阵位于：

- [SessionManager Root Session](../layers/l1-control/components/session-manager/sr-01-root-session-lifecycle.md)：`SES-T-12～22` 与 append/archive 验收；
- [SessionManager 单活 Run](../layers/l1-control/components/session-manager/sr-02-single-active-run.md)：`SES-RUN-T-01～06`、`SES-TAKEOVER-T-01～03`、`SES-E2E-07`；
- [SessionManager Sub-session Fork/Join](../layers/l1-control/components/session-manager/sr-03-subsession-fork-join.md)：`SES-T-01～11`、`SES-JOIN-T-01～23`、`SES-E2E-01～06`；
- [Barrier 状态机测试](../layers/l1-control/components/session-manager/join-barrier-state-machine.md#11-开发与系统集成测试)：`SES-JOIN-T-24～31`。

最低覆盖要求：

- 同一 Session 的不同 Run 并发时仅一个占用；
- 受理 `UNKNOWN` 不释放；旧 `bindingVersion` 不清除新绑定；
- 同一 Run 的 Attempt 接管不新增 Session lease；
- 同命令身份不重复创建 Child；
- 只继承显式父上下文子集；
- 默认策略在固定 Pi 估算饱和夹具中接近软目标，且不突破字节硬限额；
- Context 确认前不受理 Run / FE；
- B / C 同毫秒完成时只作出一次决策；
- A 成功、B 失败、C 超时的四种策略向量；
- 失败或取消必须先提交 Parent outcome，再唤醒 Parent；
- Reducer 与到达顺序无关，且不得越权；
- `UNKNOWN` 按原命令和原状态恢复；
- Parent CAS 冲突时不唤醒；唤醒重投只迁移一次；
- Child 只逻辑归档，Barrier 不提前删除；
- SessionManager、Context 和 FE 之间无同步回调环。

以上均为设计要求，不代表已经通过运行验证。

## Session与Context冻结闭环（R1）

### 转录结构

`HistoryTurn.assistant` 必须满足：

- FE `kind=assistant`；
- `commandId=modelCommandId`；
- Artifact 保存完整规范助手消息；
- Message 全文不超过 256 KiB，且不包含原始推理链。

```text
CanonicalAssistantMessage = {
  content: Block[],
  stopReason: answer | tools | child
}

Block =
  {kind: text, text: Text}
  | {kind: tool, proposal: ActionProposal}
  | {kind: child, childId: Ref, spec: ChildSpec}
```

供 Context 使用时，业务执行适配层按 [CTX-CON-1 §2.2](context-assembly-contract.md) 将 Child 声明与已确认结果转换为 `child_task` / `task_observation`，并保留原父事件与 Child 身份。这些结构不属于模型工具调用。

### 转录完整性

- `HistoryTurn.results` 是有序的 FE tool / child `TranscriptEntry`。
- 每一项必须匹配助手建议中的 `proposalId` / `childId` 及原权威命令。
- 禁止裸结果、缺失、重复、逆序或跨 Run 混入。
- `TranscriptSlice` 覆盖完整、连续且已提交的轮次。

```text
readTranscriptSlice({
  runId: Ref,
  firstSequence: Count,
  lastSequence: Count,
  headRef: Ref
}) -> TranscriptSlice
```

SessionManager 通过 RunRegistry 的该操作验证 `commitIds` 和全部内容引用。Client 禁止用任意 Artifact 列表冒充。未完成的工具链不得追加到 Session；Run 中仍在进行的链由 Context 读取 Run 转录处理。Session CAS 只写入已验证切片，source 切片身份唯一；分支始终固定 Parent 版本。

### 首次组装与采纳

Host 冻结 CTX-CON-1 `AssemblyBasis`，其中包含 `SessionInput`、`RunAssemblyInput`、来源、算法版本和模型适配版本，并使用 `inputDigest` 绑定业务操作。

首次组装流程：

1. Host / Coordinator 在自己的业务操作记录中保存 `preparationId` 与冻结输入，并提供受限 `ScopedReader` 能力。
2. `initial` 只有计划 Run 身份，没有已提交 Run 的版本或 head。
3. Host 在自己的授权边界内准备冻结 Memory View；不得把计划 Run 传给要求当前 Run 资格的既有 `Memory.query`。
4. 候选成功后，才执行 ensure / branch、确认绑定、保存候选，并通过单活 Run 入口受理与采纳。
5. 实际写入与模型派发分别核对执行资格。

详细顺序见 [CTX-CON-1 §1.1](context-assembly-contract.md)。来源接口 Schema 仍是单独待补项；禁止伪造 Session 或 Run 来满足旧签名。

### 格式、降级与恢复

- 模型规范格式为 `ctx-input-1`；完整候选存储版本为 `ctx-candidate-1`。字段与编码唯一来源均为 CTX-CON-1。
- Memory 排序沿用冻结的 `indexVersion`、`algorithmVersion` 与 `scoreRank` 规则；`MemoryView` 使用本文的 `rankedEntries`。
- 来源读取结果和 Child 任务观察映射见 CTX-CON-1 §2.2。
- `memory=[]` 合法，并且不得调用 Memory。
- required 来源缺失时明确失败；optional 只有发生明确的可用性故障时才可降级，降级事实写入 `AssemblyCandidate.trace`。
- 调用方整体保存候选，在 Run 采纳时固定 `promptRef`。
- 已采纳候选恢复原结果；未采纳且确认 `absent` 后才可重算。
- 取消或授权撤销由实际读取和交付边界失败关闭；`Activity Completed` 不能成为新的交付授权。
- 原独立 `AssemblyReceipt` 协议不再用于新组装调用。

## 扫描闭环（R1）

| 参数 | 首版要求 |
|---|---:|
| 触发周期 | 每 1 秒一轮 |
| 批大小 | 256 条 |
| 单轮活动 Run 上限 | 4,096 条，即最多 16 批 |
| 并发扫描实例 | 1 |
| 单轮完成时间 | 不超过 5 秒 |

一轮内连续处理最多 16 批，不是每秒只处理一批。单轮超过 5 秒时必须暴露 `scan_lag`，并停止受理超出可扫描容量的新 Run；禁止堆叠扫描协程。扫描期间新受理 Run 依靠事务 `runnable` 标记和下一轮补齐，游标固定在本轮高水位。

验收场景：存在完整 4,096 个活动 Run、丢失全部提示且没有新流量时，最后一条 Run 的发现时间必须不超过 5 秒。

## UNKNOWN核对闭环（R1）

`ToolCall UNKNOWN` 必须保留原 `phase=unknown` 历史，并新增唯一核对记录；不得将 UNKNOWN 历史覆盖成“未发生”。

```text
ReconciliationRecord = {
  commandId: Ref,
  incidentRef: Ref,
  resolutionId: Ref,
  version: Count,
  effect: Effect,
  resultRef: Artifact|null,
  outcome: success | failed,
  evidenceRef: Ref
}
```

- 可信执行证据确认后，原 ToolCall 的查询结果由最新已验证记录投影为 `completed` 或 `failed`。
- 核对记录与通知 outbox 在同一事务写入。
- 相同 `resolutionId` 与相同证据的重试返回原回执；矛盾证据返回冲突。

非终态 Run 处于 `Suspended(tool_unknown)` 时，恢复器投递与原 `commandId` / `incidentRef` 匹配的 `EffectReconciled`：

- 核对成功：T2 将 Run 置为 `Ready`、移除原 Proposal、恰好追加一条 tool 转录，并解决 Incident。
- 确认未执行或失败：按 FE `Failed` 处理，禁止自动再次 `DispatchTool`。
- Run 已终态：只更新 Incident 与执行事实；`Run.version` / `position` 完全不变，也不投递推进事件。
- 通知 ACK 丢失：可用同一 `eventId` 重投，由消费收据保证只消费一次。
- Provider 执行次数始终不得增加。

## 必要审计完成点（R1）

审计 outbox 已耐久，不等于必要审计 Journal 已确认。

```text
auditEventId = "audit:" + H({commandId, phase})
```

决策、Permit 消费和 `startGrant` 分别使用稳定的 `auditEventId`；相同内容重投时 ID 不变。Kernel 必须取得同一事件的 `AuditReceipt` 后，才可开放依赖动作。

| Journal 写入方式 | 完成条件 |
|---|---|
| 与本地权威状态在同一事务写入 | 事务成功回执等价于审计确认 |
| 不在同一事务写入 | 保存 `audit_pending`，调用 `append`；超时后调用 `queryReceipt({auditEventId})` |

`queryReceipt` 的完整 `found | absent | unknown | gone` 联合见 [Operations 依赖要求](../layers/operations-plane/kernel-dependencies.md)，只有 `found` 允许继续。审计未确认时，禁止将 grant 交给执行器或进入 `STARTED`。恢复时用同一 `auditEventId` 重投只能补审计，禁止补发新业务。

具体 Journal 实现不在本轮；`queryReceipt` 与原子可见性保证由 Operations 依赖文档维护。
