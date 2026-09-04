> **非规范性归档：** 已由[边界契约注册表](../../../design/contracts/README.md)及独立 `BND-*` 契约取代。

# Agent Kernel System C4 边界协议与接口设计

> 状态：V3 候选架构，五步评审步骤 2/5
> 对应变更：`ACR-2026-0008`
> 日期：2026-09-04
> 范围：定义逻辑 Port、线协议绑定、公共信封和故障语义；不修改代码、Schema、数据库或部署。

![C4 层间边界协议](agent-kernel-v3-boundary-protocols.svg)

## 1. 设计结论

协议是部署绑定，不是领域边界本身。同一个 Port 在单进程部署中可以是进程内调用，在跨进程部署中可以绑定为 gRPC、HTTPS、消息队列或 JSONL；切换绑定不得改变 Port 的领域语义、数据所有者和安全不变量。

首版定位为单机、本地可用的 Agent Kernel，不以大规模企业部署为目标。默认采用单进程模块化内核；只有需要隔离 Pi Runtime 或 Sandbox 时才使用本地子进程和 stdio JSONL。gRPC、Temporal、Event Bus、MicroVM/Vsock 和跨主机 mTLS 只作为后续分布式部署档案，不进入首版依赖与发布门禁。

本轮对初步方案作四项规范化：

1. L1 内部首版使用进程内强类型 Port、本地队列和 SQLite 事务；不引入 Temporal、消息队列和独立 Event Bus。
2. L1 与 L2 首版使用进程内调用；需要进程隔离时复用单条 stdio JSONL 多路复用通道。gRPC 的 unary 命令和事件流是后续跨主机档案。
3. L1 不得直接调用 L4。合法路径为 `L1 → L3 ToolRuntime → L4 Sandbox`，否则会绕过 ToolCall、Permission、Permit 和审计。
4. 运维与基础设施边界不使用业务 RPC：首版记录本地结构化日志、Trace ID、指标快照和耐久安全审计，OTLP 导出可选；基础设施通过代码级 Port 和 Scoped Adapter 提供机制。

### 1.1 稳定协议外观层

所有外部调用统一经过薄 `AgentKernelProtocolFacade`。稳定对外呈现由 `AgentKernelProtocolV1` 定义，进程内调用、stdio JSONL 和未来 Loopback HTTP 只是可替换 Transport Adapter：

```text
CLI / Desktop Host
  → InProcessAdapter / JsonlAdapter / HttpAdapter（可选）
  → AgentKernelProtocolFacade
  → AgentSystemGateway
  → ControlPlane / Scheduler / Permission / Tool
```

外观层只做版本、Schema、DTO、错误和事件的机械映射，不拥有调度、权限、持久化、重试或恢复。稳定方法族、版本规则、Adapter 职责和黑盒一致性测试由[稳定协议外观层设计](protocol-facade-subsystem-design.md)唯一维护；本文只维护跨层协议绑定和故障语义。

## 2. 边界协议总表

