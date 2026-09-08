/** ReAct业务位置；系统FlowEngine不得依赖此集合。 */
export const REACT_FLOW_STATE = Object.freeze({
	READY: "Ready",
	AWAITING_MODEL: "AwaitingModel",
	AWAITING_PERMISSION: "AwaitingPermission",
	AWAITING_TOOL: "AwaitingTool",
	AWAITING_CHILD: "AwaitingChild",
	SUSPENDED: "Suspended",
	COMPLETED: "Completed",
	FAILED: "Failed",
	CANCELLED: "Cancelled",
} as const);

/** 业务挂起原因，不增加系统原子状态。 */
export const FLOW_WAIT_REASON = Object.freeze({
	APPROVAL: "approval",
	TOOL_UNKNOWN: "tool_unknown",
	MODEL_UNKNOWN: "model_unknown",
} as const);

/** 显式子状态键从父状态和原因派生，禁止复制拼接后的协议字符串。 */
export const REACT_FLOW_WAIT_STATE = Object.freeze({
	APPROVAL: `${REACT_FLOW_STATE.SUSPENDED}.${FLOW_WAIT_REASON.APPROVAL}`,
	TOOL_UNKNOWN: `${REACT_FLOW_STATE.SUSPENDED}.${FLOW_WAIT_REASON.TOOL_UNKNOWN}`,
	MODEL_UNKNOWN: `${REACT_FLOW_STATE.SUSPENDED}.${FLOW_WAIT_REASON.MODEL_UNKNOWN}`,
} as const);

/** 耐久命令生命周期；与副作用事实分开定义。 */
export const FLOW_COMMAND_STATUS = Object.freeze({
	PENDING: "PENDING",
	CLAIMED: "CLAIMED",
	ACCEPTED: "ACCEPTED",
	SUCCEEDED: "SUCCEEDED",
	FAILED: "FAILED",
	UNKNOWN: "UNKNOWN",
	CANCELLED: "CANCELLED",
} as const);

/** 外部副作用事实；UNKNOWN不授予重试资格。 */
export const FLOW_EFFECT = Object.freeze({
	NONE: "NONE",
	KNOWN_NOT_APPLIED: "KNOWN_NOT_APPLIED",
	KNOWN_APPLIED: "KNOWN_APPLIED",
	UNKNOWN: "UNKNOWN",
} as const);

/** 耐久对账工单生命周期。 */
export const FLOW_INCIDENT_STATUS = Object.freeze({ OPEN: "OPEN", CLOSED_CANCELLED: "CLOSED_CANCELLED" } as const);

/** 从业务位置常量推导的封闭集合。 */
export type ReActFlowState = (typeof REACT_FLOW_STATE)[keyof typeof REACT_FLOW_STATE];

/** 判断业务终态，也支持迁移表展开后的子状态键。 */
export function isTerminalReActState(state: string): boolean {
	return [REACT_FLOW_STATE.COMPLETED, REACT_FLOW_STATE.FAILED, REACT_FLOW_STATE.CANCELLED].some(
		(terminal) => terminal === state,
	);
}
