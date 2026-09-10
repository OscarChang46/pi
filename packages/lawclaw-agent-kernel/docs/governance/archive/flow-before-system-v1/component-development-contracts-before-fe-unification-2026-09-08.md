<!-- 非规范历史：2026-09-08撤销独立协调组件前的契约快照。相对链接与行号属于原文路径，不用于现行开发。 -->

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

FE-SYS-1变更：系统FlowEngine契约见[系统协议](../layers/l1-control/components/flow-system-protocol.md)。本文件的FE-CON-1只约束ReAct业务适配；资源分配组件及其操作已删除，不再是框架开发要求。

ACR-2026-0011候选，不是已发布Schema或架构批准。BND文档继续拥有边界方向，本文件维护本轮字段与操作。FE-CON-1引用[FlowEngine第21章](../layers/l1-control/components/flow-engine.md)，不复制或修改用户已有文件。

## 公共类型

花括号为完整字段规格，`|`表示封闭联合、`[]`有序数组、null必需显式编码。除标注进程内回调/流外使用FE-C14N-1 JSON子集，拒绝未知字段、重复键、孤立代理项、浮点/非安全整数，深度≤32。不是可直接编译的TypeScript源码。

| 类型 | 完整语义 |
|---|---|
| Ref/Digest/Count/Millis/Bool | FE Ref/Digest/Counter/Millis；Bool为boolean；Count非负安全整数，Millis非负UTC毫秒 |
| Version/Text/Json | Version首版1.0.0；Text合法Unicode、UTF-8≤64KiB；Json为上限内JSON子集，不能代替明确Schema |
| Artifact | FE ArtifactRef；读取仍须授权，摘要不构成访问权 |
| RequestMeta | {protocolVersion:Version,requestId:Ref,correlationId:Ref,traceparent:Text,deadlineAtMs:Millis}；旧边界deadlineUtc由Adapter严格转换 |
| CommandMeta | RequestMeta+{commandId:Ref,idempotencyKey:Ref}；首版commandId=idempotencyKey，同操作重投不变；FE命令身份按FE公式 |
| TrustedScope | Host建立的进程内可信上下文，含executionEnvelopeRef与ScopedAdapter能力；网络认证后创建，JSON不能自行构造 |
| RunBudget/FrozenBindings/ExecutionClaim/RunSnapshot | 使用FE-CON-1精确定义，禁止同名简化副本 |
| Error | {code:ErrorCode,retryable:Bool,detailsRef:Ref\|null}；details只允许脱敏信息，不能透传原始异常 |
| ExecutionReceipt | {commandId:Ref,receiptRef:Ref,status:accepted/completed/unknown}；accepted是耐久受理，L2由L1命令记录提供，L3由ToolCall提供 |
| ExecutionQuery | {state:absent/pending/accepted/running/completed/failed/unknown/gone,result:ExecutionResult\|null}；completed/failed有result，其余null；不支持查询返回unknown |
| CancelExecutionResult | {commandId:Ref,state:requested/stopped/unknown}；stopped需停止证据，不以HTTP成功推定 |
| CancelReceipt | {runId:Ref,cancelEpoch:Count,terminal:Bool} |
| CommitReceipt | {transactionId:Ref,version:Count}；FE CommitRequest/CommitResult/CommitQuery/CommandRecord原样引用 |
| IngressEvent | FE RuntimeEvent去sequence，T1分配权威Run序号；L2片段index不是Run sequence |
| EventPage | {events:RuntimeEvent[],nextSequence:Count,earliestSequence:Count,hasMore:Bool}；按序升序，历史不足返回GONE |
| DescriptorPage | {items:DefinitionVersion[],nextCursor:Ref\|null}；游标由服务生成，绑定scope/filter版本 |
| AuditPage | {events:AuditEvent[],nextSequence:Count,hasMore:Bool} |
| MetricPoint | 运维依赖TelemetrySignal的快照映射：gauge保留其payload全部字段；counter将delta累加为value，保留name/component/sampledAtMs；operation不放入本快照 |
| MetricName | queue_depth/active_runs/resource_used/durable_bytes/scan_lag_ms/open_incidents/conflict/commit/telemetry_drop/permission_bypass/effect_unknown；各kind合法子集见运维依赖 |
| ComponentCode | document-manifest.yaml中固定ID，新值需契约变更 |
| PhaseCode/ResultCode | phase=validate/read/commit/dispatch/execute/recover/cleanup；result=ok/rejected/failed/unknown/dropped |
| HealthCode | state_unavailable/clock_untrusted/audit_unavailable/pdp_unavailable/runtime_unavailable/capacity_exhausted/storage_protected/exporter_degraded/isolation_unavailable |
| SecretPurpose | model/tool/sandbox |
| CandidateStatus/ApprovalState/ScopePhase/ProcessState | 对应组件字段的封闭联合，不允许任意字符串 |
| BoundedStream/AsyncStream | 进程内异步迭代接口，必须有cancel及容量上限；跨进程按Transport帧转换 |

所有边界操作组合(meta,trustedScope,payload)：查询RequestMeta、写CommandMeta；返回成功值或Error。纯内部函数只收冻结值，不使用实时时钟。协议Method为本文件操作的封闭完全限定名`组件ID.operation`，MethodPayload/MethodResult严格按操作绑定，不能反射任意方法。初始化和公开health只返回粗粒度信息，其他读写/审批/管理需对应Scope能力。

## 错误、幂等与容量

