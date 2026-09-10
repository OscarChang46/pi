import type { ArtifactRef, Ref } from "../../flow-engine.ts";
import type { SessionAnchor, SessionCreationIntent } from "../session-manager/session-manager-contract.ts";

export type { SessionAnchor, SessionCreationIntent } from "../session-manager/session-manager-contract.ts";

/** 来源声明的必选记录集合。 */
export interface Requirement {
	/** 协议字段reason，取值与空值语义遵循CTX-CON-1。 */
	readonly reason: "system_constraint" | "current_task" | "task_input" | "causal_dependency";
	/** 协议字段declaredByRef，取值与空值语义遵循CTX-CON-1。 */
	readonly declaredByRef: Ref;
	/** 单元成员记录引用，非空且唯一 */
	readonly memberRefs: readonly Ref[];
}

/** 首次、现有或一次性只读Session输入。 */
export type SessionInput =
	| {
			/** 当前数据的封闭变体 */ readonly kind: "existing";
			/** 协议字段anchor，取值与空值语义遵循CTX-CON-1。 */
			readonly anchor: SessionAnchor;
	  }
	| {
			/** 当前数据的封闭变体 */ readonly kind: "create";
			/** 协议字段intent，取值与空值语义遵循CTX-CON-1。 */
			readonly intent: SessionCreationIntent;
	  }
	| {
			/** 当前数据的封闭变体 */ readonly kind: "read_only";
			/** 协议字段source，取值与空值语义遵循CTX-CON-1。 */
			readonly source: SessionAnchor;
	  };

/** 准备身份不允许用于查询不存在的Run。 */
export type RunAssemblyInput =
	| {
			/** 当前数据的封闭变体 */ readonly kind: "initial";
			/** 协议字段preparationId，取值与空值语义遵循CTX-CON-1。 */
			readonly preparationId: Ref;
			/** 协议字段plannedRunId，取值与空值语义遵循CTX-CON-1。 */
			readonly plannedRunId: Ref;
	  }
	| {
			/** 当前数据的封闭变体 */
			readonly kind: "existing";
			/** 协议字段runId，取值与空值语义遵循CTX-CON-1。 */
			readonly runId: Ref;
			/** 协议字段sourceRunVersion，取值与空值语义遵循CTX-CON-1。 */
			readonly sourceRunVersion: number;
			/** 协议字段transcriptHeadRef，取值与空值语义遵循CTX-CON-1。 */
			readonly transcriptHeadRef: Ref;
	  };

/** 冻结资料来源，优先级越大越优先。 */
export interface MaterialSource {
	/** 协议字段sourceRef，取值与空值语义遵循CTX-CON-1。 */
	readonly sourceRef: Ref;
	/** 实现或来源的冻结版本 */
	readonly version: number;
	/** 正文Artifact引用，引用本身不授予读取资格 */
	readonly contentRef: ArtifactRef;
	/** 协议字段priority，取值与空值语义遵循CTX-CON-1。 */
	readonly priority: number;
	/** 协议字段requirement，取值与空值语义遵循CTX-CON-1。 */
	readonly requirement: Requirement | null;
}

/** 冻结Memory视图绑定。 */
export interface MemoryAssemblySource {
	/** 协议字段source，取值与空值语义遵循CTX-CON-1。 */
	readonly source: {
		/** 协议字段spaceId，取值与空值语义遵循CTX-CON-1。 */
		readonly spaceId: Ref;
		/** 协议字段spaceVersion，取值与空值语义遵循CTX-CON-1。 */
		readonly spaceVersion: number;
		/** 协议字段queryRef，取值与空值语义遵循CTX-CON-1。 */
		readonly queryRef: ArtifactRef;
		/** 协议字段indexVersion，取值与空值语义遵循CTX-CON-1。 */
		readonly indexVersion: Ref;
		/** 协议字段algorithmVersion，取值与空值语义遵循CTX-CON-1。 */
		readonly algorithmVersion: Ref;
		/** 协议字段epoch，取值与空值语义遵循CTX-CON-1。 */
		readonly epoch: number;
		/** 来源读取必须成功，不表示全部内容必选 */
		readonly required: boolean;
	};
	/** 协议字段viewRef，取值与空值语义遵循CTX-CON-1。 */
	readonly viewRef: ArtifactRef;
}

