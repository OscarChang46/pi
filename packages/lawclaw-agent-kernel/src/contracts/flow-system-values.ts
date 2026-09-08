/** 系统状态唯一取值源；持久值变更必须评审日志迁移与重放兼容性。 */
export const FLOW_SYSTEM_STATE = Object.freeze({
	READY: "Ready",
	RUNNING: "Running",
	YIELD: "Yield",
	TERMINATE: "Terminate",
} as const);

/** 系统生命周期动作；迁移表的键必须引用此定义。 */
export const FLOW_SYSTEM_ACTION = Object.freeze({
	START: "start",
	YIELD: "yield",
	RESUME: "resume",
	RECOVER: "recover",
	TERMINATE: "terminate",
} as const);

/** 追加日志事件名称；写入、重放与数据库约束复用同一定义。 */
export const FLOW_JOURNAL_EVENT = Object.freeze({
	RUN_ADMITTED: "Run_Admitted",
	STATE_CHANGED: "State_Changed",
	ACTIVITY_STARTED: "Activity_Started",
	ACTIVITY_COMPLETED: "Activity_Completed",
	CHECKPOINT: "Checkpoint",
} as const);

/** 图节点路由结果，与系统四态独立。 */
export const FLOW_GRAPH_ROUTE = Object.freeze({ NEXT: "next", EXIT: "exit" } as const);
