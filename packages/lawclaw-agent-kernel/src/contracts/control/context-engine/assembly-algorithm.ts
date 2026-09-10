import type { Ref } from "../../flow-engine.ts";
import type { AssemblyLimits } from "./assembly-basis.ts";
import type { ContextPayload } from "./assembly-candidate.ts";
import type { CausalUnit, ContextMessage, DependencyEdge } from "./assembly-messages.ts";

/** 单元最终决定，不能漏项。 */
export interface SelectionDecision {
	/** 完整因果单元的稳定引用 */
	readonly unitRef: Ref;
	/** 协议字段decision，取值与空值语义遵循CTX-CON-1。 */
	readonly decision: "keep" | "drop";
	/** 协议字段reason，取值与空值语义遵循CTX-CON-1。 */
	readonly reason: "required" | "dependency" | "ranked" | "budget";
}

/** 算法只返回选择引用，不返回新正文。 */
export interface Selection {
	/** 最终保留的单元引用 */
	readonly selectedUnitRefs: readonly Ref[];
	/** 覆盖全部单元的最终决定 */
	readonly decisions: readonly SelectionDecision[];
}

/** 同版完整模型投影估算。 */
export interface SelectionEstimate {
	/** 完整模型投影的Pi粗估Token数 */
	readonly inputTokens: number;
	/** 完整模型投影的UTF-8字节数 */
	readonly inputBytes: number;
	/** 完整与无父内容投影的非负估算差 */
	readonly inheritedTokens: number;
	/** 本次选择的父继承软目标 */
	readonly inheritedTargetTokens: number;
}

/** Pi近期后缀建议使用的规范历史。 */
export interface HistorySelectionRecord {
	/** 原始规范记录的稳定引用 */
	readonly recordRef: Ref;
	/** 规范消息；资料和Memory显式为null */
	readonly message: ContextMessage;
}

/** 同步纯选择器输入。 */
export interface AssemblyAlgorithmInput {
	/** 完整不可拆因果单元 */
	readonly units: readonly CausalUnit[];
	/** 依赖方到前驱的完整关系 */
	readonly dependencies: readonly DependencyEdge[];
	/** 协议字段requiredRecordRefs，取值与空值语义遵循CTX-CON-1。 */
	readonly requiredRecordRefs: readonly Ref[];
	/** 协议字段optionalUnitOrder，取值与空值语义遵循CTX-CON-1。 */
	readonly optionalUnitOrder: readonly Ref[];
	/** 仅Session和Run规范历史 */
	readonly historyRecords: readonly HistorySelectionRecord[];
	/** 协议字段limits，取值与空值语义遵循CTX-CON-1。 */
	readonly limits: AssemblyLimits;
	/** 协议字段estimateSelection，取值与空值语义遵循CTX-CON-1。 */
	readonly estimateSelection: (refs: readonly Ref[]) => SelectionEstimate;
}

/** 可切换选择策略，不能执行来源I/O。 */
export interface AssemblyAlgorithm {
	/** 受信注册的策略标识 */
	readonly algorithmId: Ref;
	/** 实现或来源的冻结版本 */
	readonly version: Ref;
	/** 协议字段select，取值与空值语义遵循CTX-CON-1。 */
	select(input: AssemblyAlgorithmInput): Selection;
}

/** 同步纯模型计量，真实Pi实现位于适配层。 */
export interface ContextEstimatorPort {
	/** 实现或来源的冻结版本 */
	readonly version: Ref;
	/** 规范载荷格式版本 */
	readonly formatVersion: Ref;
	/** 实际模型映射版本 */
	readonly modelAdapterVersion: Ref;
	/** 协议字段estimate，取值与空值语义遵循CTX-CON-1。 */
	estimate(payload: ContextPayload): {
		/** 完整模型投影的Pi粗估Token数 */ readonly inputTokens: number;
		/** 完整模型投影的UTF-8字节数 */
		readonly inputBytes: number;
	};
}

/** Pi仅建议后缀，Kernel仍校验因果闭包。 */
export interface RecentHistorySelectorPort {
	/** 协议字段selectCut，取值与空值语义遵循CTX-CON-1。 */
	selectCut(input: { readonly historyRecords: readonly HistorySelectionRecord[]; readonly targetTokens: number }): {
		/** 协议字段firstKeptRecordRef，取值与空值语义遵循CTX-CON-1。 */
		readonly firstKeptRecordRef: Ref | null;
	};
}
