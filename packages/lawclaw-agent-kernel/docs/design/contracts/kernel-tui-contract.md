---
doc_id: TUI-CON-001
level: contract
layer: Client Interface
component: KernelTUI
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "TUI-CON-001：LawClaw 客户端与本地宿主"
parent: SYS-DES-001
interfaces: [TUI-CON-001]
diagrams: []
supersedes: []
---

# TUI-CON-001：LawClaw 客户端与本地宿主

## 1. 适用范围与基础类型

候选协议1.0；这是Host外部客户端协议，不把用户输入准备职责并入Kernel Facade。既有CD-1/CTX-CON-1内部类型继续唯一维护，此处只定义其公开投影与Host意图。所有操作Promise异步，失败使用BoundaryError；JSON无undefined，显式null表示不存在。未知字段拒绝，未知主版本拒绝。

| 名称 | 精确定义 |
|---|---|
| Ref | 非空UTF-8字符串，最多128字节；只是不透明身份，不授予读取权 |
| Version/Sequence | 0到Number.MAX_SAFE_INTEGER的整数 |
| RequestMeta | 引用公共RequestMetadata；本档案protocolVersion=1.0，requestId每HTTP请求新建，traceparent/correlationId/deadlineUtc必填 |
| CommandMeta | RequestMeta加commandId/idempotencyKey；两个值在同一逻辑命令中固定，首期取同一个UUID |
| SessionAnchorView | {sessionId:Ref,version:Version,headRef:Ref}；仅已确认历史 |
| Selection | {agentId:Ref,modelId:Ref或null}；null请求Host解析已配置默认并冻结，禁止TUI猜测 |
| Page<T> | {items:T[],nextCursor:Ref或null,snapshotRef:Ref}；limit默认64，1—256 |
| Capability | conversation、stream、commandLookup、sessionNavigation、executionDetails、selection、approval |

认证使用Authorization头，Host绑定可信scope；JSON不接受tenant/token/envelope覆盖。HTTP响应/事件每帧64KiB，深度32；正文目标32KiB，材料最多32个授权Ref。scope在每次操作服务端验证，不存在和越权统一NOT_FOUND。分页正文单页≤64KiB，单项过大返回分页内容引用而非截断后声称完整。

## 2. 命令、查询及数据形状

| Client方法 | HTTP绑定 | 输入（meta在请求信封） | 返回 |
|---|---|---|---|
| initialize | POST /v1/initialize | {supportedMajor:[1],requestedCapabilities:Capability[]} | {hostInstanceId,scopeId,connectionId,protocolVersion,capabilities,limits,defaultSelection:Selection或null} |
| submitConversation | POST /v1/conversation-commands | SubmitConversation | ConversationReceipt |
| getCommand | GET /v1/commands/:commandId | RequestMeta | CommandRecord |
| getSession | GET /v1/sessions/:id | RequestMeta | SessionView |
| listSessions | GET /v1/sessions | cursor/limit | Page<SessionSummary> |
| getRun | GET /v1/runs/:id | RequestMeta | RunView |
| cancelRun | POST /v1/runs/:id/cancel | CommandMeta；{} | {commandId,runId,cancellationRequested:boolean,terminal:RunView或null} |
| readRunEvents | GET /v1/runs/:id/events | after:Sequence,limit | {events:DurableEvent[],nextSequence,hasMore} |
| subscribe | GET /v1/runs/:id/stream | after:Sequence | SSE：DurableEvent、TextStart、TextDelta或TextEnd |
| acknowledge | POST /v1/subscriptions/:id/ack | {sequence} | {acknowledgedSequence} |
| listAgents/listModels | GET /v1/agents 或 /v1/agents/:id/models | cursor/limit | Page<{id,label,version}> |
| listApprovals | GET /v1/runs/:id/approvals | cursor/limit | Page<ApprovalView> |
| decideApproval | POST /v1/approvals/:id/decisions | CommandMeta及Decision | {commandId,approvalId,state,version} |

GET元数据使用X-Lawclaw-Request-Meta头(JSON，≤4KiB)，写请求使用{meta,input}；initialize亦如此。SSE通过支持Authorization头的HTTP客户端建立，不使用浏览器EventSource或URL token。initialize返回连接能力引用connectionId，后续请求携带X-Lawclaw-Connection，引用不可替代身份认证。limits字段为maxFrameBytes/maxInflight/maxEventWindow；取本地上限与服务上限的较小值。

