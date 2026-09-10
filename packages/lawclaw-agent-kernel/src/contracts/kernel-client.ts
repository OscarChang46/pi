import type { TuiContentPage, TuiRunSnapshot } from "./kernel-tui.ts";

/** 第一阶段公共配置选择；null 模型由服务解析。 */
export interface KernelSelection {
	/** 已配置的 Agent 标识。 */ readonly agentId: string;
	/** 已配置的模型标识或服务默认值。 */ readonly modelId: string | null;
}
/** 已确认会话历史锚点。 */
export interface KernelSessionAnchor {
	/** 会话标识。 */ readonly sessionId: string;
	/** 已采纳历史版本。 */ readonly version: number;
	/** 已采纳历史头。 */ readonly headRef: string;
}
/** 首次对话或续轮输入；不接受客户端拼接模型历史。 */
export interface KernelConversationInput {
	/** 新会话意图或明确的已有会话版本。 */ readonly session:
		| {
				/** 首次输入。 */
				readonly kind: "new";
				/** 稳定逻辑键。 */
				readonly logicalKey: string;
		  }
		| {
				/** 续轮。 */
				readonly kind: "existing";
				/** 已确认版本。 */
				readonly anchor: KernelSessionAnchor;
		  };
	/** 仅作用于本次新 Run。 */ readonly selection: KernelSelection;
	/** 保留空白的用户正文，最多 32 KiB。 */ readonly goal: string;
	/** 已授权材料引用，首期为空。 */ readonly materialRefs: readonly string[];
}
/** 边界错误；不得携带凭据或内部堆栈。 */
export interface KernelBoundaryError {
	/** 公开稳定错误分类。 */ readonly code: string;
	/** 可安全展示的说明。 */ readonly message: string;
	/** 只说明查询能否重试，不授权重发写。 */ readonly retryable: boolean;
}
/** 服务准备已持久化，尚未确认 Run 受理。 */
export interface KernelPreparingReceipt {
	/** 原命令标识。 */ readonly commandId: string;
	/** 准备阶段。 */ readonly state: "preparing";
	/** 此时没有已确认会话。 */ readonly sessionId: null;
	/** 此时没有已确认 Run。 */ readonly runId: null;
}
/** Run 已受理且身份可查询的原始回执。 */
export interface KernelAcceptedReceipt {
	/** 原命令标识。 */ readonly commandId: string;
	/** 已受理。 */ readonly state: "accepted";
	/** 已确认会话。 */ readonly sessionId: string;
	/** 已确认 Run。 */ readonly runId: string;
	/** 受理时的会话版本，不随查询变化。 */ readonly anchor: KernelSessionAnchor;
	/** 已冻结配置。 */ readonly frozenSelection: KernelSelection;
}
/** 会话写命令回执；accepted 不是执行成功。 */
export type KernelConversationReceipt = KernelPreparingReceipt | KernelAcceptedReceipt;

