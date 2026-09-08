import type { DurableFlowStore } from "../contracts/flow-storage.ts";
import { FLOW_COMMAND_STATUS, REACT_FLOW_STATE } from "../contracts/react-flow-values.ts";
import type { FlowDriver } from "./flow-driver.ts";

/** 本地调度容量；用于调度器、受理和诊断的同一上限。 */
export const FLOW_SCHEDULER_LIMITS = Object.freeze({ maxConcurrentRoots: 2, maxRuns: 4096, scanIntervalMs: 500 });

/** 负责发现和有界调度根Run；不解析HTTP、不拥有数据库生命周期。 */
export class FlowScheduler {
	readonly #store: DurableFlowStore;
	readonly #driver: Pick<FlowDriver, "drive" | "abort">;
	readonly #running = new Map<string, Promise<void>>();
	readonly #failures = new Map<string, string>();
	#timer: ReturnType<typeof setInterval> | undefined;
	#stopping = false;
	/** 注入耐久目录和执行驱动；构造不启动后台任务。 */
	constructor(store: DurableFlowStore, driver: Pick<FlowDriver, "drive" | "abort">) {
		this.#store = store;
		this.#driver = driver;
	}
	/** 当前只读运行情况，供受理与诊断使用。 */
	get status() {
		return {
			stopping: this.#stopping,
			running: this.#running.size,
			failures: this.#failures as ReadonlyMap<string, string>,
		};
	}
	/** 显式启动扫描；重复启动不重复登记定时器。 */
	start(): void {
		if (this.#stopping) throw new Error("FLOW_SCHEDULER_STOPPED");
		this.#timer ??= setInterval(() => this.#scan(), FLOW_SCHEDULER_LIMITS.scanIntervalMs);
	}
	/** 按根Run合并调度并限制并发；积压Run由下次扫描重新发现。 */
	schedule(agentRunId: string): void {
		if (
			this.#stopping ||
			this.#running.has(agentRunId) ||
			this.#running.size >= FLOW_SCHEDULER_LIMITS.maxConcurrentRoots
		)
			return;
		const task = this.#driver
			.drive(agentRunId)
			.then(
				() => {
					this.#failures.delete(agentRunId);
				},
				(error) => {
					const code =
						error instanceof Error && /^FLOW_[A-Z_]+$/.test(error.message) ? error.message : "FLOW_RUNTIME_ERROR";
					this.#failures.set(agentRunId, code);
					console.error(JSON.stringify({ event: "flow_driver_error", runId: agentRunId, code }));
				},
			)
			.finally(() => {
				this.#running.delete(agentRunId);
			});
		this.#running.set(agentRunId, task);
	}
	/** 停止扫描及活动执行，等待所有结果写入后返回。 */
	async stop(): Promise<void> {
		this.#stopping = true;
		clearInterval(this.#timer);
		for (const agentRunId of this.#running.keys()) this.#driver.abort(agentRunId);
		await Promise.all(this.#running.values());
	}
	#scan(): void {
		try {
			for (const agentRunId of this.#store.listRunIds(FLOW_SCHEDULER_LIMITS.maxRuns)) {
				const input = this.#store.load(agentRunId);
				if (!input || input.run.depth !== 0) continue;
				const maintenancePending = this.#store
					.commands(agentRunId)
					.some(
						(record) =>
							[FLOW_COMMAND_STATUS.PENDING, FLOW_COMMAND_STATUS.CLAIMED, FLOW_COMMAND_STATUS.ACCEPTED].some(
								(status) => status === record.status,
							) && ["CancelOutstanding", "RequestReconciliation"].includes(record.command.payload.kind),
					);
				if (
					maintenancePending ||
					![
						REACT_FLOW_STATE.COMPLETED,
						REACT_FLOW_STATE.FAILED,
						REACT_FLOW_STATE.CANCELLED,
						REACT_FLOW_STATE.SUSPENDED,
					].some((state) => state === input.run.position.kind)
				)
					this.schedule(agentRunId);
			}
		} catch {
			console.error(JSON.stringify({ event: "flow_scan_error", code: "FLOW_STORAGE_UNAVAILABLE" }));
		}
	}
}