ErrorCode全集：PROTOCOL_UNSUPPORTED、SCHEMA_INVALID、FRAME_LIMIT、ACCESS_DENIED、NOT_FOUND、GONE、IDEMPOTENCY_CONFLICT、VERSION_CONFLICT、STALE_SNAPSHOT、STALE_CLAIM、INVALID_STATE、SCOPE_MISMATCH、DIGEST_MISMATCH、BINDING_MISMATCH、EVENT_MISMATCH、SEQUENCE_GAP、PARSE_CONFLICT、NO_ROUTE、ROUTE_UNAVAILABLE、RUNTIME_UNAVAILABLE、CONTEXT_LIMIT、OUTPUT_LIMIT、RESOURCE_EXHAUSTED、DEADLINE_EXCEEDED、CANCELLED、DEPENDENCY_UNAVAILABLE、TRANSPORT_UNAVAILABLE、PERMISSION_UNAVAILABLE、ACTION_APPROVAL_REQUIRED、PERMIT_EXPIRED、PERMIT_REVOKED、PERMIT_CONSUMED、AUDIT_UNAVAILABLE、CLOCK_UNTRUSTED、SECRET_UNAVAILABLE、ISOLATION_UNAVAILABLE、UNKNOWN、INTERNAL。

仅DEPENDENCY_UNAVAILABLE/TRANSPORT_UNAVAILABLE的只读查询可retryable=true，其他false。VERSION_CONFLICT需要丢弃旧候选重算，不能原写重放；UNKNOWN只查事实。Provider AUTH_FAILED/RATE_LIMITED等是AdapterFault分类，不透传原异常。

写入唯一键=(可信scopeKey,组件ID,commandId)，摘要H(操作名及语义payload)，排除trace/request/当前查询截止。重复回执优先于expectedVersion检查，同键异载荷冲突。FE命令身份不改写。Run相关回执保留终态后30天，非终态/open incident不删；其他聚合至少30天且活跃引用解除后。过期ID保留不可重用墓碑，墓碑计入配额，满时拒绝新工作。

Kernel侧共用FE21.8.1/21.9首版档案：并发4硬16、活动4096、提示256硬4096、模型16轮/工具32/Child2/深度1；上下文1MiB、input32768+reserve4096、输出256KiB、事件/命令64KiB；Run10分钟/模型120秒/工具60秒/清理30秒；读/提交确认最多3次100/200/400ms，模型工具自动执行重试0。now>=deadline停止新业务，下游deadline只缩短。

Kernel需要基础设施提供统一容量快照、配额保护与引用保留保证；所需限额及依赖条件放在[Infrastructure依赖要求](../layers/infrastructure-plane/kernel-dependencies.md)，不在本轮设计具体存储/GC机制。

## 协作与事务

Host FlowCoordinator是装配职责，不是新聚合：加载Run冻结输入，组Context，调用Core、T2提交后领取命令；模型经业务Activity适配→L2 AgentRuntime→公共AgentAdapterPort，权限→PDP，工具→L3，Child→SubagentCoordinator。FE中的ModelInvocationPort为概念门面，不得把Pi私有Port导出公共contracts。L2仅执行一个已提交模型步骤，不拥有第二套ReAct规则。

RunRegistry拥有T1/T2/claim；Scheduler决定何时调用。首版本地claim30秒/10秒续期，不引入跨机租约服务。

辅助Run操作：ensureRunnable({runId,basisVersion})->{eventId:Ref|null}，原子去重wake；quarantineHead({runId,expectedVersion,claim,eventId,rejectionCode})->{version:Count}，复核拒绝证明后原子隔离/前进游标/增版本，无业务命令；scan({cursor:Ref|null,limit:Count})->{runIds:Ref[],nextCursor:Ref|null}，limit1—256；resolveIncident({incidentRef,expectedVersion,resolutionId,evidenceRef,knownEffect})->{version:Count,status:resolved}，受控恢复身份、可信执行回执、冲突不覆盖、终态Run不变；Incident字段沿用FE21.8.1。

工具RECEIVED→AUTHORIZED→STARTED→SUCCEEDED/FAILED/UNKNOWN，consume后需authorizeStart，仅STARTED CAS胜者调用L4。安全与Tool独立聚合提交，不包外部I/O。首版本地authorizeStart共享SQLite权威读取Run取消/claim与Permit，事务仅写安全授权和必要审计；跨库/跨机另行ACR，不能读旧缓存放行。authorizeStart之前撤销/取消阻止启动，之后为在途取消。STARTED后无结果即UNKNOWN，即使可能还没发出也不自动再执行。

## Kernel观测责任

UNKNOWN或权限旁路新增1条立即高优先级；队列>80%持续60秒、5分钟至少100提交且冲突率>20%、遥测drop>1%持续5分钟、扫描滞后>5秒持续10秒告警。Owner分别为组件实施/安全/存储运维负责人；通知渠道故障仍保留Incident，安全阻断不依赖告警送达。

普通日志7天且50MiB，内存遥测60秒/1024条/1MiB，诊断7天，安全/幂等至少30天并按引用延长。诊断只版本、阶段、计数、错误、受控Ref；无Prompt/参数/digest/Permit/路径。指标无动态ID标签。

## 分组件字段与操作

<a id="protocol-facade"></a>

### L1-CMP-001 protocol-facade

分类：契约门面。

数据：ConnectionState={connectionId:Ref,version:Version,capabilities:Ref[],maxFrameBytes:Count,lastAck:Count}; 生命周期 NEW/READY/DRAINING/CLOSED。连接状态不持久化。

操作：initialize({versions:Version[],capabilities:Ref[],maxFrameBytes:Count})->{version:Version,capabilities:Ref[],maxFrameBytes:Count}; call({method:Method,payload:MethodPayload})->MethodResult；Method/载荷逐项复用 Gateway、审批、健康和生命周期操作，禁止任意字符串反射。

