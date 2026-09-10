import type { RequestContext } from "../../types.ts";

/** 已确认 Session 版本的冻结锚点；创建意图不得伪造该值。 */
export interface SessionAnchor {
	/** SessionManager 生成并确认的技术 Session 标识。 */
	readonly sessionId: string;
	/** 已确认的非负 Session 版本。 */
	readonly version: number;
	/** 与 version 对应的历史头引用。 */
	readonly headRef: string;
}

/** Root 或 Child 的创建意图；不是已创建 Session，也不包含 Session ID。 */
export interface SessionCreationIntent {
	/** 可信作用域内的 Root 逻辑键；Child 不进入 Root logicalKey 索引。 */
	readonly logicalKey: string;
	/** 创建后不可悄然替换的 Agent 定义引用。 */
	readonly agentDefinitionRef: string;
	/** 创建后不可悄然替换的 Context 策略引用。 */
	readonly contextPolicyRef: string;
	/** Root 固定为 null；Child 必须绑定确切父锚点。 */
	readonly parent: SessionAnchor | null;
}

/** logicalKey 已绑定 Root 时的只读查询结果。 */
export interface FoundSessionLookupResult {
	/** 表示查询命中已确认 Root。 */
	readonly state: "found";
	/** 当前已确认的 Session 锚点。 */
	readonly anchor: SessionAnchor;
}

/** logicalKey 未绑定 Root 时的只读查询结果。 */
export interface AbsentSessionLookupResult {
	/** 表示查询未命中，且没有产生任何写入。 */
	readonly state: "absent";
}

/** Root Session 的只读 logicalKey 查询结果；absent 不产生任何写入。 */
export type SessionLookupResult = FoundSessionLookupResult | AbsentSessionLookupResult;

/** 显式确保 Root Session 的稳定命令；载荷摘要由 SessionManager 从 intent 计算。 */
export interface EnsureSessionCommand {
	/** 同一可信作用域内稳定且唯一的幂等命令标识。 */
	readonly commandId: string;
	/** Root 创建意图；parent 必须为 null。 */
	readonly intent: SessionCreationIntent;
}

/** ensure 的确认结果；created 表示本命令是否创建了 Root。 */
export interface EnsureSessionResult {
	/** 本命令确认的不可变 Session 锚点。 */
	readonly anchor: SessionAnchor;
	/** true 表示本命令创建；false 表示 logicalKey 已由其他命令绑定。 */
	readonly created: boolean;
}

/** Root Session 查询端口；查询不得调用 ensure 或生成 Session 标识。 */
export interface SessionQueryPort {
	/** 按可信作用域内 logicalKey 查询当前已确认锚点。 */
	lookup(context: RequestContext, logicalKey: string): SessionLookupResult;
}

/** Root Session 命令端口；同命令重投必须返回原始确认结果。 */
export interface SessionCommandPort {
	/** 显式确保 Root Session 存在，并保存 commandId 对应的幂等结果。 */
	ensure(context: RequestContext, command: EnsureSessionCommand): EnsureSessionResult;
}

/** Session 当前 Run 绑定的封闭状态集合。 */
export const ACTIVE_RUN_BINDING_STATE = Object.freeze({
	RESERVED: "RESERVED",
	SUBMIT_UNKNOWN: "SUBMIT_UNKNOWN",
	ACTIVE: "ACTIVE",
	RELEASING: "RELEASING",
} as const);

/** Session 当前 Run 绑定状态；IDLE 由绑定缺失表达。 */
export type ActiveRunBindingState = (typeof ACTIVE_RUN_BINDING_STATE)[keyof typeof ACTIVE_RUN_BINDING_STATE];

/** SessionManager 拥有的当前 Run 占用事实；不复制 Run 执行状态或历史。 */
export interface ActiveRunBinding {
	/** 当前占用 Session 的 AgentRun 标识。 */
	readonly runId: string;
	/** 每次成功占用递增的绑定代次，用于拒绝迟到事件。 */
	readonly bindingVersion: number;
	/** 当前受理或释放阶段。 */
	readonly state: ActiveRunBindingState;
	/** 首次占用命令的稳定标识。 */
	readonly reserveCommandId: string;
	/** 交给 RunRegistry 的稳定受理命令标识。 */
	readonly admissionCommandId: string;
	/** 受理载荷摘要；只证明同一性，不构成授权。 */
	readonly payloadDigest: string;
	/** RunRegistry 明确受理后的外部回执引用。 */
	readonly admissionReceiptRef: string | null;
	/** RunRegistry 明确终态后的外部回执引用。 */
	readonly terminalReceiptRef: string | null;
	/** 同一绑定内部状态迁移的乐观锁版本。 */
	readonly stateVersion: number;
}