SubmitConversation={session: {kind:"new",logicalKey:Ref}或{kind:"existing",anchor:SessionAnchorView},selection:Selection,goal:string,materialRefs:Ref[]}。正文原样UTF-8保存，服务验证非空；不把任意路径当materialRef。既有会话agentId必须匹配身份。

ConversationReceipt={commandId,state:"preparing",sessionId:null,runId:null}或{commandId,state:"accepted",sessionId:Ref,runId:Ref,anchor:SessionAnchorView,frozenSelection:Selection}。preparing仅确认Host准备记录耐久，不表示Run已受理；accepted确认Run受理和引用可查询。明确拒绝返回BoundaryError并保存命令结果。

initialize返回200且包含connectionId；submit新建准备记录/确认受理均返回202，重放返回原回执与同状态码；查询200；cancel返回202；decideApproval确认决定后返回200。业务错误统一{error:BoundaryError}，不把HTTP 200解释为Run执行成功。服务端校验发生在入站字节限制之后。GET查询参数只承载cursor/limit/after等非凭据字段。

CommandRecord是按operation和state判别的联合：

- {operation:"submit",commandId,state:"preparing",receipt:PreparingReceipt}，PreparingReceipt为ConversationReceipt的preparing变体。
- {operation:"submit",commandId,state:"accepted",receipt:AcceptedReceipt}，AcceptedReceipt为其accepted变体。
- {operation:"cancel",commandId,state:"accepted",receipt:CancelReceipt}，CancelReceipt为cancelRun返回值。
- {operation:"approval",commandId,state:"accepted",receipt:DecisionReceipt}，DecisionReceipt为decideApproval返回值，state为approved或denied。
- {operation:"submit"|"cancel"|"approval",commandId,state:"rejected",error:BoundaryError}。

无其他operation、无模糊null回执。尚未确认的cancel/approval查询返回UNAVAILABLE，不伪造accepted。不存在返回NOT_FOUND，不把它解释成原HTTP永不迟到；到期返回GONE。Host保留命令记录至少到关联Run终态后7天；未决命令禁止清理。该保留期为设计默认，尚无实现。

SessionView={anchor,agentId,defaultSelection:Selection,activeRunId:Ref或null,history:Page<PublicMessage>,historyReady:boolean}。SessionSummary={sessionId,agentId,label,activeRunId,updatedAtUtc}。PublicMessage={messageId:Ref,runId:Ref,role:"user"|"assistant",text:string,revision:Version,contentRef:Ref或null}；text最多8KiB预览，contentRef非null表示完整正文需按块读取。historyReady=false时不可追问；不会将Run最终输出等同于Session已采纳。

RunView={runId,sessionId,version,attemptId:Ref或null,state:"queued"|"running"|"waiting_approval"|"suspended"|"completed"|"failed"|"cancelled",cancellationRequested:boolean,eventSequence,outputRevision,messages:Page<PublicMessage>,frozenSelection,details:Page<ExecutionSummary>,error:BoundaryError或null}。这是公开投影，内部position映射由服务定义；无法映射时返回PROJECTION_UNAVAILABLE，不把系统Flow Completed当作业务成功。历史nextCursor通过GET /v1/sessions/:id/history或/v1/runs/:id/messages读取同snapshotRef页。

ApprovalView={approvalId,runId,version,proposalDigest,summary,resourceSummary,expiresAtUtc,state:"open"|"approved"|"denied"|"expired"|"revoked",allowedDecisions:("approve"|"deny")[]}。Decision={decision:"approve"|"deny",expectedVersion,proposalDigest}；服务端CAS复核，不允许TUI修改资源摘要后批准。

## 3. Host准备与内部契约传播

Host ConversationPreparationService是客户端业务意图适配器，持有准备操作记录，不是新增Kernel聚合。次序：可信身份→原command lookup→冻结输入与preparationId→CTX-CON-1组装候选→候选成功后ensure→绑定并保存候选→Facade/Gateway→SessionRunCommandPort→RunRegistry受理→返回accepted。

低层Gateway start接收已确认Session和候选引用，不能要求TUI先create。ensure的created=false、采纳冲突和受理UNKNOWN按CTX-CON-1及Session单活契约处理。Host准备记录与Session/Run不共用一个虚构事务；各步保存回执与恢复位置，重启先查询原事实。该协调持久化、查询协议和Session采纳实现列为DEP-01，现有内存入口不能承诺此行为。

