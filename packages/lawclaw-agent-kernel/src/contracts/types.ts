/**
 * 允许出现在 Agent Kernel 公开契约里的 JSON 值。
 *
 * 约束：不得把 Pi、Node.js、SQLite 或业务领域对象伪装为 JSON 值跨越边界。
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { readonly [key: string]: JsonValue };

/** 由 Backend 签发的可信租户上下文；Agent Kernel 只消费，不负责认证或 RBAC 计算。 */
export interface TenantContext {
	/** 当前操作唯一所属租户；所有资源访问都必须与其一致。 */
	readonly tenantId: string;
	/** 已认证主体的稳定标识；不得作为日志中的直接个人信息使用。 */
	readonly subjectId: string;
	/** Backend 生成的授权快照引用；Kernel 只验证存在性，不解释业务权限。 */
	readonly authorizationSnapshot: string;
	/** 上下文签发时间，使用 ISO-8601 UTC。 */
	readonly issuedAt: string;
	/** 上下文失效时间，使用 ISO-8601 UTC；过期时必须默认拒绝。 */
	readonly expiresAt: string;
	/** 租户上下文契约版本；未知主版本必须拒绝。 */
	readonly contextVersion: "1";
}

/** 一次调用的运维上下文；用于 Trace、关联、截止时间和安全审计，不承载业务状态。 */
export interface OperationContext {
	/** 全链路 Trace 标识。 */
	readonly traceId: string;
	/** 当前 Span 标识。 */
	readonly spanId: string;
	/** 将命令、事件和调用方请求关联起来的稳定标识。 */
	readonly correlationId: string;
	/** 可选的直接原因标识；子操作可以派生，但不得改变租户身份。 */
	readonly causationId?: string;
	/** 操作绝对截止时间，使用 ISO-8601 UTC。 */
	readonly deadlineAt: string;
	/** 调用开始时间，使用 ISO-8601 UTC。 */
	readonly requestStartedAt: string;
}

/** 调用方明确选择的时间语义；时区只参与本地时间解释和展示，不改变绝对时间。 */
export interface TimeContext {
	/** IANA 时区标识，例如 Asia/Shanghai；固定偏移量和系统默认时区不得代替它。 */
	readonly timeZone: string;
	/** BCP 47 语言标签，例如 zh-CN；只影响本地化展示，不影响持久化与比较。 */
	readonly locale: string;
}

/** 可比较、可持久化的 UTC 时间点；两个字段必须表达同一瞬间。 */
export interface TimePoint {
	/** Unix Epoch 毫秒，用于排序、预算和截止时间计算。 */
	readonly epochMilliseconds: number;
	/** 规范化 ISO-8601 UTC 字符串，固定以 Z 结尾，用于契约和事件。 */
	readonly isoUtc: string;
}

/** 将 UTC 时间点投影到指定 IANA 时区后的只读展示值。 */
export interface ZonedDateTimeView {
	/** 原始 UTC 时间点；转换不得改变其绝对瞬间。 */
	readonly instant: TimePoint;
	/** 实际采用的 IANA 时区标识。 */
	readonly timeZone: string;
	/** 该瞬间在目标时区的 UTC 偏移，例如 GMT+08:00；夏令时由时区数据库决定。 */
	readonly utcOffset: string;
	/** 不带偏移量的本地日期时间，仅供展示；不得作为持久化或排序依据。 */
	readonly localDateTime: string;
	/** 根据 locale 和 timeZone 生成的本地化展示文本。 */
	readonly localizedText: string;
}

/**
 * Kernel 使用的统一时间基础设施端口。
 *
 * 所有权：Kernel 定义所需时间语义，Infrastructure Adapter 提供系统时钟与 IANA 转换机制。
 * 一致性：领域状态、事件和协议只保存 UTC；本地时间只能作为显式 TimeContext 下的投影。
 * 可测试性：测试实现可以注入固定时钟；Kernel 和其他 Adapter 不得直接读取系统时间。
 */
export interface TimePort {
	/** 返回当前 UTC 时间点；同一次业务判断应复用返回值，避免跨调用漂移。 */
	now(): TimePoint;

	/** 返回进程内单调递增时间，专用于耗时计算；不得持久化或转换为日历时间。 */
	monotonicMilliseconds(): number;

