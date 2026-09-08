import type { FlowActivity, FlowExecutionToken, FlowJournal } from "../../contracts/flow-system.ts";
import type { FLOW_SYSTEM_ACTION } from "../../contracts/flow-system-values.ts";

/** 持久挂起控制信号；不将原始Provider异常写入日志。 */
export class FlowYield extends Error {
	/** 仅接受稳定的原因码。 */
	constructor(reason: string) {
		super(reason);
		this.name = "FlowYield";
	}
}

/** Activity执行边界：唯一Started、Completed回放、未知关闭。 */
export class ActivityInterceptor {
	readonly #journal: FlowJournal;
	/** 注入权威追加日志。 */
	constructor(journal: FlowJournal) {
		this.#journal = journal;
	}
	/** 未取得INSERT资格绝不执行；完成日志提交失败同样保持未知。 */
	async execute(token: FlowExecutionToken, activity: FlowActivity, execute: () => Promise<unknown>): Promise<unknown> {
		let started: ReturnType<FlowJournal[typeof FLOW_SYSTEM_ACTION.START]>;
		try {
			started = this.#journal.start(token, activity);
		} catch {
			// 提交确认丢失时可能已有Started；未获得确认不能派发或宣告失败终结。
			throw new FlowYield("ACTIVITY_START_UNCONFIRMED");
		}
		const { inserted, record } = started;
		if (record.completed) return record.result;
		if (!inserted) throw new FlowYield("ACTIVITY_RESULT_UNKNOWN");
		try {
			const result = await execute();
			this.#journal.complete(token, activity, result);
			return result;
		} catch {
			throw new FlowYield("ACTIVITY_RESULT_UNKNOWN");
		}
	}
}
