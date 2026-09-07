import type {
	AdvanceInput,
	FlowPosition,
	RuntimePayload,
	TransitionPlan,
	WaitReason,
} from "../../contracts/flow-engine.ts";
import { reject } from "./input-guard.ts";

/** 显式展开挂起子状态，避免审批和未知结果共享隐含迁移。 */
export type StateKey = Exclude<FlowPosition["kind"], "Suspended"> | `Suspended.${WaitReason["kind"]}`;
type PositionFor<S extends StateKey> = S extends `Suspended.${infer R}`
	? Extract<FlowPosition, { kind: "Suspended" }> & { readonly reason: Extract<WaitReason, { kind: R }> }
	: Extract<FlowPosition, { kind: S }>;
type PayloadFor<E extends RuntimePayload["kind"]> = Extract<RuntimePayload, { kind: E }>;
/** 迁移动作接收已收窄的状态与事件类型。 */
export type TransitionInput<S extends StateKey, E extends RuntimePayload["kind"]> = AdvanceInput & {
	/** 当前状态由注册键确定。 */
	readonly run: AdvanceInput["run"] & {
		/** 已验证的源状态。 */
		readonly position: PositionFor<S>;
	};
	/** 当前事件由注册键确定。 */
	readonly event: AdvanceInput["event"] & {
		/** 已验证的事件载荷。 */
		readonly payload: PayloadFor<E>;
	};
};
/** 纯迁移的成功计划或稳定拒绝。 */
export type Resolution = TransitionPlan | ReturnType<typeof reject>;
/** 一条可检查、可枚举的迁移定义。 */
export interface TransitionDefinition {
	/** 唯一源状态。 */
	readonly from: StateKey;
	/** 唯一触发事件。 */
	readonly on: RuntimePayload["kind"];
	/** 动作允许返回的目标状态，包含条件失败目标。 */
	readonly targets: readonly StateKey[];
	/** 无I/O迁移动作；只生成计划。 */
	readonly execute: (input: AdvanceInput) => Resolution;
}

/** 将持久状态映射到状态机节点，展开Suspended的三个子状态。 */
export function stateKey(position: FlowPosition | TransitionPlan["next"]["position"]): StateKey {
	return position.kind === "Suspended" ? `Suspended.${position.reason.kind}` : position.kind;
}

/** 绑定源状态、事件、目标集合及类型安全动作；注册后不可修改。 */
export function defineTransition<S extends StateKey, E extends RuntimePayload["kind"]>(
	from: S,
	on: E,
	targets: readonly StateKey[],
	action: (input: TransitionInput<S, E>) => Resolution,
): TransitionDefinition {
	return Object.freeze({
		from,
		on,
		targets: Object.freeze([...targets]),
		execute(input: AdvanceInput): Resolution {
			if (stateKey(input.run.position) !== from || input.event.payload.kind !== on)
				return reject("FLOW_INVALID_TRANSITION", "event.payload.kind");
			// 唯一收窄位置；上方同时验证判别字段，业务动作无需重复分派判断。
			return action(input as TransitionInput<S, E>);
		},
	});
}
