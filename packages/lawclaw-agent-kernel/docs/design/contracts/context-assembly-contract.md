---
doc_id: SYS-CON-005
level: contract
layer: cross-layer
component: ContextEngine
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: CTX-CON-1 上下文输入准备、必选声明、Child 父上下文选择、Token 计量、组装候选与调用方采纳契约
parent: SYS-DES-001
interfaces: [ContextPort, SessionCommandPort, SessionQueryPort, ArtifactPort]
diagrams: []
supersedes: []
---

# CTX-CON-1：上下文组装补充契约

候选，关联[ACR-2026-0013](../../governance/changes/ACR-2026-0013-context-assembly.md)。补充[CD-1](component-development-contracts-v1.md#context-engine)未闭合的输入准备、必选声明和候选采纳语义；代码类型已在本地实现，跨组件宿主迁移和批准状态单独验收。CD-1拥有公共Ref、Artifact、RequestMeta、CommandMeta、TrustedScope、Error、MemorySource及安全协议；`SessionAnchor/SessionCreationIntent` 的代码Schema归 SessionManager 契约，其余 Assembly 类型归 ContextEngine 契约，组件正文解释使用方式。

已确认迁移决定：两个运行入口及现有Child委派统一使用CTX-CON-1，删除ContextAssemblyRequest、旧模型ContextFrame和appendTurn协议。旧格式显式拒绝，不双读、不转换、不自动删除旧数据。迁移决定已确认，实际调用链和故障恢复验收另行记录。Ref/Count沿用CD-1；Count为非负安全整数；bytes为UTF-8字节，tokens为冻结估算器的计数，deadline为UTC毫秒。花括号为字段全集，字段均必填，空值显式null，未知字段拒绝；数组不可变。标识为字符串值，不通过反射构造类或调用任意方法。

**调用适用约束**：ContextEngine非线程安全，同实例不允许并发/异步重入；SessionManager负责同Session当前Run及操作串行，Composition Root为并行调用装配独立实例。独立工作集不代表并发承诺。最终采纳及失联接管的执行资格校验归外部Session/Run写入边界。输入准备、延迟创建及候选交付遵循下列新契约；不以旧先创建或独立组装回执协议实现。组件场景见[第4节](../layers/l1-control/components/context-engine.md#4-外部调用场景与异常流程)。

## 1. Session入口：只读准备与延迟创建

业务适配层提供“查询，不存在则创建”的完整用例，但自动创建步骤排在候选组装成功之后。Context只接收输入意图，不调用Session写端口。显式创建Session仍是独立接口；两个运行入口的自动创建遵循下列契约，旧 `ensure(sessionId)` 不作为兼容入口保留。

| 类型/操作 | 定义 |
|---|---|
| SessionAnchor | `{sessionId:Ref,version:Count,headRef:Ref}`，仅表示已确认快照 |
| SessionCreationIntent | `{logicalKey:Ref,agentDefinitionRef:Ref,contextPolicyRef:Ref,parent:SessionAnchor或null}`；Root的parent=null，独立Child为确切父锚点。不是Session实体，不含伪造的version/head |
| SessionInput | 封闭联合：`{kind:existing,anchor:SessionAnchor}`、`{kind:create,intent:SessionCreationIntent}`、`{kind:read_only,source:SessionAnchor}`。read_only用于不拥有独立Session的一次性读取，不占用父Session的当前Run槽位 |
| SessionQueryPort.lookup | `(RequestMeta,TrustedScope,{logicalKey:Ref})->{state:found,anchor:SessionAnchor}或{state:absent}`；作用域取TrustedScope，仅查询，异常不返回absent。已有定义/策略及active状态由准备方核对；指定历史缺失仍是NOT_FOUND/GONE |
| SessionCommandPort.ensure | `(CommandMeta,TrustedScope,SessionCreationIntent)->{anchor:SessionAnchor,created:Bool}`；仅接受parent=null。候选成功后调用，同作用域logicalKey唯一；已有Session校验定义/策略和active状态，不覆盖、不复活 |
| Child创建 | Coordinator在候选成功后，将intent及稳定Child命令映射至现有SessionBranchPort.branch；必须保持父版本及独立血缘，不能用Root ensure替代 |
| CandidateSessionBinding | `{inputDigest:Ref,sessionInput:SessionInput,target:SessionAnchor或null}`；调用方持有。existing的target须等于输入anchor；create的target来自原创建命令的确认结果；read_only固定null |

准备与失败语义：

1. lookup found生成existing；absent生成create。create的自身历史为空是新建意图的显式语义，不是reader把缺失快照吞为空。Child仍按parentContext读取父候选。read_only仅读取source，不创建或归档父Session。
2. Context返回候选后，调用方检查inputDigest及当前执行资格，再执行ensure/branch。稳定commandId及intent由外部业务操作保存并复用；同键异载荷拒绝。组装失败时Session创建数必须为0。
3. 创建事务内不调用Context、Artifact或模型。Session及原创建命令结果一起提交。结果未知只查询原命令，不换ID或再造logicalKey。第一次命令遇到已被其他操作创建的Session（created=false）时，丢弃基于空历史的候选，重新准备existing锚点并组装；不能把旧候选直接改绑到赢家。重放原命令返回原created值和anchor，不因Session后来追加而升级。
4. 已确认创建后保存/采纳失败，保留创建事实，恢复复用原命令结果；采纳前仍须确认目标没有推进且父绑定一致。版本变化返回VERSION_CONFLICT，不能伪装空历史。Child的终止/归档由Coordinator按未受理证明处理，不由Context自动补偿。
5. 已有Session最终采纳时校验原版本/历史head、业务期望步骤及执行资格；新Session校验创建确认锚点及同样的业务条件。创建成功不等于采纳成功，候选内容摘要不含创建后的锚点，不能因此跳过CandidateSessionBinding校验。实际目标绑定与promptRef由外部业务提交原子固定。

SessionManager的自动ensure/branch发生在assemble成功之后；先branch后assemble的旧调用时序失效。会话版本不是由Run标识推导的常量，必须来自Session权威存储。

### 1.1 首次输入准备与读取资格

首次组装由业务Host或SessionManager Coordinator持有稳定preparationId及冻结来源，再调用Context。组装器不保存准备记录。需要跨进程继续原操作的宿主必须先在自己的业务存储保存完整输入；未提供该存储的入口只支持重新发起，不承诺恢复原准备操作。恢复前由外部核对创建/采纳事实，不能在Context内补建准备表。

读取资格来自外部受信调用方提供的ScopedReader能力及当前授权状态，绑定准备操作、允许来源和截止时间；不能仅凭preparationId或plannedRunId读数据。首次输入不借用“已受理Run”的claim，也不伪造Session锚点。需要当前Run资格的现有Memory.query不接收计划Run：Host在自身受控读取边界取得并冻结允许使用的Memory视图，再提供受限reader读取该视图。没有可用受控来源时返回权限/依赖错误，不绕过检查或把必选来源吞为空。Memory视图及来源结果按§2.2冻结，正文读取仍复核当前权限；视图引用本身不授予读取资格。

RunAssemblyInput明确区分准备态和执行态：initial没有当前转录，existing才要求确认过的Run版本/head。候选成功后调用方ensure/branch确认Session，绑定原计划Run身份、保存完整候选，再经Session单活Run入口完成受理与上下文采纳；现有Run继续走原条件提交。创建/受理/采纳未知查询各自原权威事实，不自动重建或派发。读取授权不授权Session写入或模型执行，各动作在实际发生时检查自身资格。

## 2. 组装输入补充

ContextPort.assemble只返回内存中的AssemblyCandidate。产物保存、Session绑定、Run采纳和当前权限边界由调用方处理，见§1/3。候选不携带尚未写入的Artifact引用。

| 类型 | 完整字段与约束 |
|---|---|
| RequiredReason | `system_constraint / current_task / task_input / causal_dependency`，不能由资料正文自签 |
| Requirement | `{reason:RequiredReason,declaredByRef:Ref,memberRefs:Ref[]}`；成员1—256个，均须在冻结来源或规范转录中可定位 |
| MaterialSource | `{sourceRef:Ref,version:Count,contentRef:Artifact,priority:Count,requirement:Requirement或null}`；大文件由上层先提供有界片段Artifact |
| MemoryAssemblySource | `{source:MemorySource,viewRef:Artifact}`；引用CD-1的冻结MemoryView，输入摘要包含该引用。existing由调用方先按实际Run调用Memory.query并保存视图；initial使用Host已有受控读取入口准备同型视图，不增加允许plannedRunId调用query的旁路 |
| ParentContextSliceSpec | `{parent:SessionAnchor,selectorRef:Ref,selectorVersion:Ref,candidateRefs:Ref[],requiredRefs:Ref[],maxInheritedTokens:Count}`；candidate 0—256个并按父快照因果序解释，required须为candidate子集；绑定确切Parent版本，不允许latest；selector只定义候选排序/结构规则，不授予读取权限 |
| AssemblyLimits | `{inputTokenLimit:Count,modelWindowTokens:Count,outputReserveTokens:Count,estimatorMarginTokens:Count,maxBytes:Count,maxWorkingBytes:Count,maxCandidateBytes:Count,maxSources:Count,maxRecords:Count,maxEdges:Count}`；input/window/bytes/sources/records为正，reserve+margin须小于window |
| RunAssemblyInput | `{kind:initial,preparationId:Ref,plannedRunId:Ref}`或`{kind:existing,runId:Ref,sourceRunVersion:Count,transcriptHeadRef:Ref}`；initial的自身Run转录为空，不查询不存在的Run；来源记录中的原始Run身份不受此影响 |
| AssemblyBasis | `{runInput:RunAssemblyInput,sessionInput:SessionInput,systemRef:Artifact,taskRef:Artifact,toolsRef:Artifact,materials:MaterialSource[],memory:MemoryAssemblySource[],requirements:Requirement[],parentContext:ParentContextSliceSpec或null,expectedChildObservations:ExpectedChildObservation[],limits:AssemblyLimits,configVersion:Ref,selectionVersion:Ref,estimatorVersion:Ref,modelWindowVersion:Ref,formatVersion:Ref,modelAdapterVersion:Ref,envelopeRef:Ref,authorizationEpoch:Count}`；Root的parentContext为null；Child的parent须与create.intent.parent或已存在Child的不可变血缘一致；read_only时须与source一致。existing读取anchor历史；create不读取不存在的自身历史 |
| ExpectedChildObservation | `{recordRef:Ref,childId:Ref,childRunId:Ref,outcome:SUCCEEDED或FAILED}`；清单来自外部权威已确认事实，覆盖本次允许历史中的全部Child声明；recordRef及Child身份均唯一。不允许从reader实际返回值反推清单 |
| TokenAccounting | `{inputTargetTokens:Count,baseInputTokens:Count,inheritedTargetTokens:Count,inputTokens:Count,estimatedInheritedTokens:Count,nextEligibleInheritedUnitTokens:Count或null,droppedInheritedTokens:Count,estimatorVersion:Ref,modelWindowVersion:Ref,formatVersion:Ref,budgetStatus:within_target或required_over_target}` |

计量定义：令S为当前选中record集合、P为parent.candidateRefs、E为冻结Pi完整映射估算。baseInputTokens=E(S\P)，estimatedInheritedTokens=max(0,E(S)-E(S\P))；inheritedTargetTokens=max(0,min(parent.maxInheritedTokens,inputTargetTokens-baseInputTokens))。nextEligibleInheritedUnitTokens按规范unit顺序取首个未选且含父记录的单元，加入其完整闭包后计算父贡献增量；没有则null。droppedInheritedTokens是加入全部未选父单元闭包后的父贡献减当前父贡献，下限0。它们是同版粗估差值，不是原文Token加总或精确Provider计费。

进程内API为`assemble(basis:AssemblyBasis,signal:AbortSignal):Promise<AssemblyCandidate>`，失败抛出ContextAssemblyError。组合根先将RequestMeta/TrustedScope约束绑定到SourceReader和ContextArtifactReader；它们不是JSON参数，也不能由AssemblyBasis自签。必选声明由Host任务契约或结构依赖规则生成。existing.sourceRunVersion属于业务执行状态；initial不伪造该字段。两者都不是通用Flow系统状态。

### 算法策略与候选输出

候选及其数据类型是可序列化值；AssemblyAlgorithm及estimateSelection回调仅在进程内使用，函数不进入JSON或持久化。组装器仍不承诺同实例线程安全。算法接口唯一代码位置为`src/contracts/control/context-engine/assembly-algorithm.ts`，候选/载荷类型放同目录的`assembly-candidate.ts`，输入类型放`assembly-basis.ts`；默认实现位于`src/control/context-engine/algorithms/`。相应类型及两个纯策略已生成运行代码，外部Host的旧ContextFrame协议迁移不由此声明完成。

| 类型 | 字段与约束 |
|---|---|
| AssemblyCandidate | `{payload:ContextPayload,trace:AssemblyTrace,tokenAccounting:TokenAccounting,inputDigest:Ref,payloadDigest:Ref,selectionVersion:Ref,formatVersion:Ref,modelAdapterVersion:Ref}`；不可变、完整可序列化值，不复用旧ContextFrame |
| ContextPayload | `{system:BodyText,task:BodyText,messages:ContextMessage[],materials:MaterialProjection[],memory:MemoryProjection[],tools:ToolDescriptor[]}`；只有该对象进入模型转换 |
| ContextMessage | user为`{role:user,text:BodyText}`；assistant为`{role:assistant,content:ContextBlock[],stopReason:stop或tool_use或length或error或aborted}`；tool为`{role:tool,toolCallId:Ref,toolName:Ref,text:BodyText,isError:Bool}`；任务观察为`{role:task_observation,childId:Ref,childRunId:Ref,outcome:SUCCEEDED或FAILED,resultRef:Artifact或null,errorRef:Ref或null,text:BodyText}`，只表示父侧已确认的Child结果 |
| ContextBlock | `{type:text,text:BodyText}`或`{type:tool_call,toolCallId:Ref,toolName:Ref,arguments:JsonObject}`或`{type:child_task,childId:Ref,childRunId:Ref,task:BodyText}`；JsonObject为有限合法JSON对象，遵循FE-C14N-1数值约束，不包含函数或运行时引用 |
| AssemblyTrace | `{records:TraceRecord[],units:CausalUnit[],dependencies:DependencyEdge[],decisions:SelectionDecision[],toolCalls:ToolCallProjection[],degradedSources:Ref[]}`；记录全部已读取规范记录、因果单元及其依赖；decisions的unitRef必须在units中定位，工具映射仅含最终输出调用；degradedSources按冻结来源序列出允许可用性降级的来源 |
| TraceRecord | `{recordRef:Ref,identity:SourceIdentity,contentRef:Artifact,orderKey:SourceOrderKey,output:PayloadLocation或null}`；未选记录output=null，已选记录恰有一个位置 |
| PayloadLocation | `{field:messages或materials或memory,index:Count}`；指向最终payload中的对应元素；必选system/task由AssemblyBasis固定，不伪装SourceRecord |
| SelectionDecision | `{unitRef:Ref,decision:keep或drop,reason:required或dependency或ranked或budget}`；结构/权限错误不能作为drop理由掩盖 |
| Selection | `{selectedUnitRefs:Ref[],decisions:SelectionDecision[]}`；引用去重且均来自输入units，decisions对每个输入单元恰好一项；最终正文由公共渲染器构造 |
| SelectionEstimate | `{inputTokens:Count,inputBytes:Count,inheritedTokens:Count,inheritedTargetTokens:Count}`；对包含固定system/task/tools基线的完整渲染输入计算；无Parent时后两项为0 |
| AssemblyAlgorithmInput | `{units:CausalUnit[],dependencies:DependencyEdge[],requiredRecordRefs:Ref[],optionalUnitOrder:Ref[],historyRecords:HistorySelectionRecord[],limits:AssemblyLimits,estimateSelection:(selectedUnitRefs:readonly Ref[])=>SelectionEstimate}`；不可变输入；边端点及必选引用使用recordRef，单元成员负责record→unit映射；optionalUnitOrder为默认策略的固定排序。函数由组合根装配的纯渲染/估算能力闭包提供，只捕获本次冻结正文，不访问网络/数据库 |
| HistorySelectionRecord | `{recordRef:Ref,message:ContextMessage}`；来自已完成公共去重/配对的历史投影，按规范因果序排列，recordRef唯一且属于输入units。仅含Session/Run/允许父历史，资料与Memory不伪装历史；默认策略可忽略此字段 |
| RecentHistorySelectorPort | `selectCut({historyRecords:HistorySelectionRecord[],targetTokens:Count})->{firstKeptRecordRef:Ref或null}`；同步纯函数，返回输入中的截断记录或null（不选可选历史）。只给建议连续后缀，不构造候选正文、不查询来源、不调用模型 |
| AssemblyAlgorithm | `{algorithmId:Ref,version:Ref,select:(input:AssemblyAlgorithmInput)=>Selection}`；同步纯选择，无Session/Artifact/Activity/授权端口；返回或抛出的错误由ContextEngine映射到本契约封闭错误集 |

算法身份编码绑定已有selectionVersion：`"ctx-alg:"+hex(SHA256(FE-C14N-1({algorithmId,version})))`。任何排序或选取行为变更都必须新版本；同一冻结输入不允许替换实现含义。组合根只从受信静态注册表解析，无重复键、不动态加载用户输入路径；注册默认`causal-budget/v1`和用户指定的备选`pi-recent-history/v1`。备选仅显式选择，不作为错误后的自动降级。Pi库/截断语义或映射发生变化须升级备选version，组合根校验冻结版本与实际依赖构建一致。未知注册为配置错误，绑定身份不符为BINDING_MISMATCH；均不执行策略、不回退默认实现。

策略不能改变来源读取范围或硬限额。公共校验器独立检查Selection引用合法、必选完整、依赖闭合，重新渲染后核对总预算及Parent继承预算。输入派生摘要不包含函数对象；estimateSelection使用的正文、格式、模型及估算版本必须已由AssemblyBasis固定。纯封装成功不代表持久化或Run采纳成功。

Child 的 `parentContext` 由 SessionManager Coordinator 在 Fork 时冻结，ContextEngine 只读取 `parentContext.parent.sessionId/version` 的确切快照，并在授权范围内解析 `candidateRefs`。未列入候选的父内容读取数必须为0；`requiredRefs` 缺失、越权或超过字节等硬容量返回明确错误；仅Token估算超目标保留必选并标记，不扩大候选、改读latest或复制父全文。Child 自己的 system/task/tools 和当前任务仍由 AssemblyBasis 独立提供，不能从 Parent system/task 继承。Run已采纳后的恢复读取原payload/trace/TokenAccounting；采纳前确认未提交才可按冻结输入重算，Parent后续追加不扩大原候选范围。

输入摘要使用FE-C14N-1规范字节与SHA-256，前缀`ctx-input:`，对象为整个AssemblyBasis。trace/requestId/本次查询截止不进入语义摘要；可信scopeKey用于外部Run/Artifact存取隔离且不从JSON获取。旧sourceSpec由适配器引用本输入摘要，不维护两套来源清单。

formatVersion使用新值`ctx-input-1`，不得把新增字段塞入旧ctx-json-1。BodyText为合法Unicode字符串，保留源文本字符，整体受maxBytes限制。MaterialProjection为`{sourceRef:Ref,version:Count,contentRef:Artifact,text:BodyText}`；MemoryProjection为`{spaceId:Ref,spaceVersion:Count,entryId:Ref,entryVersion:Count,contentRef:Artifact,text:BodyText}`。ToolDescriptor复用[公共代码类型](../../../src/contracts/types.ts)的完整值字段；ContextMessage为本契约独立类型，显式复制规范消息正文并删除runtimeMessageRef，不能将旧KernelMessage或Pi私有对象直接序列化为新候选。

数组按来源固定序、历史因果序、Memory稳定排名输出。`payloadDigest="ctx-payload:"+hex(SHA256(FE-C14N-1(payload)))`；整个AssemblyCandidate保存时由Artifact层核验完整对象摘要，防止只验payload而遗漏Trace。Trace每个非null位置须在范围内且对应原记录，依赖边端点均可在records中定位；它是受控诊断数据，不发送给模型。

**模型适配契约（pi-context-1）：** 采用受信PiModelInputAdapter，输入为完整payload及冻结formatVersion/modelAdapterVersion。输出Pi Context的systemPrompt、messages、tools；未知角色/块在进入Pi前拒绝，不让默认convertToLlm静默过滤。固定映射如下：

| 字段 | Pi输入映射 |
|---|---|
| system | 原文进入systemPrompt，不拼接资料或Memory为系统指令 |
| messages | 按最终因果序逐条映射：user.text→user文本块；assistant text/tool_call→text/toolCall（id/name/arguments）；tool→toolResult（toolCallId/toolName、文本块、isError）。保持工具映射ID、正文、块序和终态标记 |
| Child声明与结果 | assistant.child_task映射为一个text块，内容为FE-C14N-1编码的`{kind:child_task,childId,childRunId,task}`；task_observation映射为一条user消息，唯一text块编码`{kind:child_task_observation,childId,childRunId,outcome,text}`。不生成toolCall/toolResult；resultRef/errorRef只留受控候选，不进入模型 |
| task | 历史之后追加一条当前user消息，其第一个text块为task原文 |
| materials | 同一当前user消息的第二个text块为FE-C14N-1编码的`{kind:context_materials,items:[{sourceRef,version,text}]}`，按payload顺序；不包含内部contentRef |
| memory | 同一当前user消息的第三个text块为FE-C14N-1编码的`{kind:context_memory,items:[{spaceId,spaceVersion,entryId,entryVersion,text}]}`，按payload顺序；不包含内部contentRef |
| tools | name、description、inputSchema→Pi Tool的name、description、parameters；version/risk/maxResultBytes留在受控候选与执行配置中，不伪装成模型工具参数 |

资料/Memory为空时对应块仍编码items=[]；JSON转义后解码必须逐字还原原文，不额外加入自由格式分隔符。Trace、准备身份、Session/Run管理状态、权限引用不进入模型。Child业务关联身份仅按上表明确字段进入模型，不包含执行资格或管理状态。资料作为当前用户输入中的数据，不提升为system。Pi需要的传输timestamp固定0，assistant的api/provider/model取冻结模型档案，usage采用Pi类型要求的零值结构；这些仅为转换占位，不表示历史时间、真实来源模型或计费事实，不能用于业务追踪/usage统计。业务事实只读原规范记录和真实执行结果。

modelAdapterVersion绑定pi-context-1、Pi依赖构建版本和冻结Provider档案。组装期估算与实际派发共用上述投影；Provider编码复用Pi，不在Kernel另写一套。已采纳后禁用Pi的自动裁剪/压缩/摘要。新版本映射按新冻结输入选择，恢复不得热换映射。独立测试向量须覆盖空列表、换行/引号/中文原文及跨Run同callId；这些是实现验收，不再作为正文映射方案待决。

Pi备选AssemblyAlgorithm通过RecentHistorySelectorPort调用Pi findCutPoint，选出的历史后缀必须映射回完整因果单元并补依赖，最终预算超限则有界前移边界；必选、Memory/资料及公共校验仍由Kernel规则处理。historyRecords是原冻结记录的纯投影，不新增查询来源；它不单独进入inputDigest，派生所需正文受原Artifact摘要约束。无历史或目标量0返回空建议；越界引用返回SCHEMA_INVALID。Pi异常映射为INTERNAL或已有精确错误，不自动改策略。Pi粗估为软目标，备选不承诺默认策略的饱和利用率，但必须满足字节等硬容量和结构约束。组件算法及验收见§6.1.2与CTX-PI-T-01～06。

**Token预算为软约束：** 首版复用Pi estimateTokens，对映射后的消息逐条估算；systemPrompt文本和工具schema的规范JSON也以Pi文本消息估算后计入。该值仅是选择参考，不宣称包含所有Provider协议开销或准确Tokenizer结果。模型实际窗口仍由Provider执行边界判定，不为通过验收补造“精确上界”。

`U_frame=min(inputTokenLimit,modelWindowTokens-outputReserveTokens-estimatorMarginTokens)`表示估算目标；`T_base`为去除父内容后的Pi估算，`U_parent=max(0,min(parentContext.maxInheritedTokens,U_frame-T_base))`表示父继承目标。字段名inputTokenLimit/maxInheritedTokens沿用当前候选输入，但在本版本明确为软目标。bytes、来源/记录/关系数量和截止时间仍是硬界限。

先保留必选闭包，再按策略向目标试放可选单元。可选闭包使总量或父继承估算超目标时整组不选；必选闭包本身超目标时不删必选、不返回CONTEXT_LIMIT，停止添加可选内容，返回budgetStatus=required_over_target。其余为within_target；任一硬容量超限仍失败。公共校验独立重算：超过软目标的候选只能包含必选闭包，不能借软约束无限追加可选内容。两种算法共用此规则。

TokenAccounting记录inputTargetTokens、inheritedTargetTokens、实际Pi估算及budgetStatus，不再用theoreticalInputUpperBoundTokens等字段声称真实Token上界。无父来源继承量为0。默认策略饱和夹具的0.95目标只检验固定估算表下的选择效率，且必选本身须在目标内；Pi备选不承诺该比例。Provider usage可用于观察估算偏差，首版无校准容差硬门禁。Provider拒绝窗口超限时由执行边界返回明确失败；不自动重发、切算法或在已采纳候选上悄悄摘要。


### 2.1 规范记录身份与依赖关系

本节是结构关系的唯一契约来源；来源reader必须输出统一记录，不能把callId、工具名或返回时间当作全局身份。每个Session当前只能有一个活跃Run；父快照与历史仍可包含此前已顺序完成、由RunRegistry确认的不同Run记录，但Session不保存这些Run的集合。

| 类型 | 完整字段与约束 |
|---|---|
| ToolCallIdentity | `{originAgentRunId:Ref,modelCommandId:Ref,callId:Ref}`；三元组在可信scope内唯一；callId是模型生成的单次工具调用标识，公共KernelMessage中的字段名为toolCallId |
| SourceIdentity | 封闭联合：`{kind:run_event,originAgentRunId:Ref,originEventRef:Ref,recordIndex:Count}`、`{kind:artifact,sourceRef:Ref,sourceVersion:Count,fragmentRef:Ref}`、`{kind:memory,spaceId:Ref,entryId:Ref,entryVersion:Count}`；没有可随意填充的runId/callId空字段 |
| SourceOrderKey | `{sourceOrdinal:Count,sequence:Count,recordOrdinal:Count}`；由冻结来源及原始顺序生成，不使用完成时间、墙钟或随机ID |
| ToolCallBinding | `{identity:ToolCallIdentity,side:request或result,blockOrdinal:Count或null}`；request的blockOrdinal指向助手content中的工具块；result固定null且对应整条tool消息 |
| DependencyEdge | `{fromRecordRef:Ref,toRecordRef:Ref,kind:tool_result_of或requires}`；方向为依赖方→必要前驱；端点均为recordRef，不是callId、unitRef或原文 |
| SourceRecord | `{recordRef:Ref,identity:SourceIdentity,contentRef:Artifact,message:ContextMessage或null,orderKey:SourceOrderKey,callBindings:ToolCallBinding[],dependencies:DependencyEdge[]}`；message仅用于已规范化消息，普通资料/Memory的message=null，正文由同批SourceReadResult.contents提供，不留给纯算法延迟读取；非工具记录callBindings=[] |
| CausalUnit | `{unitRef:Ref,memberRefs:Ref[]}`；成员为1至maxRecords个唯一recordRef；完整助手消息及其全部已确认工具结果属于同一不可拆单元；同一记录可被不同单元引用，最终只输出一次 |
| ToolCallProjection | `{identity:ToolCallIdentity,frameCallId:Ref,requestRecordRef:Ref,resultRecordRef:Ref}`；渲染映射写入受控Trace，不写普通遥测 |

身份编码复用FE-C14N-1与SHA-256：`recordRef="ctx-rec:"+hex(H(canonical(SourceIdentity)))`；`unitRef="ctx-unit:"+hex(H(canonical({memberRefs:按规范输出序排列的成员})))`。存储/访问作用域来自TrustedScope，不从正文传入。遇到同摘要却身份不同必须拒绝，不能依赖哈希覆盖记录。来源遍历路径、当前组装Run、当前Session版本和读取时间不进入原事件身份；将RA事件从Session快照继承到RB时仍保留RA。

**reader转换与顺序：**

- Session历史通过CD-1的`SessionDelta.sourceRunId + HistoryTurn.modelCommandId + TranscriptEntry`恢复原身份；Run reader从原权威转录读取同一身份。original event及recordIndex必须来自持久来源；无法恢复则返回SCHEMA_INVALID，不现场生成UUID。跨来源读到同一事件时recordRef相同。
- `sourceOrdinal`按实际存在的父候选、自身Session、当前Run、单Memory视图、资料输入序从0连续派生，缺席来源不占位；Session的sequence为快照提交序，Run为转录序，Memory为scoreRank/entryId排序后的序号，资料为片段内序。recordOrdinal是同序号原位置；完成时间不参与排序。
- 同recordRef出现在Session和Run时，验证原身份、正文及调用/依赖关系一致，选择字典序最小的SourceOrderKey作输出位置；引用所在存储路径可以不同，必须核验正文规范字节相等。相同文本不同recordRef不去重；同身份异正文返回DIGEST_MISMATCH，关系矛盾返回BINDING_MISMATCH。
- request绑定必须指向助手消息中实际的tool_call块，其callId等于该块toolCallId；同一模型命令内重复callId拒绝。result的callId及toolName必须对应其原请求，原始Run与modelCommandId从权威命令关联读取，禁止依据相邻消息猜测。顺序为助手在前、结果按助手工具块下标排列；结果到达顺序不参与排序。
- CD-1的ActionProposal/TranscriptEntry先由执行适配层根据权威命令关联转成本契约ContextMessage与ToolCallBinding，不能假定proposalId就是callId。Child声明和结果按§2.2转成child_task及task_observation，不伪装成tool结果。KernelAssistantMessage.runtimeMessageRef仅为Adapter不透明引用，不允许用它绕过规范消息与身份校验恢复另一套正文。
- Memory identity来自spaceId/entryId/version，Artifact identity来自显式source/version/fragmentRef；资料片段必须由上层提供有界Artifact，不由组装器重新切片生成不稳定身份。Memory的scoreRank来自CD-1 MemoryView.rankedEntries；按排名升序、entryId ASCII升序固定序列，不能按正文或返回时间现场补排名。跨视图重复同条目只输出一次，保留最小SourceOrderKey，排名差异不是Entry内容冲突。

**引用空间与依赖闭包：**

1. Requirement.memberRefs及ParentContextSliceSpec.candidateRefs/requiredRefs统一引用本节recordRef；声明者在冻结请求前按同一身份规则生成，不能传来源容器ID或callId。一个资料声明多个片段时必须逐个列出。Parent候选须包含所选单元及显式依赖所需记录，否则拒绝，不扩大父可读范围。
2. 每个result必须恰好对应一个request绑定；一个request必须恰好有一个已确认终态结果（成功或失败）。重复投递同一原事件可去重；不同原事件声称同一调用的终态，即便文本相同也返回BINDING_MISMATCH，交执行权威核对，不由组装器选“最新”。结果未知、流式片段和缺结果均不能伪装成完整轮次。
3. 工具结果记录到助手记录的tool_result_of边由配对规则生成；来源若携带该边必须完全一致。一个助手含多个调用时，全部结果与助手形成原子单元；不要再加反向依赖边制造环。文本助手或普通资料可单独成单元。
4. requires由可信任务/来源契约声明，不能从资料正文指令中提取。每条边的from必须等于携带它的SourceRecord.recordRef。自引用、缺端点、环返回SCHEMA_INVALID；未知kind拒绝；关系总数受maxEdges约束，不尝试自动修复或读取未绑定来源。
5. 选中record意味着选中包含它的完整单元，再传递补齐其前驱单元；以集合去重至不再增长。必选闭包缺失/越权明确失败；必选闭包仅Token估算超目标时保留并标记；超过硬容量返回CONTEXT_LIMIT。可选闭包合法但超预算则整组不选，不影响此前选择。最终稳定拓扑排序以SourceOrderKey、recordRef ASCII作同优先级裁决，工具结果使用已定义块顺序；同源普通历史的依赖不能指向较晚事件；多结果仅按已声明块序规范化，不把结果到达次序当业务顺序。

**Frame渲染后的调用标识：** 每个完整ToolCallIdentity按规范字节排序，得到从0开始的稳定序号，生成`frameCallId="ctxcall_"+十进制序号`；这是Frame内局部唯一映射，不是新的执行命令或幂等身份。每个请求块与对应结果同步替换toolCallId，文本、参数、toolName和失败标记不变；原始转录不改写。重新校验每个ID有且仅有一对请求/结果。Provider Adapter必须使用规范Frame，不能因runtimeMessageRef改发旧原生消息；Provider对ID的额外格式限制在其适配契约验证，不截断造成碰撞。预算在此映射之后计算。

**结构关系验收向量（待实现/未运行）：** 所有夹具固定输入、顺序和预算，期望关系直接写成常量，不能调用被测配对算法生成。

| 测试ID | 输入/故障 | 独立期望 |
|---|---|---|
| CTX-REL-T-01 | RA/M1/c1调用read(A)，RB/M1/c1调用read(B)，分别结果A/B；交换两个结果读取到达顺序 | RA只配A、RB只配B；两个完整单元，规范输出不随到达顺序变化；Parent继承仍保留RA |
| CTX-REL-T-02 | 同RA的M1和M2都使用c1；再将M2结果错误声明为M1 | 正常向量两对；错误向量因M1双终态/M2缺结果拒绝，模型调用0 |
| CTX-REL-T-03 | 可选资料D2 requires D1；固定完整估算闭包70、剩余60，再将剩余改70；另将D2声明必选且剩余60 | 依次D1/D2均不选、两者均选、两者均保留且required_over_target；另测字节硬上限超出返回CONTEXT_LIMIT，不允许只选D2 |
| CTX-REL-T-04 | 分别注入D1→不存在记录、自环D1→D1、D1↔D2及越权前驱 | 前三者SCHEMA_INVALID，越权ACCESS_DENIED；可用Frame和模型调用均0 |
| CTX-REL-T-05 | 同RA原事件从Session与Run各读取一次；另一独立事件文本相同；再分别改重复事件正文/调用身份 | 正常仅合并原事件重复，保留独立事件；改正文DIGEST_MISMATCH，改关系BINDING_MISMATCH |
| CTX-REL-T-06 | T-01两对均选入；另一个助手含cA/cB，结果按cB/cA到达 | Frame各调用ID唯一、每个结果匹配自身ID；多调用助手在前、结果cA再cB；Trace可还原原三元组，原转录不变；Provider spy只见规范Frame |

### 2.2 来源读取结果与业务转换

SourceReader是注册式适配接口，四类实现分别读Session历史、Run转录、Memory视图及资料Artifact。协议定义位于`src/contracts/control/context-engine/source-reader.ts`，组装协作位于`src/control/context-engine/`；业务事件投影由执行适配层提供，Pi转换仍在`src/infrastructure/adapters/pi-context/`。来源转换不能藏进可切换选择算法。

| 类型/操作 | 完整字段与约束 |
|---|---|
| SourceReadBinding | 封闭联合：`{kind:session,anchor:SessionAnchor,recordRefs:Ref[]或null}`、`{kind:run,runId:Ref,version:Count,headRef:Ref}`、`{kind:memory,input:MemoryAssemblySource}`、`{kind:material,input:MaterialSource}`；Session的null仅用于允许完整读取的自身历史，Parent必须为显式candidateRefs |
| SourceReadRequest | `{binding:SourceReadBinding,sourceOrdinal:Count,limits:{maxRecords:Count,maxBytes:Count}}`；由AssemblyBasis派生，不接受reader自行增添来源；Session/Run为空意图时不发读取请求 |
| ResolvedSourceContent | `{recordRef:Ref,kind:material,value:MaterialProjection}`或`{recordRef:Ref,kind:memory,value:MemoryProjection,scoreRank:Count}`；普通记录恰好对应一个正文值，message记录不得再带此项 |
| SourceReadResult | `{records:SourceRecord[],contents:ResolvedSourceContent[]}`；完整不可变批次，引用无悬空/重复；正文与contentRef原内容经解析规则核验，绑定版本、身份和大小全部通过才返回 |
| SourceReader.read | `read(request:SourceReadRequest,signal:AbortSignal):Promise<SourceReadResult>`；失败抛出本组件封闭错误；受限读取能力由组合根注入，不从可序列化输入自签；错误按§4，不返回半批成功 |
| FrozenHistorySource | 宿主进程内准备值 `{binding:Session或Run的SourceReadBinding,result:SourceReadResult}`。Session绑定的recordRefs固定null，代表已完成受限读取的完整确切版本；Parent读取请求再按candidateRefs收窄。不是新的持久化协议 |
| ContextEngineFactory | 宿主进程内按冻结来源创建独占 `ContextEnginePort`；真正组装端口为 `assemble(basis:AssemblyBasis,signal:AbortSignal):Promise<AssemblyCandidate>`。只计算候选，不承担Session创建、保存或采纳 |

宿主冻结历史后，FrozenHistoryReader复制并冻结原批次，精确匹配Session的sessionId/version/head或Run的runId/version/head；未匹配及多重匹配均拒绝。请求中指定的记录必须全部存在，不能以过滤后空集合掩盖缺失。读取仅调整本次sourceOrdinal，不修改原事件身份、正文或依赖；超出剩余记录/字节容量明确失败。宿主仍须在冻结前验证当前读取资格、正文摘要和历史完整性，在最终提交时复核版本与执行资格。该读取器不代替权威Session/Run存储，也不证明真实入口已完成迁移。对应验证为AK-CTX-118/119。

**读取次序和硬容量。** 来源按父候选、自身Session、当前Run、单Memory视图、资料输入序产生sourceOrdinal；来源缺席不发请求，次序由冻结AssemblyBasis确定。maxSources包含三个固定输入读取。maxWorkingBytes约束已解码固定输入与完整规范批次的规范JSON字节累计；每批request.limits传剩余记录数与字节数，reader另在读取前检查该批引用声明的原始字节，不能以这个逻辑口径宣称进程RSS上限。maxBytes单独约束完整Pi模型输入映射的规范JSON字节；maxCandidateBytes约束含Trace和计量的整个候选。三个限额均为正数，由受信配置明确提供。读取串行await，零内部重试。

**固定正文Schema。** system/task及资料片段使用`{schemaVersion:ctx-text-1,text:BodyText}`；tools使用`{schemaVersion:ctx-tools-1,tools:ToolDescriptor[]}`，工具名唯一。空固定文本及空工具允许，读取失败不得转为空；Child任务和结果说明必须非空。首版一个MaterialSource是一个上层预切片Artifact，fragmentRef等于sourceRef。未知字段/版本拒绝，组装器不解析PDF等任意文件。ContextArtifactReader的`read(ref:Artifact,signal:AbortSignal):Promise<unknown>`负责受控读取及摘要验证，不暴露写端口。

**Memory与资料场景。** 每次最多一个视图；source.required仅要求读取成功，成功空视图允许。仅Requirement指定的记录为内容必选；空视图若缺必选引用则失败。同scoreRank按entryId ASCII排序。 调用方冻结查询、Space/索引/算法版本及允许视图，保存MemoryView为viewRef后才assemble。Memory reader核对view的spaceId/version/epoch/indexVersion/algorithmVersion与source完全相等，queryDigest等于queryRef内容按CD-1规范计算的摘要，再解析rankedEntries的正文引用。初次受理前没有受控查询入口则准备失败，不调用需要现存Run的query。查询结果排名属于视图，不写进MemoryEntry，也不进入模型；同一查询输入和冻结索引必须产生同序视图。材料reader解析明确contentRef，输出MaterialProjection；Memory正文输出MemoryProjection。均不将元数据对象当正文，不自动获取Session所有元数据，不沿sourceRef扩展读取。结构/摘要/授权错误拒绝整个批次；可选来源暂时不可用才允许整来源降级并记degradedSources。

**Child返回场景。** 执行适配层依据父Run已提交的HistoryTurn及权威Child关联，完成纯业务投影。助手child块映射为child_task；task来自ChildSpec.inputRef内已冻结、允许展示的任务正文，不序列化整份受理/授权绑定。stopReason=child映射为stop，tools映射tool_use，answer映射stop。结果仅接受父侧已经确认消费的SUCCEEDED/FAILED事实；成功须有resultRef，失败须有errorRef，text分别为受控读取的结果正文或规范失败说明，不能包含原始异常栈或权限数据。原始ChildRun终态必须先经过CD-1 ChildRunFinalizedEvent及Coordinator确认，Context不自行订阅事件或判定Join。

完整性必须在选择之前与expectedChildObservations逐项对账：声明数、观察数、身份、recordRef和状态完全匹配；遗漏任一观察、重复终态、空说明或UNKNOWN均拒绝。可信历史适配器提供历史用户任务及回答的requires关系，不能由模型文本推测；用户任务与回答同轮裁剪。组装器验证已提交边的端点和环，原事件正文真实性、未返回的普通用户历史完整性仍由受信reader保证，是宿主接入必须测试的风险。

task_observation的SourceIdentity使用父侧已提交结果事件的原Run/event/recordIndex；childId/childRunId和resultRef/errorRef保留Child来源。继承同一父事件不能改身份，Child内部转录不得混作父工具结果。观察到声明所在助手记录建立requires边，按助手child块位置排列结果，声明及全部工具/Child结果共同组成完整轮次原子单元；未知关联、重复终态、缺声明或前驱不在允许范围均拒绝。UNKNOWN、局部超时/取消及未提交Join决定不能编造成功/失败观察；外部先完成协调，再以当前任务或已确认业务事件准备新输入。这里不新增Join outcome协议。

读取结束后，WorkingSet持有全部规范消息及已解析正文，结构整理与算法阶段I/O为0。Pi默认映射和备选临时历史映射共用本契约Child规则，保留recordRef一一对应；Pi建议切在观察之前时仍由公共闭包补齐整轮，不生成孤立结果。新增来源变体须同步binding、reader注册、身份/正文映射及验收，未知kind拒绝。

## 3. 调用方保存、Run采纳及恢复契约

不设置AssemblyReceipt、findAssembly或confirmAssembly。Context结束于候选返回；下表约束外部业务处理器，与§1绑定流程共同构成调用契约。

### 3.1 生产者、消费者与迁移验收

| 旧约定 → 新约定 | 生产者 → 消费者 | 必须观察到的验收行为 |
|---|---|---|
| assemble/appendTurn → 异步assemble完整确定历史 | Host、Session/Run reader → CE | 首次、工具后续、跨Run三种场景实际调用新CE；读取失败不变空历史 |
| 先创建 → 冻结准备、组装、ensure/branch、保存、条件受理 | Host → SessionManager、RunRegistry | 组装失败无自动Session/Run；创建竞争重新读取真实锚点；原命令重放身份不变 |
| 模型Frame → RunContextBinding引用 | Host → Run条件提交 | 固定inputDigest、payloadDigest、实际Session锚点、Run版本/head及promptRef，不保存第二份正文 |
| `{sessionId,frame,tools}` → `{sessionId,payload,formatVersion,modelAdapterVersion}` | 候选解码器 → AgentAdapter | 工具只从payload.tools读取；Trace不得进入模型；未知格式在调用模型前失败 |
| 原生消息引用恢复 → pi-context-1规范映射 | PiContextAdapter → Pi | 估算和派发共用转换规则；候选被裁剪或ID重映射后，不允许runtimeMessageRef覆盖正文 |
| 同步prepare → 可取消异步prepare | FlowDriver → Host准备器 | 等待期间续租；等待返回后检查取消、截止、Session版本及Run资格；旧A提交被拒绝 |
| Child工具消息 → child_task/task_observation | Coordinator已提交事实 → 历史reader、CE | 缺观察、空正文、UNKNOWN及父范围越界在选择前失败；清单不从reader返回值生成 |

`RunContextBinding`是Run对已保存候选的引用，不是模型载荷。`AgentTurnRequest`只包含上表四字段，不提供平行tools、frame或Trace。候选解码同时验证完整字段、引用关系、payload摘要及冻结版本，拒绝旧格式和未知字段；Artifact端先验证完整保存对象摘要。恢复使用相同解码器，不能以TypeScript类型断言替代运行时验证。

首次准备记录由Host持有，保存稳定preparationId、plannedRunId及完整AssemblyBasis；原输入异载荷冲突。Session历史保存原用户任务、事件身份、模型命令身份及依赖。当前task仅放固定输入；成为过去Run后，历史用户记录与回答建立显式requires边。两个入口复用同一投影规则，不从回答反推任务、不把当前task重复投影。

持久入口用真实SQLite保存准备、Session版本/单Run绑定和条件提交事实；内存入口实现相同领域语义，但进程退出丢失内存状态。持久入口的子进程测试分别在创建、保存、采纳前后退出并丢失响应；已采纳恢复保持原候选，模型Started无Completed沿既有执行对账处理，不重新派发。

### 3.2 保存与恢复窗口

| 状态/操作 | 权威事实与行为 |
|---|---|
| 候选仅在内存 | 无promptRef；进程退出不保证保留候选。确认原Run操作未采纳后，允许按冻结输入重新组装，可选来源可用性差异尚未成为业务事实 |
| 保存候选 | 调用方将完整AssemblyCandidate作为一个受控Artifact保存，取得promptRef及保留凭据；payload/trace/计量同生共存，不用第二张组装回执表。存储元数据绑定schemaVersion=ctx-candidate-1及可信scope |
| Run采纳 | 外部条件提交固定原操作身份、inputDigest、CandidateSessionBinding、promptRef和InvokeModel命令；核对当前步骤/版本/执行资格及Artifact完整性和保留关系。提交成功为唯一采纳点，模型只能从该命令派发 |
| 保存失败/响应丢失 | 按Artifact稳定写入身份核对；没有可读且受保留的完整Artifact不得采纳。未采纳孤立产物由存储保留/GC规则处理，不触发模型 |
| 采纳响应未知 | 查询当前Run权威提交事实。found恢复原promptRef；unknown等待核对；确认absent才允许重算。不能回放历史absent作为现在未提交的证明 |
| 已采纳恢复 | 按schemaVersion解码完整候选，核验Artifact及payload摘要、输入摘要、绑定和适配版本；复用原payload/trace/计量，不读latest、不调用新策略。损坏、已回收或版本不可用明确失败，不重建成另一份内容 |
| 交付与执行 | 当前安全边界复核受保护正文读取与派发权限；AssemblyTrace不交付模型。Activity Completed复用执行结果；Started无Completed进入原执行对账，不因上下文可恢复而重新调用模型 |

候选Artifact的活跃引用和保留周期沿用业务Run/Artifact协议；Context无持久表、缓存正确性或清理职责。Session创建和Artifact保存不与Run跨库组成一个假事务，前置成功后后续失败分别按原权威核对；最终业务提交必须保持绑定与命令原子一致。具体存储端口和Activity映射由调用方实现前复核，不能在纯组装策略内新增。

## 4. 失败、重试和Activity适配

| 结果 | 调用语义 |
|---|---|
| SCHEMA_INVALID / BINDING_MISMATCH / DIGEST_MISMATCH | 结构、来源身份或内容错误，拒绝，不修补或降级 |
| FORMAT_UNSUPPORTED | 旧候选格式或不可用的载荷/模型映射版本明确拒绝；不转换、不重组装、不删除数据 |
| NOT_FOUND / GONE | 必需来源或指定快照缺失；不创建空内容替代 |
| ACCESS_DENIED / ACTION_APPROVAL_REQUIRED / PERMISSION_UNAVAILABLE | 安全错误，optional也不能吞掉，不释放正文 |
| CONTEXT_LIMIT | 字节或来源/记录/关系等硬容量无法满足，交调用方调整任务；仅Token估算超目标不返回此错误 |
| DEPENDENCY_UNAVAILABLE / TRANSPORT_UNAVAILABLE | 明确可选来源可降级；必需来源仅由唯一重试所有者有界只读重试 |
| IDEMPOTENCY_CONFLICT / VERSION_CONFLICT | 输入身份或业务版本不匹配，重新决策，不覆盖 |
| CANCELLED / DEADLINE_EXCEEDED | 停止组装，已保存候选不授权模型执行 |
| UNKNOWN | 只核对权威回执/Activity，不当作absent重发 |

组件内部读取尝试一次，无自动重试。必传AbortSignal；外部受信宿主按请求截止和TimePort创建取消信号，reader必须响应并结束原调用。每次await前后检查信号，原读取未结束不得提前返回或复用实例；同步纯算法不能被信号抢占。宿主若重试须重新核对当前资格并复用冻结输入，自行承担尝试上限，不能与reader叠乘。Activity Started无Completed遵循公共FlowJournal对账，不由Context另建状态机。Activity的name/version/inputDigest绑定实际操作；候选或promptRef存在不授权模型重发。

本契约待G3联合复核跨组件归属、可编译Schema及Activity具体操作映射；本文提供候选行为，不把批准或实现标为完成。
