import type {
	FlowExecutionContext,
	FlowExecutionToken,
	FlowJournal,
	FlowRun,
	FlowRunRequest,
	FlowWorkflow,
} from "../../contracts/flow-system.ts";
import { FLOW_SYSTEM_ACTION, FLOW_SYSTEM_STATE } from "../../contracts/flow-system-values.ts";
import { ActivityInterceptor, FlowYield } from "./activity-interceptor.ts";

/** 通用系统执行框架；仅管理四态、追加日志和可拦截调用。 */
export class FlowEngine {
	readonly #journal: FlowJournal;
	readonly #interceptor: ActivityInterceptor;
	/** 注入日志，不启动后台线程或分配执行资源。 */
	constructor(journal: FlowJournal) {
		this.#journal = journal;
		this.#interceptor = new ActivityInterceptor(journal);
	}
	/** 运行已注册的业务程序；Running由现有调用持有，不自动接管。 */
	async run(request: FlowRunRequest, workflow: FlowWorkflow): Promise<FlowRun> {
		let flowRun = this.#journal.admit(request);
		if (flowRun.state === FLOW_SYSTEM_STATE.TERMINATE || flowRun.state === FLOW_SYSTEM_STATE.RUNNING) return flowRun;
		if (flowRun.state === FLOW_SYSTEM_STATE.YIELD)
			flowRun = this.#journal.transition(flowRun, FLOW_SYSTEM_ACTION.RESUME, "RESUMED");
		flowRun = this.#journal.transition(flowRun, FLOW_SYSTEM_ACTION.START, "STARTED");
		const token = { flowRunId: flowRun.flowRunId, epoch: flowRun.epoch };
		const context = this.#context(token);
		try {
			const result = await workflow(context);
			context.assertContinuing();
			this.#journal.assertActive(token);
			if (this.#journal.hasUnfinished(flowRun.flowRunId)) throw new FlowYield("ACTIVITY_RESULT_UNKNOWN");
			return this.#journal.transition(
				this.#journal.get(flowRun.flowRunId),
				FLOW_SYSTEM_ACTION.TERMINATE,
				"COMPLETED",
				result,
			);
		} catch (error) {
			this.#journal.assertActive(token);
			const unfinished = this.#journal.hasUnfinished(flowRun.flowRunId);
			let reason = error instanceof FlowYield ? "WORKFLOW_WAIT" : "WORKFLOW_FAILED";
			if (error instanceof Error && /^(?:FLOW_|ACTIVITY_)[A-Z_]+$/.test(error.message)) reason = error.message;
			if (unfinished) reason = "ACTIVITY_RESULT_UNKNOWN";
			return this.#journal.transition(
				this.#journal.get(flowRun.flowRunId),
				error instanceof FlowYield || unfinished ? FLOW_SYSTEM_ACTION.YIELD : FLOW_SYSTEM_ACTION.TERMINATE,
				reason,
			);
		}
	}
	/** 维护方确认旧执行失效后撤销代次；不会重新执行未知Activity。 */
	recover(flowRunId: string): FlowRun {
		return this.#journal.transition(
			this.#journal.get(flowRunId),
			FLOW_SYSTEM_ACTION.RECOVER,
			"EXECUTION_INTERRUPTED",
		);
	}
	/** 显式终止；外部已发出的调用不能撤回，后续回调被代次校验拒绝。 */
	terminate(flowRunId: string, reason: string): FlowRun {
		const flowRun = this.#journal.get(flowRunId);
		return flowRun.state === FLOW_SYSTEM_STATE.TERMINATE
			? flowRun
			: this.#journal.transition(flowRun, FLOW_SYSTEM_ACTION.TERMINATE, reason);
	}
	#context(token: FlowExecutionToken): FlowExecutionContext & { assertContinuing(): void } {
		let interrupted: unknown;
		return {
			assertContinuing: () => {
				if (interrupted) throw interrupted;
			},
			activity: async (activity, execute) => {
				if (interrupted) throw interrupted;
				try {
					return await this.#interceptor.execute(token, activity, execute);
				} catch (error) {
					interrupted = error;
					throw error;
				}
			},
			checkpoint: async (key, execute) => {
				if (interrupted) throw interrupted;
				this.#journal.assertActive(token);
				const prior = this.#journal.checkpoint(token.flowRunId, key);
				if (prior !== undefined) return prior;
				const result = await execute();
				if (interrupted) throw interrupted;
				this.#journal.saveCheckpoint(token, key, result);
				return result;
			},
			yield: (reason): never => {
				interrupted = new FlowYield(reason);
				throw interrupted;
			},
		};
	}
}