	/**
	 * 解析严格 ISO-8601 UTC 字符串。
	 * @param value 必须为 `YYYY-MM-DDTHH:mm:ss.sssZ` 形式的 UTC 字符串。
	 * @returns 规范化时间点；格式或日期无效时返回 undefined。
	 */
	parseIsoUtc(value: string): TimePoint | undefined;

	/**
	 * 在绝对时间上增加毫秒数，不执行日历或本地时区运算。
	 * @param base 作为计算起点的 UTC 时间点。
	 * @param deltaMilliseconds 可为负数的有限整数毫秒。
	 */
	addMilliseconds(base: TimePoint, deltaMilliseconds: number): TimePoint;

	/** 判断运行环境是否支持给定 IANA 时区标识。 */
	isTimeZoneSupported(timeZone: string): boolean;

	/** 判断运行环境是否支持给定 BCP 47 语言标签。 */
	isLocaleSupported(locale: string): boolean;

	/**
	 * 将 UTC 时间点转换为只读本地展示值。
	 * @param point 不可变的 UTC 时间点。
	 * @param context 显式 IANA 时区和语言环境。
	 * @throws KernelError 当时区或语言标签不受支持时抛出稳定契约错误。
	 */
	toZonedDateTime(point: TimePoint, context: TimeContext): ZonedDateTimeView;
}

/** 每个 Gateway、Port 和 Adapter 调用的首参数；显式绑定租户信任、运维传播和时间语义。 */
export interface RequestContext {
	/** Backend 签发且由 Kernel 只读消费的租户信任信息。 */
	readonly tenant: TenantContext;
	/** 贯穿本次调用及其下游操作的运维关联信息。 */
	readonly operation: OperationContext;
	/** Backend 选择并校验来源的本地时区语义；Kernel 不从主机默认值推断。 */
	readonly time: TimeContext;
}

/** 上下文数据的安全分级；Secret 不允许以内联正文进入 Agent Kernel。 */
export type DataClassification = "public" | "internal" | "confidential" | "secret";

/** Kernel 可选择的最小上下文单元；它是执行投影，不是业务 Conversation 或 Message。 */
export interface ContextItem {
	/** 在一次 Run 内稳定的上下文项标识。 */
	readonly itemId: string;
	/** 可审计来源引用；禁止自由 SQL、URL 或未授权绝对路径。 */
	readonly sourceRef: string;
	/** 用于选择和展示的规范化类别。 */
	readonly kind: "goal" | "instruction" | "document" | "tool_result" | "delegation_result";
	/** 首版允许的受限内联正文；敏感大载荷必须使用 ArtifactRef。 */
	readonly content: string;
	/** 数值越大优先级越高。 */
	readonly priority: number;
	/** 必选项无法放入预算时必须失败，不能静默删除。 */
	readonly required: boolean;
	/** 数据安全分级。 */
	readonly classification: DataClassification;
}

/** Kernel 规范化的用户消息；不包含任何 Pi 原生字段。 */
export interface KernelUserMessage {
	/** 消息角色判别字段；固定为用户消息。 */
	readonly role: "user";
	/** 已通过上下文选择后、允许交给 Runtime 的有界文本。 */
	readonly text: string;
}

/** Kernel 规范化的助手文本块。 */
export interface KernelTextBlock {
	/** 内容块判别字段；固定为文本。 */
	readonly type: "text";
	/** Runtime 生成的候选文本，不代表业务权威结论。 */
	readonly text: string;
}

/** Kernel 规范化的工具调用块；参数只能是 JSON 对象。 */
export interface KernelToolCallBlock {
	/** 内容块判别字段；固定为工具调用。 */
	readonly type: "tool_call";
	/** 单次调用的稳定关联标识，用于配对工具结果。 */
	readonly toolCallId: string;
	/** 请求调用的规范化工具名；最终是否允许由 ToolRuntime 判定。 */
	readonly toolName: string;
	/** Runtime 产生的 JSON 参数；进入 Provider 前仍需进行政策和大小校验。 */
	readonly arguments: Readonly<Record<string, JsonValue>>;
}