| 边界 ID         | 边界                                | 隔离级别       | 逻辑接口                                            | 推荐线协议                                                      | 关键语义                                              |
| ------------- | --------------------------------- | ---------- | ----------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| `BND-EXT-001` | Client/Backend ↔ L1               | 本机进程边界     | `AgentSystemGateway`                            | CLI 进程内调用；Desktop Host 使用 stdio JSONL；Loopback HTTP/SSE 可选 | 协议外观稳定；Transport 可替换；命令幂等；事件可补拉                   |
| `BND-L1-001`  | L1 内部组件                           | 逻辑边界       | Command Port、Repository Port、Domain Event Port  | 进程内强类型调用 + 本地有界队列 + SQLite 事务                              | 聚合本地事务；不引入分布式消息系统                                 |
| `BND-L12-001` | L1 Control ↔ L2 Cognitive Runtime | 逻辑/可选子进程隔离 | `RuntimeControlPort`、`RuntimeEventPort`         | 进程内调用；隔离时使用 stdio JSONL                                    | Deadline、有界队列、Run 内事件有序；多 Worker 时才启用 Lease/fence |
| `BND-SEC-001` | PEP ↔ PDP                         | 本机安全边界     | `PermissionDecisionPort`、`PermitValidationPort` | 进程内强类型调用                                                   | 默认拒绝；决定与 Permit 分离；所有受保护动作的 Permit 一次性消费          |
| `BND-L13-001` | L1 Control/PEP ↔ L3 Tool Runtime  | 逻辑边界       | `ToolRuntimePort`                               | 进程内强类型调用                                                   | L2 不绕过控制层；首版同步有界执行；副作用调用禁止盲重试                     |
| `BND-L34-001` | L3 Tool Runtime ↔ L4 Sandbox      | 本地进程隔离     | `SandboxPort`                                   | stdin/stdout JSONL；同进程只读工具可直接 Adapter 调用                   | 有界帧；stdout 协议纯净；执行后自动回收                           |
| `BND-MEM-001` | Context/Runtime ↔ Memory          | 数据访问边界     | `MemoryQueryPort`、`MemoryCandidatePort`         | 进程内 Port + 本地 SQLite/文件 Artifact Adapter                   | 授权视图读取；候选写入；不共享可变 Context                         |
| `BND-MOD-001` | L2 Adapter ↔ Model Provider       | 外部供应商边界    | `ModelInvocationPort`                           | Provider HTTPS/SSE 或 SDK 私有协议                              | Provider 类型、密钥和重试细节不得越过 Adapter                   |
| `BND-OPS-001` | Kernel → Operations Plane         | 横切运维边界     | `ObservabilityPort`、`SecurityAuditPort`         | 本地结构化日志、Trace ID、指标快照、SQLite 审计；OTLP 可选                    | 有界异步、脱敏、不可反向推进领域状态                                |
| `BND-INF-001` | Kernel → Infrastructure Plane     | 机制边界       | Repository、Artifact、Secret、Clock、Transport Port | 代码级 Port + Scoped Adapter；具体协议由 Adapter 私有                 | 只返回机制结果，不定义 Agent 或权限规则                           |

### 2.1 首版与后续部署机制的职责区分

| 需求 | 推荐机制 | 不应使用 |
|---|---|---|
| 同一聚合内校验和状态变更 | 进程内应用服务 + 本地事务 | 消息队列拼接聚合事务 |
| 首版本地调度、定时器和有限重试 | 本地 Scheduler + SQLite 状态 + 可恢复扫描 | 为本机部署引入 Temporal 集群 |
| 首版已提交事件的模块内通知 | 提交后进程内 Event Dispatcher；事件权威记录仍在 SQLite | 为模块解耦引入独立 Event Bus |
| 后续跨主机耐久工作流 | 满足服务化触发条件后选择 Temporal 或等价机制 | 把普通 MQ 当工作流状态机 |
| 后续跨进程领域事件分发 | 满足多消费者需求后选择 Outbox + Event Bus | Temporal History 作为公共事件总线 |
| 后续 Runtime Worker 派发 | Temporal Task Queue 或专用调度队列二选一 | 同一任务同时投递两套调度系统 |
| 高频进程内查询 | 直接强类型 Port | 为“解耦”强制消息化 |

## 3. 组合式协议元数据

跨进程命令、响应和事件使用可组合的技术元数据。每个接口只携带自身需要的部分，避免用大量可选字段组成万能信封；业务载荷不得重新定义 Trace、Deadline 和幂等语义。

