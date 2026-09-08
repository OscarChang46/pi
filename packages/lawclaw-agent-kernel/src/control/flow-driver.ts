import { randomUUID } from "node:crypto";
import type { FlowCommandOutcome } from "../contracts/flow-dispatch.ts";
import type { AdvanceInput, ExecutionClaim } from "../contracts/flow-engine.ts";
import { FLOW_COMMAND_STATUS, REACT_FLOW_STATE } from "../contracts/react-flow-values.ts";
import {
	FlowCommandDispatcher,
	type FlowDispatchDependencies,
	type FlowExecutionLease,
} from "./flow-command-dispatcher.ts";
import { createFlowEvent } from "./flow-events.ts";
import type { ReActFlowPolicy } from "./react-flow/react-flow-policy.ts";

/** 单Run驱动只负责租约、事件推进与提交，执行生命周期委托给命令派发器。 */
export interface FlowDriverDependencies extends FlowDispatchDependencies {
	/** 宿主注入的一次驱动最大推进步数。 */
	readonly maxAdvanceSteps: number;
	/** 纯状态机。 */
	readonly engine: ReActFlowPolicy;
	/** 基于已提交转录重建上下文。 */
	readonly prepareContext: (input: AdvanceInput) => AdvanceInput;
}

const LEASE_DURATION_MS = 30000;
const LEASE_RENEWAL_MS = 10000;

/** 驱动一次Run执行资格下的事件循环，不执行Provider或管理HTTP。 */
export class FlowDriver {
	readonly #dependencies: FlowDriverDependencies;
	readonly #dispatcher: FlowCommandDispatcher;
	readonly #ownerId = randomUUID();
	readonly #active = new Map<string, { controller: AbortController; task: Promise<void> }>();
	/** 注入已装配端口；构造不启动任务。 */
	constructor(dependencies: FlowDriverDependencies) {
		if (!Number.isSafeInteger(dependencies.maxAdvanceSteps) || dependencies.maxAdvanceSteps < 1)
			throw new Error("FLOW_DRIVER_LIMIT_INVALID");
		this.#dependencies = dependencies;
		this.#dispatcher = new FlowCommandDispatcher(dependencies);
	}
	/** 停止进程内活动调用；取消事实由Run存储持久化。 */
	abort(agentRunId: string): void {
		this.#active.get(agentRunId)?.controller.abort();
	}
	/** 同Run调用加入同一Promise，避免父任务读到尚未完成的子Run。 */
	drive(agentRunId: string): Promise<void> {
		const active = this.#active.get(agentRunId);
		if (active) return active.task;
		const controller = new AbortController();
		const task = Promise.resolve()
			.then(() => this.#run(agentRunId, controller))
			.finally(() => {
				this.#active.delete(agentRunId);
			});
		this.#active.set(agentRunId, { controller, task });
		return task;
	}
	async #run(agentRunId: string, controller: AbortController): Promise<void> {
		const acquired = this.#dependencies.store.acquire(agentRunId, this.#ownerId, LEASE_DURATION_MS);
		if (!acquired) return;
		const lease = { claim: acquired };
		const renewal = setInterval(() => this.#renew(agentRunId, lease, controller), LEASE_RENEWAL_MS);
		try {
			for (let step = 0; step < this.#dependencies.maxAdvanceSteps; step++) {
				if (!(await this.#step(agentRunId, lease, controller.signal))) return;
			}
			throw new Error("FLOW_DRIVER_STEP_LIMIT");
		} finally {
			clearInterval(renewal);
		}
	}
	#renew(agentRunId: string, lease: FlowExecutionLease, controller: AbortController): void {
		try {
			const renewed = this.#dependencies.store.acquire(agentRunId, this.#ownerId, LEASE_DURATION_MS);
			if (!renewed || renewed.attemptId !== lease.claim.attemptId) controller.abort();
			else lease.claim = renewed;
		} catch {
			controller.abort();
		}
	}
	async #step(agentRunId: string, lease: FlowExecutionLease, signal: AbortSignal): Promise<boolean> {
		const { store, time } = this.#dependencies;
		const input = store.load(agentRunId);
		if (!input) return false;
		if (input.priorReceipt === null) {
			await this.#advance(input, lease.claim);
			return true;
		}
		if (
			[
				REACT_FLOW_STATE.COMPLETED,
				REACT_FLOW_STATE.FAILED,
				REACT_FLOW_STATE.CANCELLED,
				REACT_FLOW_STATE.SUSPENDED,
			].some((state) => state === input.run.position.kind)
		) {
			const maintenance = store
				.commands(agentRunId)
				.find(
					(record) =>
						[FLOW_COMMAND_STATUS.PENDING, FLOW_COMMAND_STATUS.CLAIMED, FLOW_COMMAND_STATUS.ACCEPTED].some(
							(status) => status === record.status,
						) && ["CancelOutstanding", "RequestReconciliation"].includes(record.command.payload.kind),
				);
			if (!maintenance) return false;
			await this.#dispatcher.resolve(input, maintenance, lease, signal);
			return true;
		}
		if (time.now().epochMilliseconds >= input.run.deadlineAtMs) {
			this.#accept(input, { source: "scheduler", payload: { kind: "DeadlineReached" } }, agentRunId, lease.claim);
			return true;
		}
		if (input.run.position.kind === REACT_FLOW_STATE.READY) {
			this.#accept(
				input,
				{ source: "scheduler", payload: { kind: "AdvanceRequested", basisVersion: input.run.version } },
				agentRunId,
				lease.claim,
			);
			return true;
		}
		if (!("commandId" in input.run.position)) return false;
		const record = await store.queryCommand(agentRunId, input.run.position.commandId);
		if (!record) throw new Error("FLOW_COMMAND_MISSING");
		const outcome = await this.#dispatcher.resolve(input, record, lease, signal);
		if (!outcome) return false;
		const current = store.load(agentRunId);
		if (current?.priorReceipt && current.run.position.kind === input.run.position.kind)
			this.#accept(current, outcome, record.command.commandId, lease.claim);
		return true;
	}
	async #advance(current: AdvanceInput, claim: ExecutionClaim): Promise<void> {
		const { store, engine, time, prepareContext } = this.#dependencies;
		let input = { ...current, operation: { ...current.operation, nowMs: time.now().epochMilliseconds } };
		if (
			input.run.position.kind === REACT_FLOW_STATE.READY &&
			!input.run.cancellationRequested &&
			input.operation.nowMs < input.operation.deadlineAtMs
		)
			input = prepareContext(input);
		const result = engine.advance(input);
		if (result.kind !== "advance")
			throw new Error(result.kind === "reject" ? result.error.code : "FLOW_UNEXPECTED_DUPLICATE");
		const commit = await store.commit({ input, decision: result.decision, claim });
		if (commit.kind !== "committed") throw new Error("FLOW_COMMIT_CONFLICT");
	}
	#accept(input: AdvanceInput, outcome: FlowCommandOutcome, causationId: string, claim: ExecutionClaim): void {
		const event = createFlowEvent(input.run, outcome.payload, outcome.source, causationId);
		this.#dependencies.store.acceptEvent(input.run.runId, event, claim);
	}
}