/** Kernel 规范化的助手消息；runtimeMessageRef 只是 Adapter 私有对象的不可解释引用。 */
export interface KernelAssistantMessage {
	/** 消息角色判别字段；固定为助手消息。 */
	readonly role: "assistant";
	/** Adapter 私有原生消息的租户隔离引用；调用方不得解释或持久化其内部结构。 */
	readonly runtimeMessageRef: string;
	/** 归一化后的候选文本和工具调用，按 Runtime 原始顺序排列。 */
	readonly content: readonly (KernelTextBlock | KernelToolCallBlock)[];
	/** 本轮停止原因；只有 Kernel 可以据此决定继续、完成或失败。 */
	readonly stopReason: "stop" | "tool_use" | "length" | "error" | "aborted";
}

/** Kernel 规范化的工具结果消息；只保存有界文本和技术错误标记。 */
export interface KernelToolResultMessage {
	/** 消息角色判别字段；固定为工具结果。 */
	readonly role: "tool";
	/** 与先前工具调用配对的稳定标识。 */
	readonly toolCallId: string;
	/** 实际执行的规范化工具名。 */
	readonly toolName: string;
	/** 经过大小限制和敏感信息处理的工具结果文本。 */
	readonly text: string;
	/** 是否为可返回给模型的技术错误结果，而非抛出的基础设施异常。 */
	readonly isError: boolean;
}

/** 一轮模型调用可见的规范化消息联合类型。 */
export type KernelMessage = KernelUserMessage | KernelAssistantMessage | KernelToolResultMessage;

/** 上下文裁剪的可解释轨迹；不得记录被裁剪正文。 */
export interface ContextReductionTrace {
	/** 因预算未被选入本次 Frame 的上下文项标识；不包含正文。 */
	readonly droppedItemIds: readonly string[];
	/** 被选入本次 Frame 的上下文项标识。 */
	readonly selectedItemIds: readonly string[];
	/** 触发本次选择或裁剪的稳定原因码。 */
	readonly reasonCodes: readonly ("LOW_PRIORITY" | "BUDGET_FIT")[];
	/** 选择前的保守 Token 估算值。 */
	readonly estimatedTokensBefore: number;
	/** 选择后的保守 Token 估算值。 */
	readonly estimatedTokensAfter: number;
}

/** 一次 Runtime turn 的不可变规范化输入；Pi Message 只能由 Adapter 临时映射。 */
export interface ContextFrame {
	/** 每次组装产生的不可变 Frame 标识。 */
	readonly frameId: string;
	/** Kernel 冻结的系统约束；Adapter 不得改写。 */
	readonly systemPrompt: string;
	/** 交给单次 Runtime turn 的规范化消息快照。 */
	readonly messages: readonly KernelMessage[];
	/** 当前 Frame 的保守 Token 估算，用于预算保护而非计费。 */
	readonly estimatedTokens: number;
	/** 本次上下文选择的可审计轨迹。 */
	readonly reductionTrace: ContextReductionTrace;
}

/** 创建首轮上下文的请求；必要项超出预算时返回稳定错误，不允许静默截断。 */
export interface ContextAssemblyRequest {
	/** 本次 Run 的系统级约束，优先于普通上下文项。 */
	readonly systemPrompt: string;
	/** 当前技术执行目标；不是业务 WorkflowStep。 */
	readonly goal: string;
	/** 可供 ContextEngine 选择的规范化上下文项。 */
	readonly items: readonly ContextItem[];
	/** 模型输入上下文的最大 Token 预算。 */
	readonly maxInputTokens: number;
	/** 为模型输出预留、不得被输入占用的 Token 数。 */
	readonly outputReserveTokens: number;
}

/** 与具体 Schema 库无关的 JSON Schema 子集。 */
export interface JsonObjectSchema {
	/** Schema 根节点类型；工具参数固定为 JSON 对象。 */
	readonly type: "object";
	/** 参数字段及其与具体 Schema 库无关的约束。 */
	readonly properties: Readonly<Record<string, JsonValue>>;
	/** 调用时必须出现的字段名。 */
	readonly required?: readonly string[];
	/** 是否允许声明之外的参数；安全工具通常应设为 false。 */
	readonly additionalProperties?: boolean;
}

