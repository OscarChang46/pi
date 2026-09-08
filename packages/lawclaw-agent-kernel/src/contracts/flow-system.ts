import type { FLOW_JOURNAL_EVENT, FLOW_SYSTEM_ACTION, FLOW_SYSTEM_STATE } from "./flow-system-values.ts";
/** 系统原子状态；业务位置和终止原因不扩展此集合。 */
export type FlowSystemState = (typeof FLOW_SYSTEM_STATE)[keyof typeof FLOW_SYSTEM_STATE];

/** 生命周期事件；恢复必须显式撤销旧运行代次。 */
export type FlowSystemAction = (typeof FLOW_SYSTEM_ACTION)[keyof typeof FLOW_SYSTEM_ACTION];

/** 一次逻辑运行的不可变身份。 */
export interface FlowRunRequest {
	/** 租户内唯一的运行标识。 */
	readonly flowRunId: string;
	/** 已注册的工作流版本，恢复时必须一致。 */
	readonly workflowVersion: string;
	/** 有界规范JSON；只允许安全整数数值。 */
	readonly input: unknown;
}

/** 从追加日志重建的系统视图。 */
export interface FlowRun {
	/** 运行标识。 */
	readonly flowRunId: string;
	/** 当前日志尾序号，作为追加CAS依据。 */
	readonly revision: number;
	/** 当前四态之一。 */
	readonly state: FlowSystemState;
	/** 启动事件的日志序号；用于隔离陈旧执行。 */
	readonly epoch: number;
	/** 挂起或终止原因，不包含原始异常和敏感数据。 */
	readonly reason: string;
	/** 已提交的终止结果。 */
	readonly result: unknown;
}

/** Activity语义身份；key指一次调用，而非工具名称。 */
export interface FlowActivity {
	/** 在同一FlowRun内稳定且唯一的调用位置。 */
	readonly key: string;
	/** 注册的活动名称。 */
	readonly name: string;
	/** 活动实现与结果协议版本。 */
	readonly version: string;
	/** 参与重放校验的输入。 */
	readonly input: unknown;
}

/** 单次Activity的权威历史。 */
export interface FlowActivityRecord {
	/** 独立于日志序号的调用序号。 */
	readonly sequence: number;
	/** 身份摘要，覆盖key、名称、版本与输入。 */
	readonly identity: string;
	/** Started但没有Completed不能安全重发。 */
	readonly completed: boolean;
	/** Completed载荷；null也是合法结果。 */
	readonly result: unknown;
}

/** 对一次Running代次的引用。 */
export interface FlowExecutionToken {
	/** 运行标识。 */
	readonly flowRunId: string;
	/** 系统启动代次。 */
	readonly epoch: number;
}

/** 持久日志记录；不暴露为匿名诊断响应。 */
export interface FlowJournalEvent {
	/** 单FlowRun连续递增日志序号。 */
	readonly sequence: number;
	/** 事件名称。 */
	readonly kind: (typeof FLOW_JOURNAL_EVENT)[keyof typeof FLOW_JOURNAL_EVENT];
	/** 规范JSON载荷。 */
	readonly payload: unknown;
}

/** 追加日志事务端口；所有成功返回均表示已提交。 */
export interface FlowJournal {
	/** 幂等受理；同ID异内容拒绝。 */
	admit(request: FlowRunRequest): FlowRun;
	/** 重建运行视图，不读取可覆盖快照。 */
	get(flowRunId: string): FlowRun;
	/** CAS追加状态事件；未声明边拒绝。 */
	transition(flowRun: FlowRun, action: FlowSystemAction, reason: string, result?: unknown): FlowRun;
	/** 校验Running及当前执行代次。 */
	assertActive(token: FlowExecutionToken): void;
	/** 未完成的Started存在时不能报告工作流成功。 */
	hasUnfinished(flowRunId: string): boolean;
	/** 读取既有调用并验证身份，不授予新调用资格。 */
	readActivity(flowRunId: string, activity: FlowActivity): FlowActivityRecord | undefined;
	/** 原子唯一登记；existing不授予外部执行资格。 */
	start(
		token: FlowExecutionToken,
		activity: FlowActivity,
	): {
		/** 是否获得首次执行资格。 */
		readonly inserted: boolean;
		/** 权威调用历史。 */
		readonly record: FlowActivityRecord;
	};
	/** 追加结果，校验运行代次和Started身份。 */
	complete(token: FlowExecutionToken, activity: FlowActivity, result: unknown): void;
	/** 权威对账入口；只补结果，绝不自动重新派发。 */
	reconcile(flowRunId: string, activity: FlowActivity, result: unknown, evidence: string): void;
	/** 读取确定性节点检查点。 */
	checkpoint(flowRunId: string, key: string): unknown | undefined;
	/** 在当前代次追加检查点，同key异结果拒绝。 */
	saveCheckpoint(token: FlowExecutionToken, key: string, value: unknown): void;
	/** 按日志序号读取完整历史，调用方负责访问控制。 */
	history(flowRunId: string): readonly FlowJournalEvent[];
}

/** 工作流可用的系统能力，不包含任何业务协议。 */
export interface FlowExecutionContext {
	/** 唯一拦截入口；实现只能在新的Started提交后执行。 */
	activity(activity: FlowActivity, execute: () => Promise<unknown>): Promise<unknown>;
	/** 确定性节点恢复；内部外部动作仍必须单独经过activity。 */
	checkpoint(key: string, execute: () => Promise<unknown>): Promise<unknown>;
	/** 主动挂起；调用后停止本次工作流。 */
	yield(reason: string): never;
}

/** 由宿主注册的业务程序。 */
export type FlowWorkflow = (context: FlowExecutionContext) => Promise<unknown>;