/** 父上下文读取范围不能被算法扩大。 */
export interface ParentContextSliceSpec {
	/** 协议字段parent，取值与空值语义遵循CTX-CON-1。 */
	readonly parent: SessionAnchor;
	/** 协议字段selectorRef，取值与空值语义遵循CTX-CON-1。 */
	readonly selectorRef: Ref;
	/** 协议字段selectorVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly selectorVersion: Ref;
	/** 协议字段candidateRefs，取值与空值语义遵循CTX-CON-1。 */
	readonly candidateRefs: readonly Ref[];
	/** 协议字段requiredRefs，取值与空值语义遵循CTX-CON-1。 */
	readonly requiredRefs: readonly Ref[];
	/** 协议字段maxInheritedTokens，取值与空值语义遵循CTX-CON-1。 */
	readonly maxInheritedTokens: number;
}

/** 独立字节容量与Token软目标。 */
export interface AssemblyLimits {
	/** 协议字段inputTokenLimit，取值与空值语义遵循CTX-CON-1。 */
	readonly inputTokenLimit: number;
	/** 协议字段modelWindowTokens，取值与空值语义遵循CTX-CON-1。 */
	readonly modelWindowTokens: number;
	/** 协议字段outputReserveTokens，取值与空值语义遵循CTX-CON-1。 */
	readonly outputReserveTokens: number;
	/** 协议字段estimatorMarginTokens，取值与空值语义遵循CTX-CON-1。 */
	readonly estimatorMarginTokens: number;
	/** 模型映射的字节硬上限 */
	readonly maxBytes: number;
	/** 读取规范值的累计字节硬上限 */
	readonly maxWorkingBytes: number;
	/** 完整候选规范字节硬上限 */
	readonly maxCandidateBytes: number;
	/** 协议字段maxSources，取值与空值语义遵循CTX-CON-1。 */
	readonly maxSources: number;
	/** 协议字段maxRecords，取值与空值语义遵循CTX-CON-1。 */
	readonly maxRecords: number;
	/** 协议字段maxEdges，取值与空值语义遵循CTX-CON-1。 */
	readonly maxEdges: number;
}

/** 调用方由权威事实生成的应到Child清单。 */
export interface ExpectedChildObservation {
	/** 原始规范记录的稳定引用 */
	readonly recordRef: Ref;
	/** 协议字段childId，取值与空值语义遵循CTX-CON-1。 */
	readonly childId: Ref;
	/** 协议字段childRunId，取值与空值语义遵循CTX-CON-1。 */
	readonly childRunId: Ref;
	/** 已确认终态，只允许成功或失败 */
	readonly outcome: "SUCCEEDED" | "FAILED";
}

/** 完整输入参与语义摘要，实例只接受独占调用。 */
export interface AssemblyBasis {
	/** 协议字段runInput，取值与空值语义遵循CTX-CON-1。 */
	readonly runInput: RunAssemblyInput;
	/** 协议字段sessionInput，取值与空值语义遵循CTX-CON-1。 */
	readonly sessionInput: SessionInput;
	/** 协议字段systemRef，取值与空值语义遵循CTX-CON-1。 */
	readonly systemRef: ArtifactRef;
	/** 协议字段taskRef，取值与空值语义遵循CTX-CON-1。 */
	readonly taskRef: ArtifactRef;
	/** 协议字段toolsRef，取值与空值语义遵循CTX-CON-1。 */
	readonly toolsRef: ArtifactRef;
	/** 协议字段materials，取值与空值语义遵循CTX-CON-1。 */
	readonly materials: readonly MaterialSource[];
	/** 协议字段memory，取值与空值语义遵循CTX-CON-1。 */
	readonly memory: readonly MemoryAssemblySource[];
	/** 协议字段requirements，取值与空值语义遵循CTX-CON-1。 */
	readonly requirements: readonly Requirement[];
	/** 协议字段parentContext，取值与空值语义遵循CTX-CON-1。 */
	readonly parentContext: ParentContextSliceSpec | null;
	/** 由外部权威事实生成的应到Child观察清单 */
	readonly expectedChildObservations: readonly ExpectedChildObservation[];
	/** 协议字段limits，取值与空值语义遵循CTX-CON-1。 */
	readonly limits: AssemblyLimits;
	/** 协议字段configVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly configVersion: Ref;
	/** 协议字段selectionVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly selectionVersion: Ref;
	/** 协议字段estimatorVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly estimatorVersion: Ref;
	/** 协议字段modelWindowVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly modelWindowVersion: Ref;
	/** 规范载荷格式版本 */
	readonly formatVersion: Ref;
	/** 实际模型映射版本 */
	readonly modelAdapterVersion: Ref;
	/** 协议字段envelopeRef，取值与空值语义遵循CTX-CON-1。 */
	readonly envelopeRef: Ref;
	/** 协议字段authorizationEpoch，取值与空值语义遵循CTX-CON-1。 */
	readonly authorizationEpoch: number;
}
