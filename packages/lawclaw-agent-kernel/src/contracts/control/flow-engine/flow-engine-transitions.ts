import type { FlowRunAction, FlowRunState } from "./flow-engine-contract.ts";
import { FLOW_RUN_ACTION, FLOW_RUN_STATE } from "./flow-engine-values.ts";

const TRANSITIONS: Readonly<Record<FlowRunState, Readonly<Partial<Record<FlowRunAction, FlowRunState>>>>> =
	Object.freeze({
		[FLOW_RUN_STATE.READY]: Object.freeze({
			[FLOW_RUN_ACTION.START]: FLOW_RUN_STATE.RUNNING,
			[FLOW_RUN_ACTION.TERMINATE]: FLOW_RUN_STATE.TERMINATE,
		}),
		[FLOW_RUN_STATE.RUNNING]: Object.freeze({
			[FLOW_RUN_ACTION.YIELD]: FLOW_RUN_STATE.YIELD,
			[FLOW_RUN_ACTION.RECOVER]: FLOW_RUN_STATE.YIELD,
			[FLOW_RUN_ACTION.TERMINATE]: FLOW_RUN_STATE.TERMINATE,
		}),
		[FLOW_RUN_STATE.YIELD]: Object.freeze({
			[FLOW_RUN_ACTION.RESUME]: FLOW_RUN_STATE.READY,
			[FLOW_RUN_ACTION.TERMINATE]: FLOW_RUN_STATE.TERMINATE,
		}),
		[FLOW_RUN_STATE.TERMINATE]: Object.freeze({}),
	});

/** 只解释系统四态的显式迁移表；非法边默认关闭。 */
export function resolveFlowRunTransition(state: FlowRunState, action: FlowRunAction): FlowRunState {
	if (!Object.hasOwn(TRANSITIONS, state) || !Object.hasOwn(TRANSITIONS[state], action))
		throw new Error("FLOW_RUN_INVALID_TRANSITION");
	const target = TRANSITIONS[state][action];
	if (!target) throw new Error("FLOW_RUN_INVALID_TRANSITION");
	return target;
}