```typescript
/** 跨边界消息的统一技术元数据；不包含可被 Kernel 解释的 Tenant、User 或 RBAC 字段。 */
interface RequestMetadata {
  /** 线协议主版本；不兼容变更必须提升主版本。 */
  protocolVersion: string;
  /** 单次传输请求标识，用于响应关联和诊断。 */
  requestId: string;
  /** W3C Trace Context 的 traceparent。 */
  traceparent: string;
  /** 跨多次调用的业务无关关联标识。 */
  correlationId: string;
  /** UTC RFC 3339 绝对截止时间；接收方只能缩短，不能延长。 */
  deadlineUtc: string;
}

/** 仅写命令携带；同一命令重传时保持不变。 */
interface CommandMetadata {
  commandId: string;
  idempotencyKey?: string;
}

/** 仅 Run 执行链携带。 */
interface RunScopeMetadata {
  runId: string;
  attemptId?: string;
  executionEnvelopeRef: string;
}

/** 仅多 Worker 调度档案使用，首版单 Worker 不要求携带。 */
interface LeaseProof {
  leaseId: string;
  fenceToken: string;
}

/** 跨协议统一错误；HTTP/gRPC 状态只表达传输类别，稳定错误码表达领域和技术原因。 */
interface BoundaryError {
  /** 稳定错误码，例如 PERMISSION_DENIED、LEASE_FENCED。 */
  code: string;
  /** 错误类别，用于映射 HTTP/gRPC 状态。 */
  category: "CLIENT" | "AUTHORITY" | "CONFLICT" | "RESOURCE" | "TRANSIENT" | "FATAL";
  /** 调用方是否允许在相同 commandId/idempotencyKey 下重试。 */
  retryable: boolean;
  /** 服务端建议的最短退避时间。 */
  retryAfterMs?: number;
  /** 脱敏诊断详情引用；不得直接返回 Prompt、Secret 或工具参数。 */
  detailsRef?: string;
}
```

通用限制：

- 单条消息、单个事件、流窗口和队列深度必须配置上限；禁止无界 Buffer。
- `deadlineUtc` 是端到端预算，不得在下游调用时重新开始计时。
- 查询允许有限重试；幂等命令使用稳定 `commandId` 重试；非幂等动作超时后先查询状态；持久事件才按至少一次与去重设计；瞬时进度和遥测允许有界丢失。
- “请求超时”不等于“动作未执行”；有副作用的操作必须提供状态查询。
- 原始 Token 只允许出现在 `BND-EXT-001`，进入 Kernel 前转换为不透明执行信封引用。

## 4. BND-EXT-001：Client/Backend 与 L1

### 4.1 接口

```typescript
interface AgentSystemGateway {
  /** 幂等受理一个 Root AgentRun；返回已持久化的 Run 标识，不等待执行结束。 */
  startRun(command: StartRunCommand): Promise<RunAccepted>;

  /** 查询 Run 的权威快照；可用于命令超时后的结果确认。 */
  getRun(query: GetRunQuery): Promise<AgentRunSnapshot>;

  /** 幂等请求取消 Run；返回取消请求是否被接受，不承诺已完成清理。 */
  cancelRun(command: CancelRunCommand): Promise<CancelAccepted>;

  /** 从指定 Run 序号之后补拉已经持久化的规范化事件。 */
  readRunEvents(query: ReadRunEventsQuery): Promise<AgentEventPage>;

  /** 建立 SSE 事件订阅；断线后客户端以最后确认序号重新补拉。 */
  subscribeRunEvents(query: SubscribeRunEventsQuery): AsyncIterable<AgentEvent>;
}
```

### 4.2 首版本地绑定

| 调用方 | 默认绑定 | 语义 |
|---|---|---|
| Pi CLI | 进程内 `AgentSystemGateway` | 不绕过 Gateway 与 Scheduler |
| Desktop Host | stdin/stdout JSONL Sidecar | 命令/响应按 `requestId` 关联；事件按 Run 序号补拉 |
| 本机调试页面 | 可选 Loopback HTTP + SSE Adapter | 只监听回环地址，不作为首版必需服务 |

写命令返回已经持久化的受理结果或已经存在的幂等结果。传输连接断开不能取消 Run；取消必须使用显式取消命令。若启用 HTTP Adapter，可沿用 `/v2/agent-runs` 资源语义，但它不是首版内部组件之间的通信方式。

## 5. BND-L12-001：L1 与 L2 Runtime

### 5.1 逻辑接口

