import type { ArtifactRef, Ref } from "../../flow-engine.ts";
import type { ToolDescriptor } from "../../types.ts";
import type { SelectionDecision } from "./assembly-algorithm.ts";
import type {
	CausalUnit,
	ContextMessage,
	DependencyEdge,
	MaterialProjection,
	MemoryProjection,
	SourceIdentity,
	SourceOrderKey,
	ToolCallIdentity,
} from "./assembly-messages.ts";

/** 真正传入模型映射的六字段值。 */
export interface ContextPayload {
	/** 协议字段system，取值与空值语义遵循CTX-CON-1。 */
	readonly system: string;
	/** 协议字段task，取值与空值语义遵循CTX-CON-1。 */
	readonly task: string;
	/** 协议字段messages，取值与空值语义遵循CTX-CON-1。 */
	readonly messages: readonly ContextMessage[];
	/** 协议字段materials，取值与空值语义遵循CTX-CON-1。 */
	readonly materials: readonly MaterialProjection[];
	/** 协议字段memory，取值与空值语义遵循CTX-CON-1。 */
	readonly memory: readonly MemoryProjection[];
	/** 协议字段tools，取值与空值语义遵循CTX-CON-1。 */
	readonly tools: readonly ToolDescriptor[];
}

/** 可追溯的载荷位置。 */
export interface PayloadLocation {
	/** 协议字段field，取值与空值语义遵循CTX-CON-1。 */
	readonly field: "messages" | "materials" | "memory";
	/** 协议字段index，取值与空值语义遵循CTX-CON-1。 */
	readonly index: number;
}

/** 原始调用与最终局部工具ID的映射。 */
export interface ToolCallProjection {
	/** 原始事实身份，不能改成当前Run身份 */
	readonly identity: ToolCallIdentity;
	/** 最终载荷内唯一工具调用标识 */
	readonly frameCallId: Ref;
	/** 协议字段requestRecordRef，取值与空值语义遵循CTX-CON-1。 */
	readonly requestRecordRef: Ref;
	/** 协议字段resultRecordRef，取值与空值语义遵循CTX-CON-1。 */
	readonly resultRecordRef: Ref;
}

/** 完整原始记录追踪；未选位置显式null。 */
export interface TraceRecord {
	/** 原始规范记录的稳定引用 */
	readonly recordRef: Ref;
	/** 原始事实身份，不能改成当前Run身份 */
	readonly identity: SourceIdentity;
	/** 正文Artifact引用，引用本身不授予读取资格 */
	readonly contentRef: ArtifactRef;
	/** 协议字段orderKey，取值与空值语义遵循CTX-CON-1。 */
	readonly orderKey: SourceOrderKey;
	/** 协议字段output，取值与空值语义遵循CTX-CON-1。 */
	readonly output: PayloadLocation | null;
}

/** 可序列化追踪，不发送模型。 */
export interface AssemblyTrace {
	/** 规范来源记录集合 */
	readonly records: readonly TraceRecord[];
	/** 完整不可拆因果单元 */
	readonly units: readonly CausalUnit[];
	/** 依赖方到前驱的完整关系 */
	readonly dependencies: readonly DependencyEdge[];
	/** 覆盖全部单元的最终决定 */
	readonly decisions: readonly SelectionDecision[];
	/** 原调用与最终消息的映射 */
	readonly toolCalls: readonly ToolCallProjection[];
	/** 协议字段degradedSources，取值与空值语义遵循CTX-CON-1。 */
	readonly degradedSources: readonly Ref[];
}

/** 软预算记录，不承诺Provider实际Token上界。 */
export interface TokenAccounting {
	/** 与派发共用 Pi 映射的规范 UTF-8 字节数，供宿主硬限制复核。 */
	readonly inputBytes: number;
	/** 协议字段inputTargetTokens，取值与空值语义遵循CTX-CON-1。 */
	readonly inputTargetTokens: number;
	/** 协议字段baseInputTokens，取值与空值语义遵循CTX-CON-1。 */
	readonly baseInputTokens: number;
	/** 本次选择的父继承软目标 */
	readonly inheritedTargetTokens: number;
	/** 完整模型投影的Pi粗估Token数 */
	readonly inputTokens: number;
	/** 协议字段estimatedInheritedTokens，取值与空值语义遵循CTX-CON-1。 */
	readonly estimatedInheritedTokens: number;
	/** 协议字段nextEligibleInheritedUnitTokens，取值与空值语义遵循CTX-CON-1。 */
	readonly nextEligibleInheritedUnitTokens: number | null;
	/** 协议字段droppedInheritedTokens，取值与空值语义遵循CTX-CON-1。 */
	readonly droppedInheritedTokens: number;
	/** 协议字段estimatorVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly estimatorVersion: Ref;
	/** 协议字段modelWindowVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly modelWindowVersion: Ref;
	/** 规范载荷格式版本 */
	readonly formatVersion: Ref;
	/** 协议字段budgetStatus，取值与空值语义遵循CTX-CON-1。 */
	readonly budgetStatus: "within_target" | "required_over_target";
}

/** 内存候选不代表保存或采纳成功。 */
export interface AssemblyCandidate {
	/** 协议字段payload，取值与空值语义遵循CTX-CON-1。 */
	readonly payload: ContextPayload;
	/** 协议字段trace，取值与空值语义遵循CTX-CON-1。 */
	readonly trace: AssemblyTrace;
	/** 协议字段tokenAccounting，取值与空值语义遵循CTX-CON-1。 */
	readonly tokenAccounting: TokenAccounting;
	/** 协议字段inputDigest，取值与空值语义遵循CTX-CON-1。 */
	readonly inputDigest: Ref;
	/** 协议字段payloadDigest，取值与空值语义遵循CTX-CON-1。 */
	readonly payloadDigest: Ref;
	/** 协议字段selectionVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly selectionVersion: Ref;
	/** 规范载荷格式版本 */
	readonly formatVersion: Ref;
	/** 实际模型映射版本 */
	readonly modelAdapterVersion: Ref;
}
