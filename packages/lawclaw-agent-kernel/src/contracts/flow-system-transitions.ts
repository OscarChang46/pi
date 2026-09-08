import type { FlowSystemAction, FlowSystemState } from "./flow-system.ts";
import { FLOW_SYSTEM_ACTION, FLOW_SYSTEM_STATE } from "./flow-system-values.ts";

const TRANSITIONS: Readonly<Record<FlowSystemState, Readonly<Partial<Record<FlowSystemAction, FlowSystemState>>>>> =
	Object.freeze({
		[FLOW_SYSTEM_STATE.READY]: Object.freeze({
			[FLOW_SYSTEM_ACTION.START]: FLOW_SYSTEM_STATE.RUNNING,
			[FLOW_SYSTEM_ACTION.TERMINATE]: FLOW_SYSTEM_STATE.TERMINATE,
		}),
		[FLOW_SYSTEM_STATE.RUNNING]: Object.freeze({
			[FLOW_SYSTEM_ACTION.YIELD]: FLOW_SYSTEM_STATE.YIELD,
			[FLOW_SYSTEM_ACTION.RECOVER]: FLOW_SYSTEM_STATE.YIELD,
			[FLOW_SYSTEM_ACTION.TERMINATE]: FLOW_SYSTEM_STATE.TERMINATE,
		}),
		[FLOW_SYSTEM_STATE.YIELD]: Object.freeze({
			[FLOW_SYSTEM_ACTION.RESUME]: FLOW_SYSTEM_STATE.READY,
			[FLOW_SYSTEM_ACTION.TERMINATE]: FLOW_SYSTEM_STATE.TERMINATE,
		}),
		[FLOW_SYSTEM_STATE.TERMINATE]: Object.freeze({}),
	});

/** 只解释系统四态的显式迁移表；非法边默认关闭。 */
export function resolveSystemTransition(state: FlowSystemState, action: FlowSystemAction): FlowSystemState {
	if (!Object.hasOwn(TRANSITIONS, state) || !Object.hasOwn(TRANSITIONS[state], action))
		throw new Error("FLOW_SYSTEM_INVALID_TRANSITION");
	const target = TRANSITIONS[state][action];
	if (!target) throw new Error("FLOW_SYSTEM_INVALID_TRANSITION");
	return target;
}