```typescript
interface RuntimeControlPort {
  /** 将持有有效 Lease 的 Attempt 派发给 Runtime；重复派发必须返回同一受理结果。 */
  dispatchAttempt(command: DispatchAttemptCommand): Promise<AttemptAccepted>;

  /** 将已持久化的工具结果或拒绝结果交回暂停中的 Attempt，并恢复 Agent Loop。 */
  resumeAttempt(command: ResumeAttemptCommand): Promise<AttemptResumeAccepted>;

  /** 请求 Runtime 停止 Attempt；Runtime 必须先阻止新增模型、工具和委派动作。 */
  cancelAttempt(command: CancelAttemptCommand): Promise<AttemptCancelAccepted>;

  /** 查询 Runtime 已知的 Attempt 状态；仅用于恢复判断，不替代 Run 权威状态。 */
  inspectAttempt(query: InspectAttemptQuery): Promise<RuntimeAttemptSnapshot>;
}

interface RuntimeEventPort {
  /** 追加一个规范化 Attempt 事件；返回值表示事件已经进入本地权威 Journal。 */
  appendAttemptEvent(event: RuntimeEventEnvelope): Promise<EventAccepted>;
}
```

### 5.2 首版本地绑定

首版中 L1 与 L2 同进程部署，上述接口直接调用；事件通过有界进程内队列交付。需要隔离 Pi Runtime 时，控制命令、事件和心跳复用 Desktop Sidecar 的 stdio JSONL 通道，不额外引入 gRPC。

未来出现跨主机 Runtime Worker 后，可以在新的 ACR 中把控制方法绑定为 gRPC unary、把持久事件绑定为 server stream，并补充 Worker 心跳或双向通道；首版不预定义 Protobuf Service 和 Worker Channel。

约束：

- 首版单 Scheduler/单 Worker 仍传播 `deadlineUtc`，但不强制 Lease/fence；启用并行 Worker 或崩溃接管后才要求 `leaseId + fenceToken`。
- L1 通过 `ToolRuntimePort.describeTools` 取得当前可见工具并冻结 `ToolCatalogSnapshotRef`，再随 `DispatchAttempt` 提供给 L2；L2 不直接查询 L3 工具目录。
- Runtime 事件以 `(runId, attemptId, sequence)` 有序；不同 Run 之间不承诺全局顺序。
- L2 产生的 `ToolCallCandidate` 作为规范化 RuntimeEvent 回到 L1；L1 完成权限与工具执行后使用 `ResumeAttempt` 回送 `ToolResultRef` 或拒绝结果。
- 本地事件持久化成功后才推进 Run 投影；隔离进程模式在持久化成功后响应 `EventAccepted`。
- 传输断线只表示通道未知，不得直接把 Run 标记成功或重新执行。
- 首版通过有界进程内队列或 JSONL 最大未确认事件数背压；gRPC flow control 属于后续档案。

## 6. BND-SEC-001：PEP 与 PDP

```typescript
interface PermissionDecisionPort {
  /** 对不可变 ActionProposal 返回 Allow、Ask 或 Deny；不得直接执行动作。 */
  authorize(proposal: ActionProposal): Promise<PermissionDecision>;

  /** 查询等待外部审批的技术请求状态。 */
  getPermissionRequest(query: GetPermissionRequestQuery): Promise<PermissionRequestSnapshot>;
}

interface PermitValidationPort {
  /** 在真实执行点校验 Permit；高风险动作还必须原子消费一次性 Permit。 */
  validateAndConsume(command: ValidatePermitCommand): Promise<PermitValidation>;
}
```

- `Allow` 生成短时、绑定 ActionDigest 的一次性 `ExecutionPermit`；只读动作可以缩小沙箱强度，但不能放宽 Permit 的单次消费约束。
- `Ask` 持久化 `PermissionRequest` 后异步提交外部审批；不能占用同步 RPC 等待人工操作。
- 首版 PDP 与 PEP 进程内协作，不增加每次工具调用的网络往返。策略版本未知或 Permit 校验失败时一律失败关闭。
- PEP 必须位于真正执行动作的位置；只在 Scheduler 前置检查不足以阻止 TOCTOU。

## 7. BND-L13-001：L1 Control/PEP 与 L3 Tool Runtime

L2 AgentRuntime 不直接访问 L3。Runtime 通过 `BND-L12-001` 向 L1 发布 `ToolCallCandidate` 并暂停当前 LoopStep；L1 的 Action Coordinator/PEP 完成授权后调用下列接口，最终再通过 `ResumeAttempt` 把结果交回 L2。