/** 工具能力的稳定描述；Provider 只能实现描述，不能扩大 Kernel 的允许策略。 */
export interface ToolDescriptor {
	/** 跨 Adapter 稳定且全局不可歧义的工具名。 */
	readonly name: string;
	/** 工具契约版本；实现行为变化时必须按兼容规则演进。 */
	readonly version: string;
	/** 面向模型与开发者的能力、限制和副作用说明。 */
	readonly description: string;
	/** 工具静态风险分类；Kernel 会与 Run 政策取交集。 */
	readonly risk: "read_only" | "mutating" | "network" | "privileged";
	/** 工具接受的规范化 JSON 对象参数契约。 */
	readonly inputSchema: JsonObjectSchema;
	/** Provider 允许返回的 UTF-8 最大字节数。 */
	readonly maxResultBytes: number;
}

/** 一次 Run 冻结的工具政策；未列出的工具和风险类别一律拒绝。 */
export interface ToolPolicy {
	/** 本次 Run 明确允许的工具名白名单。 */
	readonly allowedToolNames: readonly string[];
	/** 本次 Run 明确允许的风险类别白名单。 */
	readonly allowedRisks: readonly ToolDescriptor["risk"][];
	/** 本次 Run 允许执行的工具调用总数。 */
	readonly maxCalls: number;
	/** 单次工具调用的超时毫秒数，超时信号必须向 Provider 传播。 */
	readonly perCallTimeoutMs: number;
	/** 单次工具调用 JSON 参数的 UTF-8 最大字节数。 */
	readonly maxArgumentsBytes: number;
}

/** 已通过模型生成、等待 ToolRuntime 进行政策校验的工具调用。 */
export interface ToolInvocation {
	/** 与助手消息中的调用块一致的关联标识。 */
	readonly toolCallId: string;
	/** 模型请求的工具名；未经 ToolRuntime 校验不能直接执行。 */
	readonly toolName: string;
	/** 待校验的 JSON 对象参数。 */
	readonly arguments: Readonly<Record<string, JsonValue>>;
}

/** ToolProviderPort 返回的规范化、有界结果。 */
export interface ToolResult {
	/** 返回模型的有界文本，不得包含 Secret 或未授权资源信息。 */
	readonly text: string;
	/** 表示工具完成但产生了可呈现的技术错误。 */
	readonly isError: boolean;
	/** 用于审计和观测的非敏感结构化元数据。 */
	readonly metadata: Readonly<Record<string, JsonValue>>;
}

/**
 * 工具实现的下行端口。
 *
 * 权限：只执行已经由 ToolRuntime 授权的请求；不得自行改变工具政策。
 * 租户：所有方法显式接收 RequestContext，资源必须限制在同一 tenant。
 * 取消：execute 必须尊重 AbortSignal；超时后不得继续产生副作用。
 * 错误：机制错误映射为稳定 KernelError，不泄漏路径外信息或 Secret。
 */
export interface ToolProviderPort {
	/**
	 * 返回当前租户作用域内可注册的工具描述。
	 *
	 * @param context 可信租户和运维上下文；Provider 不得跨租户缓存描述结果。
	 * @returns 稳定、版本化且不包含具体 SDK 类型的工具描述列表。
	 * @throws KernelError 当上下文无效或描述无法安全产生时抛出。
	 */
	describe(context: RequestContext): Promise<readonly ToolDescriptor[]>;
	/**
	 * 执行一项已经由 ToolRuntime 授权的工具调用。
	 *
	 * @param context 资源访问必须遵守的租户和运维上下文。
	 * @param invocation 已通过名称、风险和参数大小校验的调用。
	 * @param signal 取消与超时信号；收到后必须尽快停止且不得继续副作用。
	 * @returns 经过大小限制和脱敏处理的规范化结果。
	 * @throws KernelError 当执行机制失败、路径越界或安全约束不满足时抛出。
	 */
	execute(context: RequestContext, invocation: ToolInvocation, signal: AbortSignal): Promise<ToolResult>;
}

