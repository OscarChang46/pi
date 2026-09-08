import type { FlowCommandOutcome } from "../contracts/flow-dispatch.ts";
import type { AdvanceInput, EngineCommand } from "../contracts/flow-engine.ts";
import type { DurableFlowStore } from "../contracts/flow-storage.ts";
import type { FlowExecutionContext, FlowJournal } from "../contracts/flow-system.ts";
import { isTerminalReActState } from "../contracts/react-flow-values.ts";
import type { FlowDriver } from "./flow-driver.ts";
import { FlowEngine } from "./flow-system/flow-engine.ts";

/** ReAct业务检查点适配器；系统框架只看到不透明输入和Activity。 */
export class ReActFlowHost {
	readonly #store: DurableFlowStore;
	readonly #system: FlowEngine;
	readonly #journal: FlowJournal;
	readonly #contexts = new Map<string, FlowExecutionContext>();
	readonly #active = new Map<string, Promise<void>>();
	#driver: FlowDriver | undefined;
	/** 业务存储与系统日志分别拥有各自的协议。 */
	constructor(store: DurableFlowStore, journal: FlowJournal) {
		this.#store = store;
		this.#journal = journal;
		this.#system = new FlowEngine(journal);
	}
	/** 装配一次业务驱动，循环依赖只在组合根建立。 */
	bind(driver: FlowDriver): void {
		if (this.#driver) throw new Error("FLOW_HOST_ALREADY_BOUND");
		this.#driver = driver;
	}
	/** 同一运行的调用加入当前Promise；不会并发执行业务程序。 */
	drive(agentRunId: string): Promise<void> {
		const active = this.#active.get(agentRunId);
		if (active) return active;
		const task = Promise.resolve()
			.then(() => this.#run(agentRunId))
			.finally(() => this.#active.delete(agentRunId));
		this.#active.set(agentRunId, task);
		return task;
	}
	/** 业务取消仍由业务存储记录，执行中断由既有驱动传播。 */
	abort(agentRunId: string): void {
		this.#driver?.abort(agentRunId);
	}
	/** 系统Completed先于业务记录落盘时，从系统日志恢复结果。 */
	replay(input: AdvanceInput, command: EngineCommand): FlowCommandOutcome | null | undefined {
		const agentRun = input.run;
		const flowRunId = flowRunIdForAgentRun(agentRun.runId);
		const record = this.#journal.readActivity(flowRunId, commandActivity(command));
		return record?.completed ? (record.result as FlowCommandOutcome | null) : undefined;
	}
	/** 将持久业务命令映射到系统Activity的稳定位置。 */
	async activity(
		input: AdvanceInput,
		command: EngineCommand,
		execute: () => Promise<FlowCommandOutcome | null>,
	): Promise<FlowCommandOutcome | null> {
		const context = this.#contexts.get(input.run.runId);
		if (!context) throw new Error("FLOW_EXECUTION_CONTEXT_MISSING");
		return (await context.activity(commandActivity(command), execute)) as FlowCommandOutcome | null;
	}
	async #run(agentRunId: string): Promise<void> {
		const initial = this.#store.initial(agentRunId);
		if (!initial || !this.#driver) throw new Error("FLOW_HOST_NOT_READY");
		const driver = this.#driver;
		const flowRunId = flowRunIdForAgentRun(agentRunId);
		await this.#system.run({ flowRunId, workflowVersion: "react-checkpoint-v1", input: initial }, async (context) => {
			this.#contexts.set(agentRunId, context);
			try {
				await driver.drive(agentRunId);
				const agentRun = this.#store.load(agentRunId)!.run;
				if (!isTerminalReActState(agentRun.position.kind)) context.yield("BUSINESS_WAIT");
				return { position: agentRun.position };
			} catch {
				// 业务快照尚未提交时仍可依靠系统Completed恢复，不封闭系统运行。
				context.yield("FLOW_BUSINESS_DRIVER_INTERRUPTED");
			} finally {
				this.#contexts.delete(agentRunId);
			}
		});
	}
}

/**
 * ReAct宿主拥有的AgentRun到FlowRun身份映射，通用FE不认识AgentRun。
 * 当前档案在两个独立存储中沿用相同字符串；保持此映射才能找到既有Activity回执。
 */
export function flowRunIdForAgentRun(agentRunId: string): string {
	return agentRunId;
}

function commandActivity(command: EngineCommand) {
	return { key: command.commandId, name: command.payload.kind, version: "react-command-v1", input: command };
}