```typescript
interface ToolRuntimePort {
  /** 查询当前执行信封可见的版本化工具描述，不返回 Provider 私有类型。 */
  describeTools(query: DescribeToolsQuery): Promise<ToolDescriptorPage>;

  /** 执行已经完成授权绑定的本地有界工具请求，并返回规范化结果。 */
  executeTool(request: AuthorizedToolRequest): Promise<ToolResult>;
}

/** 仅声明 ASYNC_EXECUTION 能力的长任务工具实现该扩展接口。 */
interface AsyncToolRuntimePort {
  /** 幂等受理长任务并返回 ToolCall 标识。 */
  startTool(request: AuthorizedToolRequest): Promise<ToolCallAccepted>;

  /** 查询 ToolCall 权威状态，用于超时和断线后的结果确认。 */
  getToolCall(query: GetToolCallQuery): Promise<ToolCallSnapshot>;

  /** 幂等请求取消 ToolCall；不能假设外部副作用一定可撤销。 */
  cancelToolCall(command: CancelToolCallCommand): Promise<ToolCancelAccepted>;

  /** 从指定序号订阅已经持久化的 ToolCall 事件。 */
  streamToolEvents(query: StreamToolEventsQuery): AsyncIterable<ToolEvent>;
}
```

首版使用进程内强类型 Port。对已有本地或远程 API，`ToolProviderPort` 由 Adapter 接入，但 Provider DTO 不得成为 Kernel 公共模型。独立 Tool Runtime 服务和内部 gRPC 仅在工具需要独立扩缩容或独立信任边界时启用。

副作用规则：

- 每次调用使用稳定 `toolCallId` 和 Provider operation key。
- 超时后先调用 `getToolCall` 或 Provider 查询接口，不得立即重放。
- Provider 无幂等或查询能力时，超时进入 `UNKNOWN_SIDE_EFFECT`，等待人工或补偿流程。
- ToolResult 先持久化再发布，超大结果只返回 `ArtifactReference`。

## 8. BND-L34-001：L3 与 L4 Sandbox

L1 不存在直接访问 L4 的接口。首版唯一入口是 Tool Runtime 持有的 `SandboxPort`：

```typescript
interface SandboxPort {
  /** 在一次有界调用内创建隔离环境、执行并回收；输出超限时截断或转存 Artifact。 */
  execute(request: SandboxedExecutionRequest): Promise<SandboxedExecutionResult>;
}
```

协议档案：

| 部署形态 | 协议 | 强制规则 |
|---|---|---|
| 本地 Bun/子进程（首版） | stdin/stdout JSONL | stdout 只输出协议；stderr 只输出脱敏结构化日志；调用结束自动回收 |
| 同进程只读工具（首版） | 进程内 Adapter | 仍需权限判断、路径约束和有界结果；不得获得 Shell 能力 |
| Docker 隔离进程（可选） | stdio 或 Unix Domain Socket | 禁止暴露随机宿主 TCP 端口 |
| MicroVM（后续） | Vsock + 长度前缀 Protobuf/JSON 帧 | Guest 不监听宿主 TCP；CID/端口由 Adapter 私有管理 |

JSONL 初始化必须完成版本、能力和最大帧协商。首版单次执行必须设置输入、输出、执行时间、进程数、文件挂载和网络出口上限；只有引入长驻 Sandbox Session 后才增加心跳、显式关闭和恢复协议。

## 9. BND-MEM-001：Context 与 Memory

```typescript
interface MemoryQueryPort {
  /** 根据授权快照检索只读 MemoryView；不得返回未授权原文。 */
  queryMemory(query: MemoryQuery): Promise<MemoryView>;
}

interface MemoryCandidatePort {
  /** 提交带来源和敏感等级的候选记忆；提交不等于已经进入共享空间。 */
  submitCandidate(command: SubmitMemoryCandidateCommand): Promise<MemoryCandidateAccepted>;

  /** 查询候选记忆的审核、接受或拒绝状态。 */
  getCandidate(query: GetMemoryCandidateQuery): Promise<MemoryCandidateSnapshot>;
}
```

Memory Domain 拥有长期记忆权威状态；首版由进程内 `MemoryPort` 和本地 SQLite/Artifact Adapter 实现，不要求独立 Memory Service。Context Manager 只消费冻结的 `MemoryView` 并形成 `ContextFrame`。跨 Agent 或 ExecutionScope 的访问必须重新经过 Permission；上层业务组建的 Multi-agent 也只能通过相同授权接口访问。