/** 单层子 Agent 的冻结政策；最大深度只能为 1。 */
export interface DelegationPolicy {
	/** 是否允许当前 Run 创建技术子 Agent。 */
	readonly enabled: boolean;
	/** 最大委派深度；首版固定为一层。 */
	readonly maxDepth: 1;
	/** 单个父 Run 允许创建的子 Agent 数量上限。 */
	readonly maxChildren: number;
	/** 单个子 Agent 的绝对执行超时毫秒数。 */
	readonly timeoutMs: number;
	/** 委派任务正文允许的最大字符数。 */
	readonly maxTaskChars: number;
	/** 子 Agent 摘要允许的最大 UTF-8 字节数。 */
	readonly maxResultBytes: number;
}

/** Kernel 发给 DelegationProviderPort 的技术委派请求；不得携带 WorkflowStep。 */
export interface DelegationRequest {
	/** 单次技术委派的稳定标识。 */
	readonly delegationId: string;
	/** 发起委派的父 Run 标识；不得替代业务 WorkflowStep 标识。 */
	readonly parentRunId: string;
	/** 发起方所处的技术委派深度；父 Run 为 0。 */
	readonly depth: number;
	/** 子 Agent 要完成的有界技术目标。 */
	readonly task: string;
	/** 子 Agent 允许访问的工作区根目录。 */
	readonly workspaceRoot: string;
	/** 可选的模型能力引用；Provider 负责映射，不能泄漏具体 Runtime 对象。 */
	readonly modelRef?: string;
}

/** 子 Agent 的规范化结果；父 Run 只能接收摘要和技术状态。 */
export interface DelegationResult {
	/** 新建技术子 Run 的稳定标识。 */
	readonly childRunId: string;
	/** 返回父 Run 的有界候选摘要，不是业务权威结论。 */
	readonly summary: string;
	/** 子 Run 的规范化终态。 */
	readonly status: "completed" | "failed" | "cancelled";
}

/**
 * 子 Agent 执行机制端口。
 *
 * 边界：Provider 只启动一次已授权的技术子 Run，不能创建业务步骤或递归委派。
 * 韧性：必须有超时、取消和输出上限；失败返回稳定技术状态。
 */
export interface DelegationProviderPort {
	/**
	 * 启动并等待一个已授权的单层技术子 Run。
	 *
	 * @param context 父子 Run 共享且不可改写的租户与运维上下文。
	 * @param request 已由 DelegationEngine 校验深度、数量和正文大小的请求。
	 * @param signal 父 Run 取消或委派超时信号，必须向子进程或子 Runtime 传播。
	 * @returns 只包含子 Run 标识、候选摘要和技术终态的规范化结果。
	 * @throws KernelError 当子 Run 无法启动、超时、协议异常或结果越界时抛出。
	 */
	executeChild(context: RequestContext, request: DelegationRequest, signal: AbortSignal): Promise<DelegationResult>;
}

/** 一轮 Adapter 调用的固定输入；Adapter 不得改变 Context、Tool 或预算政策。 */
export interface AgentTurnRequest {
	/** Kernel 维护的逻辑 Session 标识；Adapter 只能做私有映射。 */
	readonly sessionId: string;
	/** 本轮不可变的规范化上下文快照。 */
	readonly frame: ContextFrame;
	/** 本轮允许暴露给 Runtime 的工具描述快照。 */
	readonly tools: readonly ToolDescriptor[];
}

/** 具体 Runtime 输出的规范化候选事件；Kernel 决定是否记录和如何推进状态。 */
export type RuntimeEventCandidate =
	| { readonly type: "text_delta"; readonly text: string }
	| { readonly type: "turn_completed"; readonly message: KernelAssistantMessage }
	| { readonly type: "turn_failed"; readonly errorCode: string; readonly retryable: boolean };

/**
 * 具体 Agent Runtime 的下行适配端口。
 *
 * 输入输出：只使用本文件中的规范化类型，Pi Session/Event/Tool/Provider 不得外泄。
 * 生命周期：一次调用只执行一个 Runtime turn；Agent Loop 由 Kernel 驱动。
 * 取消：必须把 AbortSignal 传播到底层 Runtime。
 * 错误：底层异常必须映射为稳定候选事件，不得暴露 SDK 堆栈或密钥。
 */