/** 有界消息预览，完整正文通过内容接口读取。 */
export interface KernelPublicMessage {
	/** 稳定消息标识。 */ readonly messageId: string;
	/** 所属 Run。 */ readonly runId: string;
	/** 公开角色。 */ readonly role: "user" | "assistant";
	/** 最多 8 KiB 预览。 */ readonly text: string;
	/** 固定正文版本。 */ readonly revision: number;
	/** 非 null 表示预览不完整。 */ readonly contentRef: string | null;
}
/** 页游标固定到同一快照。 */
export interface KernelPage<T> {
	/** 本页有界集合。 */ readonly items: readonly T[];
	/** 后续页游标或末页。 */ readonly nextCursor: string | null;
	/** 不可变快照标识。 */ readonly snapshotRef: string;
}
/** 第一阶段的 Run 权威投影。 */
export interface KernelRunView extends TuiRunSnapshot {
	/** 所属会话。 */ readonly sessionId: string;
	/** 取消请求已经记录，不表示外部动作停止。 */ readonly cancellationRequested: boolean;
	/** 已保存消息预览。 */ readonly messages: KernelPage<KernelPublicMessage>;
	/** Run 冻结配置。 */ readonly frozenSelection: KernelSelection;
	/** 第一阶段不展示执行详情，服务能力关闭时必须为空。 */ readonly details: KernelPage<never>;
	/** 明确的执行或投影错误。 */ readonly error: KernelBoundaryError | null;
}
/** 会话查询结果；historyReady 是下一轮的必要前提。 */
export interface KernelSessionView {
	/** 当前已确认历史。 */ readonly anchor: KernelSessionAnchor;
	/** 会话绑定的 Agent。 */ readonly agentId: string;
	/** 后续任务的默认选择。 */ readonly defaultSelection: KernelSelection;
	/** 当前活动 Run，没有则为 null。 */ readonly activeRunId: string | null;
	/** 已采纳消息。 */ readonly history: KernelPage<KernelPublicMessage>;
	/** 已确认历史采纳且可以开始后续输入。 */ readonly historyReady: boolean;
}
/** 取消命令确认，不直接推进客户端终态。 */
export interface KernelCancelReceipt {
	/** 原取消命令。 */ readonly commandId: string;
	/** 取消目标。 */ readonly runId: string;
	/** 是否已记录取消意图。 */ readonly cancellationRequested: boolean;
	/** 取消时已经终结则提供权威终态。 */ readonly terminal: KernelRunView | null;
}
/** 原命令查询；拒绝与未知查询失败必须分开。 */
export type KernelCommandRecord =
	| {
			/** 提交命令。 */ readonly operation: "submit";
			/** 原命令。 */ readonly commandId: string;
			/** 准备阶段。 */ readonly state: "preparing";
			/** 原回执。 */
			readonly receipt: KernelPreparingReceipt;
	  }
	| {
			/** 提交命令。 */ readonly operation: "submit";
			/** 原命令。 */ readonly commandId: string;
			/** 已受理。 */ readonly state: "accepted";
			/** 原回执。 */
			readonly receipt: KernelAcceptedReceipt;
	  }
	| {
			/** 取消命令。 */ readonly operation: "cancel";
			/** 原命令。 */ readonly commandId: string;
			/** 已受理。 */ readonly state: "accepted";
			/** 原回执。 */
			readonly receipt: KernelCancelReceipt;
	  }
	| {
			/** 命令类别。 */ readonly operation: "submit" | "cancel";
			/** 原命令。 */ readonly commandId: string;
			/** 明确拒绝。 */ readonly state: "rejected";
			/** 原拒绝结果。 */
			readonly error: KernelBoundaryError;
	  };

/** 初始化能力与服务身份；首期只消费三项必要能力。 */
export interface KernelInitialization {
	/** 本次宿主进程身份。 */ readonly hostInstanceId: string;
	/** 受信作用域。 */ readonly scopeId: string;
	/** 连接引用，不替代认证。 */ readonly connectionId: string;
	/** 当前公共协议。 */ readonly protocolVersion: "1.0";
	/** 当前可用能力。 */ readonly capabilities: readonly string[];
	/** 服务边界上限。 */ readonly limits: {
		/** 最大帧字节数。 */ readonly maxFrameBytes: number;
		/** 最大并行请求数。 */ readonly maxInflight: number;
		/** 最大未确认事件数。 */ readonly maxEventWindow: number;
	};
	/** 已配置默认选择，不可用时为 null。 */ readonly defaultSelection: KernelSelection | null;
}

/** 第一阶段协议所需查询和写入能力；不涉及宿主内部存储。 */
export interface KernelConversationClient {
	/** 验证服务身份并协商能力。 */ initialize(signal: AbortSignal): Promise<KernelInitialization>;
	/** 一次发送，不自动重试写请求。 */ submit(
		commandId: string,
		input: KernelConversationInput,
		signal: AbortSignal,
	): Promise<KernelConversationReceipt>;
	/** 查询原命令；NOT_FOUND 不授权换身份重新发送。 */ getCommand(
		commandId: string,
		signal: AbortSignal,
	): Promise<KernelCommandRecord>;
	/** 查询当前已确认会话。 */ getSession(sessionId: string, signal: AbortSignal): Promise<KernelSessionView>;
	/** 请求取消已确认 Run。 */ cancel(
		commandId: string,
		runId: string,
		signal: AbortSignal,
	): Promise<KernelCancelReceipt>;
	/** 固定版本正文读取。 */ getContent(
		contentRef: string,
		cursor: string | null,
		signal: AbortSignal,
	): Promise<TuiContentPage>;
}