流程/恢复/验收见[组件设计](../layers/l1-control/components/protocol-facade.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="agent-system-gateway"></a>

### L1-CMP-002 agent-system-gateway

分类：契约门面。

数据：StartIntent={agentId:Ref,agentVersion:Count,sessionId:Ref,sessionVersion:Count,goalRef:Artifact,routeProposalRef:Ref,budget:RunBudget,deadlineAtMs:Millis}; AdmissionReceipt={runId:Ref,version:Count,acceptedAtMs:Millis}。不持久化 Gateway 私有事务。

操作：startRun(StartIntent)->AdmissionReceipt; getRun({runId:Ref})->RunSnapshot; cancelRun({runId:Ref})->{runId:Ref,cancelEpoch:Count,terminal:Bool}; readRunEvents({runId:Ref,afterSequence:Count,limit:Count})->EventPage; listAgents({cursor:Ref|null,limit:Count})->DescriptorPage。

流程/恢复/验收见[组件设计](../layers/l1-control/components/agent-system-gateway.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="agent-registry"></a>

### L1-CMP-003 agent-registry

分类：独立组件。

数据：DefinitionVersion={agentId:Ref,version:Count,descriptorRef:Artifact,capabilities:Ref[],personaRef:Artifact,constraintRef:Ref,publishedAtMs:Millis}; DefinitionHead={agentId:Ref,version:Count,state:active|retired}。

操作：publish({definition:DefinitionVersion,expectedVersion:Count})->{agentId:Ref,version:Count}; retire({agentId:Ref,expectedVersion:Count})->DefinitionHead; get({agentId:Ref,version:Count|null})->DefinitionVersion; list({capabilities:Ref[],cursor:Ref|null,limit:Count})->DescriptorPage。

流程/恢复/验收见[组件设计](../layers/l1-control/components/agent-registry.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="capability-router"></a>

### L1-CMP-004 capability-router

分类：独立组件。

数据：RouteInput={requirements:Ref[],definitionVersions:Ref[],capabilitySnapshotRef:Ref,envelopeRef:Ref}; RouteProposal={proposalId:Ref,candidates:RouteCandidate[],expiresAtMs:Millis}; RouteCandidate={agentId:Ref,agentVersion:Count,adapterBindingRef:Ref,satisfied:Ref[],preferenceRank:Count}。

操作：propose(RouteInput)->RouteProposal；由Gateway调用，读取AgentRegistryQueryPort与AdapterCapabilityPort；RunRegistry仅验证并冻结首个候选，不执行另一套排序。

流程/恢复/验收见[组件设计](../layers/l1-control/components/capability-router.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="session-manager"></a>

### L1-CMP-005 session-manager

分类：独立组件。

数据：SessionRecord={sessionId:Ref,version:Count,agentId:Ref,state:active|archived,parent:{sessionId:Ref,version:Count}|null,headRef:Ref}; SessionDelta={deltaId:Ref,sourceRunId:Ref,slice:TranscriptSlice}; TranscriptSlice={firstSequence:Count,lastSequence:Count,sourceHeadRef:Ref,commitIds:Ref[],turns:HistoryTurn[]}; HistoryTurn={modelCommandId:Ref,assistant:TranscriptEntry,results:TranscriptEntry[]}；TranscriptEntry复用FE；SessionSnapshot沿用FE-CON-1。

操作：create({sessionId:Ref,agentId:Ref})->SessionRecord; append({sessionId:Ref,expectedVersion:Count,delta:SessionDelta})->SessionRecord; branch({parentId:Ref,parentVersion:Count,childId:Ref})->SessionRecord; archive({sessionId:Ref,expectedVersion:Count})->SessionRecord; snapshot({sessionId:Ref,version:Count})->SessionSnapshot。

流程/恢复/验收见[组件设计](../layers/l1-control/components/session-manager.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="run-registry"></a>

### L1-CMP-006 run-registry

分类：独立组件。

数据：直接复用FE-CON-1 RunSnapshot/AdvanceInput/AdvanceDecision/ExecutionClaim/CommandRecord；附表Inbox、DeferredReceipt、CommitReceipt、Outbox、Transcript、LateFact、Incident、AdmissionIndex。主键均包含授权存储scopeKey及runId；内部scopeKey由ScopedRepository注入，不进入Core。

操作：admit(StartIntent)->AdmissionReceipt; admitEvent({event:IngressEvent})->{eventId:Ref,sequence:Count|null,status:admitted|deferred|duplicate|late}; load({runId:Ref})->AdvanceInput; commit(CommitRequest)->CommitResult; claim({runId:Ref,ownerId:Ref})->ExecutionClaim; renew({runId:Ref,claim:ExecutionClaim})->ExecutionClaim; takeover({runId:Ref,expectedFence:Count,ownerId:Ref})->ExecutionClaim; cancel({runId:Ref})->CancelReceipt; queryCommit/queryCommand沿用FE-CON-1；ensureRunnable、quarantineHead、scan和resolveIncident见共同事务协议。

流程/恢复/验收见[组件设计](../layers/l1-control/components/run-registry.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="run-scheduler"></a>

### L1-CMP-007 run-scheduler

分类：独立组件。

数据：WakeHint={runId:Ref,basisVersion:Count}; DispatchTicket={runId:Ref,claim:ExecutionClaim,resourceHandle:Ref,runtimeRef:Ref}; 仅队列/去重set/游标在内存，claim权威在RunRegistry。

操作：notify({runId:Ref,basisVersion:Count})->{queued:Bool}; tick({nowMs:Millis})->{scanned:Count,queued:Count}; drain({deadlineAtMs:Millis})->{remaining:Count}；调用RunQuery/RunExecution、ExecutionResource、RuntimeDispatch Port。

流程/恢复/验收见[组件设计](../layers/l1-control/components/run-scheduler.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="context-engine"></a>

### L1-CMP-009 context-engine

分类：独立组件。

数据：ContextRequest={bindings:FrozenBindings,sourceRunVersion:Count,transcriptHeadRef:Ref,budget:RunBudget,sourceSpec:ContextSourceSpec}; ContextSourceSpec={sourceSpecId:Ref,memory:MemorySource[],estimatorVersion:Ref,modelWindowVersion:Ref,modelWindowTokens:Count,formatVersion:Ref}; MemorySource={spaceId:Ref,spaceVersion:Count,queryRef:Artifact,indexVersion:Ref,algorithmVersion:Ref,epoch:Count,required:Bool}; ReductionEntry={sourceRef:Ref,decision:keep|drop,reason:mandatory|recent|budget|scope|unavailable}; ContextFrame沿用FE-CON-1；AssemblyReceipt={frame:ContextFrame,sourceSpec:ContextSourceSpec,traceRef:Artifact,degradedSources:Ref[]}。

操作：assemble(ContextRequest)->AssemblyReceipt; estimate({contentRef:Artifact,estimatorVersion:Ref})->{tokens:Count}由ContextEstimatorPort提供；ContextAssemblyPort为ContextPort的同一用例适配名。

流程/恢复/验收见[组件设计](../layers/l1-control/components/context-engine.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="memory-manager"></a>

### L1-CMP-010 memory-manager

分类：独立组件。

数据：MemoryEntry={entryId:Ref,version:Count,contentRef:Artifact,sourceRef:Ref,sensitivity:public|scoped|restricted,supersedes:Ref|null}; MemoryCandidateInput={candidateId:Ref,spaceId:Ref,entry:MemoryEntry}; MemoryCandidate=MemoryCandidateInput+{status:pending|approved|rejected|applied,version:Count}; MemoryView={viewId:Ref,spaceId:Ref,version:Count,epoch:Count,indexVersion:Ref,algorithmVersion:Ref,queryDigest:Digest,entries:MemoryEntry[]}。

操作：query({runId:Ref,source:MemorySource,limit:Count})->MemoryView; submit({runId:Ref,candidate:MemoryCandidateInput})->MemoryCandidate; apply({runId:Ref,candidateId:Ref,expectedVersion:Count,claim:ExecutionClaim})->{entryId:Ref,version:Count}; inspect({candidateId:Ref})->MemoryCandidate；query也是有安全回执的CommandMeta操作，apply内部请求PDP而非接受客户端自签Permit。

流程/恢复/验收见[组件设计](../layers/l1-control/components/memory-manager.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="subagent-coordinator"></a>

### L1-CMP-013 subagent-coordinator

分类：独立组件。

数据：ScopeLink={scopeId:Ref,parentRunId:Ref,childRunId:Ref,commandId:Ref,spec:ChildSpec,reservationId:Ref,admission:ChildAdmissionBindings,permissionCommandId:Ref,permitRef:Ref|null,phase:reserved|session_ready|authorized|admitted|rejected|joined|cancel_pending|incident,version:Count}; RootChildPool与Reservation见预算闭环。

操作：create({command:EngineCommand,claim:ExecutionClaim})->{childId:Ref,phase:ScopePhase}; join({parentRunId:Ref,childId:Ref})->{state:waiting|completed|failed|cancelled,resultRef:Artifact|null}; cancelChildren({parentRunId:Ref,cancelEpoch:Count})->{pending:Count}; inspect({scopeId:Ref})->ScopeLink。

流程/恢复/验收见[组件设计](../layers/l1-control/components/subagent-coordinator.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="agent-runtime-loop"></a>

### L2-CMP-001 agent-runtime-loop

分类：独立组件。

数据：ModelStepRequest={command:EngineCommand,claim:ExecutionClaim,frame:ContextFrame,catalogRef:Ref,adapterBindingRef:Ref}; StepProjection={commandId:Ref,phase:received|calling|reporting|finished|unknown,ackEventId:Ref|null}。权威命令在L1，L2投影可丢弃。

操作：dispatch(ModelStepRequest)->ExecutionReceipt; inspect({commandId:Ref})->ExecutionQuery; cancel({commandId:Ref})->CancelExecutionResult；出站AgentAdapterPort和RuntimeEventPort；resume只查询/回传既有结果，不隐式发新模型请求。

流程/恢复/验收见[组件设计](../layers/l2-cognitive/components/agent-runtime-loop.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="parser-normalizer"></a>

### L2-CMP-002 parser-normalizer

分类：内部职责。

数据：NormalizedChunk={commandId:Ref,index:Count,kind:text|candidate|usage|end,payloadRef:Artifact|null}; ParseWindow={nextIndex:Count,bytes:Count,ended:Bool}; ValidatedCompletion={assistantTurnRef:Artifact,output:ModelOutput,usage:Usage}。

操作：begin({commandId:Ref,catalogRef:Ref,maxOutputBytes:Count})->{windowId:Ref}; push({windowId:Ref,chunk:NormalizedChunk})->{acceptedIndex:Count}; finish({windowId:Ref})->ValidatedCompletion; abort({windowId:Ref})->{closed:Bool}；这些是L2内部方法，不能供外部插入安全事件。

流程/恢复/验收见[组件设计](../layers/l2-cognitive/components/parser-normalizer.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="agent-adapter-boundary"></a>

### L2-CMP-003 agent-adapter-boundary

分类：契约门面。

数据：AdapterRequest={commandId:Ref,frame:ContextFrame,catalogRef:Ref,deadlineAtMs:Millis,maxOutputBytes:Count}; Usage={inputTokens:Count|null,outputTokens:Count|null,source:provider|unknown}; AdapterFault={code:AUTH_FAILED|RATE_LIMITED|TIMEOUT|PROTOCOL_INVALID|OUTPUT_LIMIT|UNAVAILABLE,effect:Effect}。

操作：invoke(AdapterRequest)->AsyncStream<NormalizedChunk>; cancel({commandId:Ref})->CancelExecutionResult；异步流结束必须包含一个end或一个AdapterFault，不能以EOF代替成功。ModelInvocationPort只作为PiAdapter私有协作者名称。

流程/恢复/验收见[组件设计](../layers/l2-cognitive/components/agent-adapter-boundary.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="pi-agent-adapter"></a>

### L2-CMP-004 pi-agent-adapter

分类：独立组件。

数据：私有PiCallState={commandId:Ref,providerRequestId:Ref|null,phase:prepared|sent|streaming|ended|unknown,bytes:Count}; Kernel侧只返回AdapterRequest/NormalizedChunk/AdapterFault，不导出PiCallState。

操作：invoke/cancel严格实现AgentAdapterPort；私有send使用ModelEgress请求；实现绑定当前仓库Pi workspace公开API，开发前以node_modules真实类型校验，禁止动态类型猜测或修改生成模型表。

流程/恢复/验收见[组件设计](../layers/l2-cognitive/components/pi-agent-adapter.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="tool-catalog-router"></a>

### L3-CMP-001 tool-catalog-router

分类：独立组件。

数据：ToolDescriptor={toolId:Ref,version:Count,schemaRef:Artifact,descriptionRef:Artifact,risk:read|write|restricted,executionKind:provider|sandbox,routeRef:Ref,resourceScopeRef:Ref}; CatalogSnapshot={catalogRef:Ref,version:Count,descriptors:ToolDescriptor[],digest:Digest}。

操作：publish({expectedVersion:Count,descriptors:ToolDescriptor[]})->CatalogSnapshot; visible({scopeRef:Ref,version:Count})->CatalogSnapshot; resolve({catalogRef:Ref,toolDescriptorRef:Ref})->{descriptor:ToolDescriptor,routeRef:Ref}。

流程/恢复/验收见[组件设计](../layers/l3-tool-runtime/components/tool-catalog-router.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="tool-call-runtime"></a>

### L3-CMP-002 tool-call-runtime

分类：独立组件。

数据：ToolCall={toolCallId:Ref,commandId:Ref,originAttemptId:Ref,runId:Ref,proposal:ActionProposal,permitRef:Ref,routeRef:Ref,phase:received|authorized|started|succeeded|failed|unknown|cancelled,version:Count,receiptRef:Ref|null,startGrantRef:Ref|null,resultRef:Artifact|null,effect:Effect}；toolCallId=commandId，大小写映射至FE阶段。

操作：dispatch({command:EngineCommand,claim:ExecutionClaim})->ExecutionReceipt; inspect({commandId:Ref})->ExecutionQuery; cancel({commandId:Ref})->CancelExecutionResult；输出ToolObserved先持久后发L1。

流程/恢复/验收见[组件设计](../layers/l3-tool-runtime/components/tool-call-runtime.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="tool-execution-guard"></a>

### L3-CMP-003 tool-execution-guard

分类：内部职责。

数据：GuardInput={commandId:Ref,permitRef:Ref,binding:ActionBinding,actualArgumentsRef:Artifact,actualRouteRef:Ref,claim:ExecutionClaim}; GuardReceipt={permitReceiptRef:Ref,startGrantRef:Ref|null}。无本地许可缓存。

操作：consume(GuardInput)->PermitReceipt; authorizeStart({input:GuardInput,receiptRef:Ref})->StartGrant；ToolCallRuntime分别在RECEIVED和AUTHORIZED调用。

流程/恢复/验收见[组件设计](../layers/l3-tool-runtime/components/tool-execution-guard.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="permission-decision-engine"></a>

### SEC-CMP-001 permission-decision-engine

分类：独立组件。

数据：PolicySnapshot={policyRef:Ref,epoch:Count,scopeRef:Ref,denyActions:ActionKind[],allowActions:ActionKind[],askActions:ActionKind[],resourceLimitsRef:Ref,expiresAtMs:Millis}; ActionKind=tool.execute/child.create/memory.write/memory.read；DecisionRequest={action:SecurityAction,binding:SecurityBinding,approvalRef:Ref|null}; Decision={kind:allow,permitRef:Ref,expiresAtMs:Millis}|{kind:ask,approvalRef:Ref}|{kind:deny,code:ErrorCode}；SecurityAction与当前授权状态见下文“授权闭环”。

操作：decide(DecisionRequest)->Decision; inspect({decisionCommandId:Ref})->Decision；PolicySnapshotPort只读取外部已编译快照；内部evaluate(proposal,policy,verifiedEnvelope)->allow|ask|deny无I/O。

流程/恢复/验收见[组件设计](../layers/security-plane/components/permission-decision-engine.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="execution-permit"></a>

### SEC-CMP-002 execution-permit

分类：独立组件。

数据：PermitIssueInput={binding:SecurityBinding,expiresAtMs:Millis,decisionCommandId:Ref}; PermitRecord={permitRef:Ref,binding:SecurityBinding,expiresAtMs:Millis,state:issued|consumed|revoked|expired,commandId:Ref|null,version:Count}; PermitReceipt={receiptRef:Ref,permitRef:Ref,commandId:Ref,bindingDigest:Digest}; StartGrant={grantRef:Ref,commandId:Ref,claimFence:Count,authorizedAtMs:Millis}；私有GrantRecord绑定见授权闭环。

操作：issue(PermitIssueInput)->PermitRecord; consume({permitRef:Ref,commandId:Ref,binding:SecurityBinding})->PermitReceipt; authorizeStart({receiptRef:Ref,commandId:Ref,binding:SecurityBinding,claim:ExecutionClaim,executorRef:Ref})->StartGrant; revoke({permitRef:Ref,expectedVersion:Count})->PermitRecord; inspect({permitRef:Ref})->PermitRecord。

流程/恢复/验收见[组件设计](../layers/security-plane/components/execution-permit.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="pep-enforcement"></a>

### SEC-CMP-003 pep-enforcement

分类：契约门面。

数据：SecurityBinding={runId:Ref,agentId:Ref,envelopeRef:Ref,policyEpoch:Count,kind:ActionKind,actionDigest:Digest,targetDigest:Digest,resourceScopeRef:Ref}; ActionBinding为SecurityBinding精确别名；AuthorizedAction={proposal:ActionProposal,permitRef:Ref,binding:SecurityBinding}仅工具使用。

操作：requestDecision(DecisionRequest)->Decision在L1；enforce通过PermitService.consume/authorizeStart；受保护动作类型为tool.execute、memory.write、child.create及跨scope敏感read，各自绑定实际目标，不共用一次Permit。

流程/恢复/验收见[组件设计](../layers/security-plane/components/pep-enforcement.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

<a id="approval-bridge"></a>

### SEC-CMP-004 approval-bridge

分类：独立组件。

数据：PermissionRequest={approvalRef:Ref,proposalId:Ref,actionDigest:Digest,runId:Ref,envelopeRef:Ref,policyEpoch:Count,expiresAtMs:Millis,externalRef:Ref|null,state:pending|approved|denied|expired|cancelled,version:Count}; Callback={approvalRef:Ref,actionDigest:Digest,decision:approve|deny,externalDecisionId:Ref}。

操作：submit({approvalRef:Ref})->{externalRef:Ref|null,state:ApprovalState}; decide(Callback)->{approvalRef:Ref,state:ApprovalState,version:Count}; inspect({approvalRef:Ref})->PermissionRequest; cancel({approvalRef:Ref})->{state:ApprovalState}。

流程/恢复/验收见[组件设计](../layers/security-plane/components/approval-bridge.md)。服务决定初始状态；issue/submit请求不得自选已批准或已生效状态。

## 范围外依赖的类型来源

ExecutionResult/ExecutionLimits/ProviderReceipt/ExecutionPlan由[L4依赖要求](../layers/l4-execution-runtime/kernel-dependencies.md)定义为Kernel所需边界，具体执行器实现不在本轮。Artifact、Time、Secret、Capacity调用条件见[基础设施目录](../layers/infrastructure-plane/kernel-dependencies.md)；TelemetryRecord/MetricSnapshot/AuditEvent等见[运维目录](../layers/operations-plane/kernel-dependencies.md)。不为外部系统建立本轮待开发任务。

## 授权闭环（R1，替代首轮工具专用DecisionRequest）

FE ActionProposal保持不变，SecurityAction是安全内部封闭联合：

| kind | 完整payload |
|---|---|
| tool.execute | {proposal:ActionProposal} |
| child.create | {parentRunId:Ref,childId:Ref,originCommandId:Ref,spec:ChildSpec,admission:ChildAdmissionBindings,reservationId:Ref} |
| memory.write | {spaceId:Ref,candidateId:Ref,expectedVersion:Count,entry:MemoryEntry} |
| memory.read | {source:MemorySource,limit:Count} |

SecurityAction={kind:ActionKind,payload:对应精确类型}。工具actionDigest仍用FE公式；其他kind使用H({kind,payload})。targetDigest=H({kind,resourceScopeRef,payload})，资源范围来自可信描述/Space/ChildSubset，不从模型自签。SecurityBinding的run/agent/envelope/epoch均由当前Run与可信授权状态得到。策略规则按ActionKind精确匹配，deny优先→资源子集检查→ask→显式allow→默认deny；不能按自由工具名或不透明Ref猜规则。

非工具操作权限请求ID=`perm:`+SHA256(FE-C14N-1({originCommandId,kind,actionDigest}))，执行授权消费仍绑定originCommandId，安全服务内部持久回执。Memory query使用CommandMeta，重复同查询只复用已生成且仍可访问的View引用；每次释放内容前复核当前授权状态，撤销后返回拒绝而不重返缓存正文。

首版Child/Memory的Ask确定返回ACTION_APPROVAL_REQUIRED并记录拒绝执行结果，不在这些用例增加审批等待状态，也不发出工具型ApprovalResolved；调用方完成外部批准、由可信Host更新授权状态后另发新命令。此为首版受限授权行为，不取消工具Ask/ApprovalBridge能力。Child Ask/Deny/Unavailable统一耐久记ScopeLink=rejected以及ChildAdmissionOutcome，不创建Run；Memory read/write Ask/Deny不读正文/写Entry，只返回稳定错误。新的动作不能借复用旧Permit绕过此要求。

Memory apply在MemoryManager内部加载可信Run与当前claim，校验请求claim属于同Run；PDP→consume→authorizeStart后以原command事务CAS写Entry。query读也加载当前Run执行资格，不允许借历史终态Run开启新敏感读取；普通终态结果读取经Gateway授权查询，与新的Memory检索分开。Memory技术查询请求的nonce不是Authority，不能通过任意runId提升权限。

### 当前授权状态与撤销依赖

Security拥有技术授权状态投影 `AuthorizationState={envelopeRef:Ref,scopeRef:Ref,epoch:Count,state:active|revoked,policyRef:Ref,validUntilMs:Millis,version:Count,sourceReceiptRef:Ref}`，不拥有外部身份规则。可信Host通过 `installAuthorization({expectedVersion:Count,state:AuthorizationState})->{version:Count}` 安装外部已验证快照；新建version=0，后续只接受epoch不减且版本CAS。同epoch异内容拒绝。`invalidateAuthorization({envelopeRef,expectedVersion,newEpoch,sourceReceiptRef})->{version:Count}` 原子置revoked。接口只对Host服务能力开放，JSON身份不能调用。

本地安装/失效事务与authorizeStart在同一权威本地安全读取序列上：失效提交先发生则不能签发/启动。远端策略改变只有Host收到本地失效确认后才能宣称此Kernel撤销生效；不能承诺未同步远端更改瞬时生效。Host先失效旧状态再安装新epoch策略，间隔期间失败关闭；授权源连接丢失或无法确认时Host必须先失效，validUntil也限制旧状态最长30秒。Provider在途动作不可瞬间撤回。所需Host通知保证放[基础设施依赖要求](../layers/infrastructure-plane/kernel-dependencies.md)，不实现RBAC系统。

Permit初始version=0、state=issued、commandId=null，由issue生成permitRef。首次consume/revoke/显式expire各增version1；同命令回执查询不增加；consume后可revoke，不能回到issued。授权/撤销任意读取失败禁止新grant。

授权新鲜度续期独立于策略epoch：Host调用`renewAuthorization({envelopeRef:Ref,expectedVersion:Count,epoch:Count,validUntilMs:Millis,sourceReceiptRef:Ref})->{version:Count}`。仅对state=active且epoch相同的记录，以可信新来源回执证明策略/Scope/状态未变后CAS续期；可改的只有validUntilMs、sourceReceiptRef及version+1，validUntilMs>now且≤now+30秒。不能改policyRef/scopeRef/state，不得复活revoked；重复相同command同输入返回原回执。过期到续期确认的间隔不授权新动作；续期成功无需改变Run冻结policy epoch。`installAuthorization`同epoch异内容拒绝规则不用于该独立续期操作。K-TC-07增加“epoch7正常续期保持7且Permit绑定不变”“改scope续期拒绝”“已撤销续期拒绝”三分支。

GrantRef对应安全私有 `GrantRecord={grant:StartGrant,ownerId:Ref,attemptId:Ref,fence:Count,executorRef:Ref,bindingDigest:Digest,receiptRef:Ref}`。L3 STARTED CAS必须比较这组身份与当前调度claim，使用正确executor的内部句柄；旧grant不可给新owner使用。接管后若尚未STARTED须当前claim重新authorizeStart，仍复核Permit有效期；若已STARTED只查询。L4只见受控ExecutionPlan和不透明grantRef，不需接触Host原始身份。

## Child受理、预算与取消闭环（R1）

`ChildAdmissionBindings={agentId:Ref,agentVersion:Count,sessionId:Ref,sessionVersion:Count,routeProposalRef:Ref,routeSnapshotRef:Ref}`。首版Child沿用Parent冻结Agent/Route版本，默认同Session冻结版本只读，不靠最新路由选择；显式隔离分支时childSessionId=`cs:`+SHA256({parentRunId,childId})并在Scope保存确切版本。父路由引用是已冻结快照时，不重新要求30秒Proposal新鲜度，但当前安全/能力须复核。

`ChildAdmissionRequest={childId:Ref,parentRunId:Ref,parentClaim:ExecutionClaim,expectedParentCancelEpoch:Count,originCommand:EngineCommand,reservationId:Ref,admission:ChildAdmissionBindings,permitReceiptRef:Ref,startGrantRef:Ref}`；RunRegistry内部`admitChild(ChildAdmissionRequest)->AdmissionReceipt`，不是Gateway普通start。原command必须为CreateChildRun且与childId/spec一致，属于已提交Outbox；在受理事务权威检查Parent当前claim/未取消/非终态、当前epoch/grant身份、Scope预留、冻结绑定，原子插入以childId为runId的Run与受理索引/wake。该事务只写Child Run，不修改Scope聚合；预留已耐久、不可退还，查询即可验证。

ScopeLink保存完整admission及稳定permissionCommandId。reserved→session_ready→authorized→admitted→joined；reserved/session_ready/authorized遇Ask/Deny/失效→rejected。已受理后只按Child状态join/cancel，不能把网络超时改rejected。每个阶段按同Scope version CAS、查询原childId/command/审批回执恢复，不能生成第二Child。

`ChildAdmissionOutcome={childId:Ref,parentRunId:Ref,originCommandId:Ref,outcome:admitted|rejected,reason:ErrorCode|null,version:Count}` 由SubagentCoordinator耐久保存且同事务写通知outbox；rejected必须先经失效受理许可/存储写屏障确认原Child未受理，不能凭一次absent拒绝迟提交Child。此可信来源可产生FE ChildCompleted(failed,resultRef=null)，causationId=原CreateChildRun.commandId；RunRegistry T1允许以该拒绝凭证而非不存在的Child Run终态校验。通知重投不重复消费。

**预算明确采用独立Child池，不伪称Run.maxTurns是全树总额。** `RootChildPool={rootRunId:Ref,version:Count,limit:{turns:Count,tools:Count,children:Count},reserved:{turns:Count,tools:Count,children:Count}}`由Scope拥有，Root受理时冻结；首版默认Child池turns=16/tools=32/children=2，硬上限64/128/8。Root自身Run预算独立，所以默认全树模型最大32轮、工具64次、总Child2；实际仍受Deadline/并发约束。预算展示须同时暴露Root与Child池，不把16显示为全树总轮数。

`Reservation={reservationId:Ref,originCommandId:Ref,childId:Ref,rootRunId:Ref,turns:Count,tools:Count,children:Count=1,poolVersion:Count}`；每个Child（含更深后代）独立从同RootChildPool扣其完整maxTurns/maxToolCalls及1个Child名额，按originCommandId唯一，在一个Scope事务CAS比较sum(reserved)+request≤limit。上下文bytes/token等为每次上限子集，不相加。另要求Child预算≤父冻结上限，且受理时Child maxTurns≤父maxTurns-turnsReserved、maxToolCalls≤父maxToolCalls-toolsReserved；父继续执行使用自身余额，不转让或双写FE RunUsage。首版预留不退还，失败/Join不增加额度。Child数还遵守FE当前Run childrenReserved/maxChildren与深度。

Parent逻辑Cancelled与Scope清理完成为不同事实：Core按FE先提交Cancelled+CancelOutstanding；Host CommandDispatcher是该命令唯一消费者，依次请求原模型/工具cancel与SubagentCoordinator.cancelChildren并保存CleanupRecord。`CleanupRecord={runId:Ref,commandId:Ref,deadlineAtMs:Millis,state:pending|done|incident,pendingChildren:Ref[],pendingExecutions:Ref[]}`独立于Run终态。所有后代新授权/受理还必须检查祖先cancel栅栏，不能等待异步消息才阻止新工作。每秒扫描非done Cleanup/Scope；30秒未清理项转incident并保留受控恢复责任。只有Scope cleanup=done才承诺活动Child为0；Run终态本身只保证不再授权新业务，不能宣称在途物理动作已停止。

## Session与Context冻结闭环（R1）

HistoryTurn的assistant必须FE kind=assistant且commandId=modelCommandId；其Artifact为完整规范助手消息。规范消息内容 `{content:Block[],stopReason:answer|tools|child}`，Block封闭为 `{kind:text,text:Text}`、`{kind:tool,proposal:ActionProposal}`、`{kind:child,childId:Ref,spec:ChildSpec}`。实际Message全文受256KiB上限，不含原始推理链。

HistoryTurn.results是有序FE tool/child TranscriptEntry，必须一一匹配助手建议proposalId/childId及原权威命令，不允许裸结果、缺失/重复/逆序或跨Run混入。TranscriptSlice覆盖完整连续已提交轮次，SessionManager经RunRegistry `readTranscriptSlice({runId,firstSequence,lastSequence,headRef})->TranscriptSlice` 验证commitIds与所有内容引用；Client不能用任意Artifact列表冒充。未完成工具链不得append到Session；Run中进行中的链仍由Context读取Run转录处理。Session CAS只写经验证切片，source切片身份唯一；分支仍固定父版本。

ContextSourceSpec由Host配置与受理请求冻结到Run附属读取记录（不改变FE RunSnapshot字段），在首次assemble前经RunRegistry `freezeContextSources({runId,sourceRunVersion,sourceSpec})->{sourceSpecId:Ref}` 原子写入；同run/version不同spec冲突。sourceSpecId=H(其余完整字段)的`ctxsrc:`引用，版本化Memory/索引/估算器不能运行时替换latest。Memory检索纯排序使用固定indexVersion/algorithmVersion返回的非负整数scoreRank升序，再entryId ASCII顺序；实际命中列表与降级列表存在AssemblyReceipt。首版memory=[]合法且不调用Memory。

prompt格式固定formatVersion=ctx-json-1，规范化FE-C14N-1编码 `{system:Artifact[],task:Artifact,history:HistoryTurn[],runTranscript:TranscriptEntry[],memory:MemoryEntry[]}` 的解析内容投影；排列顺序严格按来源和转录序号，不依赖对象遍历或实时索引。源Artifact内容及引用均核验，系统与任务不可裁剪。预算先保留必需内容，再由近到远选完整轮次；最终输出恢复到历史正序。选择后摘要及inputTokens写AssemblyReceipt，Frame.frameId绑定sourceSpecId+degradedSources+promptDigest+FE bindings/sourceRunVersion/head。

required来源缺失返回失败；optional来源不可用可以drop，但将该降级决定持久化到唯一(runId,sourceRunVersion,sourceSpecId) AssemblyReceipt，重试先读取既有Receipt，不因服务恢复改变同一已冻结Frame。授权撤销永远拒绝复用而非继续返回旧内容；组装失败不得改变Run，Coordinator按FE contextFailure处理。

## 扫描闭环（R1）

扫描每1秒触发一轮、每批256条，轮内连续处理至本轮最多4096个活动Run（最多16批），并发扫描实例1；不是每秒只处理一批。单轮需≤5秒，否则暴露scan_lag并停止受理超出可扫描容量的新Run，不堆叠扫描协程。扫描期间新受理Run靠事务runnable与下一轮补齐，游标固定本轮高水位。验收在完整4096活动Run、丢全部提示、无新流量下测最后一条被发现时间≤5秒。

## UNKNOWN核对闭环（R1）

ToolCall UNKNOWN保留原phase=unknown历史，新增唯一ReconciliationRecord，不把UNKNOWN历史覆盖成未发生；`ReconciliationRecord={commandId,incidentRef,resolutionId,version,effect,resultRef,outcome:success|failed,evidenceRef}`。可信执行证据确认后，原ToolCall的查询有效结果由最新已验证record投影completed/failed；写核对记录与通知outbox同事务，重复resolutionId同证据返回原回执、矛盾证据冲突。

Run非终态且Suspended(tool_unknown)时，恢复器投递匹配原commandId/incidentRef的EffectReconciled；成功核对T2使Ready、移除原Proposal、追加tool转录恰好1条，Incident解决；已知未执行/失败则按FE Failed，不能自动再DispatchTool。Run已终态时只更新Incident与执行事实，Run.version/position完全不变且不投递推进事件。通知ACK丢失可重投同eventId，消费收据保证一次；Provider执行次数始终不增加。

## 必要审计完成点（R1）

审计outbox耐久不等于必要审计Journal已确认。决策、Permit消费与startGrant各有稳定auditEventId=`audit:`+H({commandId,phase})，同内容重投不变。Kernel必须取得同事件的AuditReceipt才开放依赖动作。若同本地权威事务写Journal，则事务成功回执等价；否则保存audit_pending，调用append、超时queryReceipt({auditEventId})（完整found/absent/unknown/gone联合见运维依赖；仅found允许继续）；未确认不得将grant交执行器或进入STARTED。恢复重投同auditEventId只能补审计，不补发新业务。具体Journal实现不在本轮；所需queryReceipt与原子可见保证放运维依赖目录。