幂等作用域=(可信scope,操作族,commandId)，payload按递归字典序键排序、数组顺序不变、JSON UTF-8无空白生成摘要；不包含请求id/trace/deadline等传输元数据，包含完整input。禁止NaN/重复JSON键，字符串不自动Unicode归一化。相同input返回原记录，异input=IDEMPOTENCY_CONFLICT。固定向量：输入{"b":2,"a":1}规范字节为{"a":1,"b":2}；对象键交换相同，数组元素交换不同。摘要只作比较，不作为授权或唯一身份。

## 4. 事件与一致快照

DurableEvent={runId:Ref,sequence:Sequence,version:Version,kind:"run.updated"|"message.committed"|"tool.updated"|"child.updated"|"approval.updated"}。本客户端档案只需要有序变更通知，正文通过getRun快照取得；不传重复的大型payload、不要求TUI重放领域事件。sequence沿用RunEventQueryPort的权威Run序号，服务将每个可读Run事件机械映射为上述通知，无法公开详情的事件仍可映射为run.updated，不在客户端建立第二套序号。权限按整个目标Run校验，越权拒绝订阅，不通过静默过滤产生缺口。相同cursor至少一次发送允许重复，单订阅不得乱序。

ExecutionSummary={kind:"tool"|"child"|"approval",id:Ref,label:string,state:string,summary:string}，label≤256字节、summary≤4KiB，state仅显示服务返回的公开文本，TUI不据其推导控制资格。details第一页最多32项，后续页使用GET /v1/runs/:id/details?cursor=...；一期executionDetails未启用时为空页。审批的可操作状态仍通过getApproval取得。

文本流为三个封闭消息：TextStart={kind:"text.start",runId,attemptId,streamId,blockId,baseOutputRevision,prefix:string}；TextDelta={kind:"text.delta",runId,attemptId,streamId,blockId,baseOutputRevision,offset:Sequence,text:string}；TextEnd={kind:"text.end",runId,attemptId,streamId,blockId}。Ref字段非null，版本字段使用Version。服务每次订阅重新发送当前block的start再发delta；客户端发现快照outputRevision改变且Run未终结时关闭旧订阅，按新cut重订阅，不要求服务在原订阅主动补start。prefix≤32KiB，无法有界提供前缀时该订阅不发送该block临时流，只靠快照。offset按Unicode码点计，delta≤8KiB，不占耐久序号。end不表示Run终态。snapshot的eventSequence与messages来自同一致cut；分页必须固定snapshotRef，过期重取。不能把新快照正文和旧cut混合。

TUI发现序号缺口立即关闭订阅并取新快照，不缓存乱序事件；getRun返回eventSequence是该快照的一致公开cut，订阅after=cut可由服务补拉，避免快照/订阅窗口。Snapshot details和message页也属于同snapshotRef。GONE后新建快照并提示历史缺口，不伪造旧事件已消费。

正文分块接口GET /v1/contents/:ref?cursor=...，返回{contentRef,revision,offset,text,nextCursor}；text≤8KiB，offset为码点数。首块offset=0，后续由opaque cursor固定同版本；无权/到期统一NOT_FOUND/GONE。客户端一次只显示一块，旧块可重查，不拼全量正文。Session历史与Run消息页也是一次一页，最多64条且总帧64KiB；不足空间时减少条数，不能把截断正文标为完整。

SSE首帧subscription.ready={subscriptionId,hostInstanceId}，随后事件；心跳15秒。30秒无任何帧客户端进入重连。服务最多128未ACK耐久事件，超限暂停，30秒不恢复断开；ACK仅连接窗口，不等于客户端磁盘恢复点。临时delta不要求ACK、可丢。GONE含earliestSequence及snapshot获取入口；版本不支持停止消费，不跳过未知必填事件。

## 5. 错误、取消、期限与能力