Session、FlowEngine、执行槽和进程之间的关系见[AgentSession、FlowEngine 与本地资源调度](session-flow-engine-resource-subsystem-design.md)。最小 Operations/Infrastructure Port 见[运维与基础设施最小能力](operations-infrastructure-minimum-design.md)。

## 10. BND-OPS-001：运维边界

| 数据 | 协议 | 可靠性 |
|---|---|---|
| Trace | 本地 Span/Trace ID；OTLP Exporter 可选 | Exporter 不可用不阻塞 AgentRun |
| Metrics | 本地有界指标快照；OTLP/Prometheus Adapter 可选 | 可丢失瞬时样本，不得无界缓存 |
| Log | 本地滚动结构化日志；协议 stdout 场景只使用 stderr | 严格脱敏；容量和保留期有上限 |
| Health | 进程内 Health Port，对外映射 `/health/live`、`/health/ready` | 只反映健康，不直接修改 Run |
| Audit | 本地 SQLite append-only 审计记录；可选异步导出 | 安全事件必须具有稳定 ID 和完整因果链；OTLP 不是权威审计存储 |

`OperationContext` 使用 W3C `traceparent` 传播 Trace，并额外携带 correlation、causation、deadline 和 `TimeContext`。运维平台只能返回遥测接收结果和健康查询结果，不能调用内部对象推进 Run、Permit、ToolCall 或 Memory。

## 11. BND-INF-001：基础设施边界

Infrastructure Port 是代码级能力契约，不要求统一成网络 RPC：

```typescript
interface ClockPort {
  /** 返回 UTC 时间点；领域代码不得直接读取系统时钟。 */
  now(): TimePoint;
}

interface SecretResolverPort {
  /** 在当前执行信封作用域内解析 SecretHandle；明文不得进入日志和领域事件。 */
  resolve(handle: SecretHandle): Promise<ResolvedSecret>;
}

interface ArtifactPort {
  /** 保存有界流并返回不透明 ArtifactReference。 */
  put(request: PutArtifactRequest): Promise<ArtifactReference>;

  /** 在授权作用域内读取 Artifact；不得暴露物理路径或 Bucket。 */
  get(reference: ArtifactReference): AsyncIterable<Uint8Array>;
}
```

Repository、Transport、Process 和 Sandbox 采用相同规则：Kernel 定义 Port，Infrastructure Adapter 实现；Adapter 可以私有使用 SQLite、PostgreSQL、S3、NATS、Temporal、Docker 或 Firecracker，但这些类型不得进入 Kernel 契约。

## 12. 本地优先部署档案

| 边界 | 首版 Local Embedded | 可选 Local Sidecar | 后续 Distributed 触发条件 |
|---|---|---|---|
| EXT↔L1 | CLI 进程内 Gateway | Desktop Host ↔ JSONL Sidecar；Loopback HTTP/SSE 可选 | 出现远程客户端后再启用 HTTPS API Gateway |
| L1 内部 | 强类型 Port、本地队列、SQLite 事务 | 同左 | 需要跨实例耐久调度或多消费者事件时再评估 Temporal/Event Bus |
| L1↔L2 | 进程内调用 | stdio JSONL | Runtime Worker 跨主机或需要独立扩缩容时再启用 gRPC |
| PEP↔PDP | 进程内调用 | 同左 | 策略服务被多个独立系统共享时再启用 gRPC |
| L1↔L3 | 进程内调用 | 同左或 UDS | Tool Runtime 独立信任边界或扩缩容时再启用 gRPC |
| L3↔L4 | 进程内只读 Adapter 或子进程 JSONL | stdio/UDS | 强隔离要求超过本地进程能力时再启用 MicroVM/Vsock |
| Memory | 进程内 Port + SQLite/Artifact | 同左 | 多 Kernel 实例共享、独立治理或独立扩缩容时再服务化 |
| Operations | 本地日志、Trace ID、指标快照和 SQLite 审计 | 可选 OTLP Exporter | 集中运维平台接入后启用 OTLP Collector |

