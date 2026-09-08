import type { AdvanceInput } from "../../contracts/flow-engine.ts";
import { REACT_FLOW_STATE } from "../../contracts/react-flow-values.ts";
import { reject } from "./input-guard.ts";
import { transitionContext } from "./transition-context.ts";
import type { Resolution } from "./transition-definition.ts";

type Precondition = {
	readonly matches: (input: AdvanceInput) => boolean;
	readonly resolve: (input: AdvanceInput) => Resolution;
};

// 顺序属于FE-CON-1：取消先于到期，再检查公共输入不变量。
const PRECONDITIONS: readonly Precondition[] = [
	{
		matches: ({ run }) => run.cancellationRequested,
		resolve: (input) =>
			transitionContext(input).plan(
				{ kind: REACT_FLOW_STATE.CANCELLED, reason: "requested" },
				[{ kind: "CancelOutstanding", cancelEpoch: input.run.cancelEpoch }],
				[],
				[],
			),
	},
	{
		matches: ({ operation }) => operation.nowMs >= operation.deadlineAtMs,
		resolve: (input) =>
			transitionContext(input).plan(
				{ kind: REACT_FLOW_STATE.CANCELLED, reason: "deadline" },
				[{ kind: "CancelOutstanding", cancelEpoch: input.run.cancelEpoch }],
				[],
				[],
			),
	},
	{
		matches: ({ contextFailure, run, event }) =>
			contextFailure !== null &&
			(run.position.kind !== REACT_FLOW_STATE.READY ||
				run.pendingActions.length !== 0 ||
				event.payload.kind !== "AdvanceRequested"),
		resolve: () => reject("FLOW_INPUT_INVALID", "contextFailure"),
	},
	{
		matches: ({ run }) =>
			(run.position.kind === REACT_FLOW_STATE.AWAITING_PERMISSION ||
				run.position.kind === REACT_FLOW_STATE.AWAITING_TOOL) &&
			run.pendingActions[0]?.proposalId !== run.position.proposalId,
		resolve: () => reject("FLOW_INPUT_INVALID", "run.pendingActions"),
	},
];

/** 按协议固定优先级计算公共中断或拒绝；不选择业务迁移边。 */
export function resolvePrecondition(input: AdvanceInput): Resolution | null {
	const rule = PRECONDITIONS.find((candidate) => candidate.matches(input));
	return rule ? rule.resolve(input) : null;
}