| 错误 | HTTP | 客户端行为 |
|---|---|---|
| INVALID_ARGUMENT/FRAME_LIMIT | 400/413 | 保留输入，明确修正后新操作 |
| UNAUTHENTICATED | 401 | 停连接，清理敏感投影 |
| NOT_FOUND | 404 | 不泄漏归属；未知提交继续待确认 |
| VERSION_CONFLICT/SESSION_RUN_ACTIVE/IDEMPOTENCY_CONFLICT | 409 | 刷新并保留草稿；不自动换ID |
| GONE | 410 | 命令待人工核对；事件取新快照并显示缺口 |
| CAPABILITY_UNAVAILABLE/PROJECTION_UNAVAILABLE | 422/503 | 禁用依赖功能，不猜语义 |
| RATE_LIMITED/UNAVAILABLE | 429/503 | 查询有限退避；写先查命令 |
| PROTOCOL_UNSUPPORTED | 426 | 停止，提示版本要求 |

客户端请求预算5秒只约束本次响应等待；Host记录preparing后按冻结的宿主执行预算继续处理，不因查询deadline更新延长执行预算。首次写到达时已过RequestMeta.deadlineUtc则明确拒绝；写已进入服务但响应超时仍需查询原命令。Run预算由Host配置冻结，不由TUI随重连改变。重试新的查询使用新requestId；固定写command与payload不变。取消不终止HTTP连接以冒充执行取消，退出也不发送取消。approval能力第三期才启用；初始化缺首期三项能力不能提交对话。

## 6. TUI需要的本机依赖与补齐接口

本节定义可替身实现的边界，不展开提供方的锁/存储内部算法。

```ts
type HostMode = { kind: "profile"; profileRef: string }
  | { kind: "endpoint"; endpoint: string; credentialRef: string };
type HostEndpoint = { endpoint: string; credentialRef: string;
  profileKey: string; scopeId: string; hostInstanceId: string };
interface HostLauncherPort {
  resolve(mode: HostMode, signal: AbortSignal): Promise<HostEndpoint>;
}
```

resolve成功保证唯一已就绪且归属匹配的宿主，失败为BoundaryError；abort/超时不取消或强杀宿主。profile模式可启动，endpoint模式只连接；TUI不检查PID、锁文件、数据库或系统恢复阶段。凭据读取和HTTP Authorization注入由受信适配器完成，不能放ViewModel。提供方部署实现另行验收。

补齐getApproval：GET /v1/approvals/:id → ApprovalView；defaultSelection来自initialize或SessionView，禁止TUI读Pi默认配置。listModels的ID在该Agent范围内稳定，提交绑定agentId一起解释。无默认配置时initialize仍成功但defaultSelection=null，UI保持只读并提示配置不可用。

PendingRecord={schemaVersion:1,profileKey:Ref,scopeId:Ref,commandId:Ref,operation:"submit"|"cancel"|"approval",targetRef:Ref|null,input:SubmitConversation|空对象|Decision}；operation唯一确定input类型：submit/new时targetRef=null、existing时为sessionId，cancel为runId，approval为approvalId。Bookmark={schemaVersion:1,profileKey:Ref,scopeId:Ref,sessionId:Ref|null,runId:Ref|null}。本地文件只查原命令不自动重发；SR-02定义写入/清理及单实例隔离。

客户端仅依赖当前契约行为；DEP-01/02的物理表、DEP-03内部状态映射、DEP-04 OS锁、DEP-05安全工作流不属于TUI开发者补作的设计。服务未满足契约时功能报不可用，不通过降级绕过。

## 7. 第一阶段实现映射（2026-09-10）

首期客户端DTO及解码位于`src/contracts/kernel-client.ts`、`kernel-client-codec.ts`，HTTP/SSE适配位于`src/clients/kernel-tui/kernel-client.ts`。先只请求conversation/stream/commandLookup，不消费审批和执行详情。认证头不进入恢复记录；仅连接字面回环地址且禁止重定向。网络错误、协议错误和明确BoundaryError保持三种不同结果；写操作一次发送，查询原命令属于对话用例，不能由传输层自动重发。

模型临时观察的内部接口为`contracts/control/run-registry/model-observation.ts`。`createFlowModelHandler`在已确认模型命令执行边界发布start/delta/end，带runId/attemptId/commandId，offset按码点计。Host未来将其转换为TextStart/Delta/End；此端口本身不是SSE、不是耐久事件，也不是Run终态。宿主提供方必须同步、有界、不抛错，UI断开不能影响执行。当前仅验证内部出口和HTTP客户端各自行为，未验证两端连成正式Host。

Session持久实现的权威冲突记录于`governance/reviews/kernel-tui-design-review.md`末节。该差异不改变本文SessionAnchorView仅表示已确认历史的语义；不能将现有RunStore派生版本静默作为此公开字段返回。