选择后续档案必须由新的架构变更记录说明触发条件、运维成本和回退路径，不能仅以“未来可能扩展”为理由提前引入。

## 13. 交付、顺序与重试矩阵

| 边界 | 交付语义 | 顺序 | 重试责任 | 失败后的权威确认方式 |
|---|---|---|---|---|
| EXT↔L1 幂等命令 | 本地重连可能重发，以 commandId 去重 | 单 commandId | Host/客户端有限重试 | `getRun` / 命令回执 |
| L1 本地调度 | SQLite 状态 + 启动恢复扫描 | 单 Run 状态机有序 | 本地 Scheduler 有限重试 | Run 状态 |
| L1↔L2 进程内命令 | 同调用栈返回 | 单 Attempt | 不自动重试非幂等执行 | Run/Attempt 状态 |
| L1↔L2 JSONL 命令 | 可能出现未知结果；幂等命令可重发 | 单 Attempt | Scheduler 按命令类别决定 | `inspectAttempt` + Run 状态 |
| L1↔L2 持久事件 | 至少一次；进度事件可有界丢失 | 单 Run/Attempt sequence | Runtime 重发未 Ack 的持久事件 | Event Journal |
| PEP↔PDP | 进程内判定；Permit 原子单次消费 | 单 ActionProposal | 不对未知判定自动放行 | PermissionRequest/Permit 状态 |
| L1↔L3 Tool | 同步工具直接返回；异步工具幂等受理 | 单 ToolCall sequence | 根据副作用等级决定 | `getToolCall` / Provider operation status |
| L3↔L4 Sandbox | 单连接帧有序 | 单 executionId | ToolRuntime；未知副作用不重放 | Sandbox/ToolCall 状态 |
| Memory | 本地事务；候选写入使用 candidateId 幂等 | 单 MemorySpace version | Memory Adapter | Candidate/MemoryVersion |
| Operations | 日志/指标尽力而为；安全审计本地耐久 | Trace/事件内因果顺序 | 可选 Exporter | 审计查本地 Store；遥测不参与领域正确性 |

系统不宣称端到端 exactly-once。首版正确性来自幂等受理、唯一所有者、本地事务、持久化状态查询、必要的事件去重、Permit 校验和未知副作用失败关闭。Lease fence 只在多 Worker 或崩溃接管档案启用。

## 14. 版本兼容与安全

- 首版 TypeScript Port 与 JSONL Schema 使用语义版本；不兼容变更提升主版本。
- 后续启用 Protobuf 时字段号永久保留；启用 REST 时使用主版本路径。
- JSONL `initialize` 首先协商 `protocolVersion`、能力和限制；不兼容立即关闭。
- 首版 Sidecar 不监听公网或局域网端口；Loopback HTTP 必须限制回环地址并使用本机随机凭据。
- 后续启用 gRPC、HTTPS 或 OTLP 跨主机通信时统一使用 mTLS；服务身份由平台签发，不使用用户 Token。
- Raw Token、Secret、Prompt、Memory 正文、工具参数和物理资源路径禁止进入错误、日志、Trace 和指标标签。
- 每个入口校验消息大小、Deadline、调用方服务身份、执行信封作用域和授权 epoch。

## 15. 步骤二确认清单

- [ ] 接受首版 Local Embedded/Sidecar 档案，不引入 Temporal、Event Bus 和内部 gRPC。
- [ ] 接受 L1↔L2 首版进程内调用，隔离时使用 stdio JSONL；gRPC 作为后续档案。
- [ ] 接受 L1 不直连 L4，首版统一通过 L3↔L4 `SandboxPort` 执行单次有界调用。
- [ ] 接受 Tool 有副作用时不承诺 exactly-once，并引入 `UNKNOWN_SIDE_EFFECT`。
- [ ] 接受运维首版使用本地日志、Trace ID、指标快照和耐久审计，OTLP 仅作为可选导出。
- [ ] 接受 Infrastructure Port 是代码契约，具体协议由 Adapter 私有。
- [ ] 接受组合式元数据、稳定错误和版本兼容规则。

本清单确认前，本文接口名称和签名仍是候选契约，不得用于生成实现代码或数据库迁移。