export interface AgentAdapter {
	/**
	 * 执行一个且仅一个 Runtime turn，并流式返回规范化候选事件。
	 *
	 * @param context Adapter 必须执行隔离和链路传播的租户、运维上下文。
	 * @param request Kernel 冻结的 Session、ContextFrame 和工具描述。
	 * @param signal Run 的取消或截止时间信号，必须传递给底层 Runtime。
	 * @returns 文本增量以及唯一的完成或失败候选事件流。
	 * @throws KernelError 当输入无法映射或底层协议违反边界契约时抛出。
	 */
	executeTurn(
		context: RequestContext,
		request: AgentTurnRequest,
		signal: AbortSignal,
	): AsyncIterable<RuntimeEventCandidate>;
}

/** 单次 Agent Run 的有界执行预算。 */
export interface AgentExecutionBudget {
	/** Agent Loop 允许执行的最大模型轮次。 */
	readonly maxTurns: number;
	/** Agent Loop 允许执行的最大工具调用总数。 */
	readonly maxToolCalls: number;
	/** 整个 Run 允许执行的最大墙钟时间，单位为毫秒。 */
	readonly maxDurationMs: number;
	/** 每轮上下文允许使用的最大输入 Token 估算。 */
	readonly maxInputTokens: number;
	/** 为模型输出预留的 Token 数，不能被输入上下文占用。 */
	readonly outputReserveTokens: number;
	/** 单个 Run 可产生的助手文本字符上限；流式增量和最终消息都必须受其约束。 */
	readonly maxOutputChars: number;
}

/** 启动 Agent Run 的规范化命令；它不包含业务 Workflow 或 ApprovalCase。 */
export interface StartAgentRunCommand {
	/** 调用方生成的技术 Run 标识。 */
	readonly runId: string;
	/** 用于承接多轮 Runtime 消息关联的逻辑 Session 标识。 */
	readonly sessionId: string;
	/** 本次 Run 不可被 Adapter 改写的系统约束。 */
	readonly systemPrompt: string;
	/** 本次 Run 要完成的技术目标；不是业务流程步骤。 */
	readonly goal: string;
	/** 可供 ContextEngine 选择的初始上下文项。 */
	readonly contextItems: readonly ContextItem[];
	/** 本次 Run 冻结的工具权限和资源上限。 */
	readonly toolPolicy: ToolPolicy;
	/** 本次 Run 冻结的单层子 Agent 政策。 */
	readonly delegationPolicy: DelegationPolicy;
	/** 本次 Run 冻结的整体执行预算。 */
	readonly budget: AgentExecutionBudget;
	/** 工具和子 Agent 允许访问的工作区根目录。 */
	readonly workspaceRoot: string;
}

/** 对外返回的规范化技术运行结果；业务编排仍负责决定是否采纳 output。 */
export interface AgentRunResult {
	/** 与启动命令一致的技术 Run 标识。 */
	readonly runId: string;
	/** Run 的规范化技术终态。 */
	readonly status: "completed" | "failed" | "cancelled";
	/** 模型最终候选文本；失败或取消时为空。 */
	readonly output: string;
	/** 本次 Run 实际执行的模型轮次。 */
	readonly turns: number;
	/** 本次 Run 实际执行的工具调用数，包含技术委派。 */
	readonly toolCalls: number;
	/** 按严格递增序号排列的内存技术事件。 */
	readonly events: readonly AgentEvent[];
	/** Run 结束前最后一次完整的规范化上下文快照。 */
	readonly lastFrame: ContextFrame;
}

/** Agent Kernel 的规范化技术事件；seq 在单 Run 内严格递增。 */
export interface AgentEvent {
	/** 事件所属的技术 Run 标识。 */
	readonly runId: string;
	/** 单 Run 内从 1 开始严格递增的事件序号。 */
	readonly seq: number;
	/** 规范化技术事件类型，不包含业务状态迁移语义。 */
	readonly type:
		| "RunStarted"
		| "ContextAssembled"
		| "OutputDelta"
		| "ToolStarted"
		| "ToolCompleted"
		| "ChildRunStarted"
		| "ChildRunCompleted"
		| "RunCompleted"
		| "RunCancelled"
		| "RunFailed";
	/** 事件发生时间，使用 ISO-8601 UTC。 */
	readonly occurredAt: string;
	/** 不包含 Secret、Prompt 正文或工具参数的安全事件摘要。 */
	readonly data: Readonly<Record<string, JsonValue>>;
}
