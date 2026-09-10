import { KernelError } from "../../contracts/index.ts";
import type { AgentRun } from "./agent-run.ts";

/** 现有进程内 Run 注册目录；唯一持有 Run 实例，不提供持久化或恢复能力。 */
export class RunRegistry {
	readonly #runs = new Map<string, AgentRun>();
	/** 查询 Run；未知标识返回 undefined，调用方负责在入口验证作用域。 */
	get(runId: string): AgentRun | undefined {
		return this.#runs.get(runId);
	}
	/** 注册独立 Run；重复 ID 拒绝，不能覆盖已执行状态。 */
	register(run: AgentRun): void {
		if (this.#runs.has(run.runId)) throw new KernelError("RUN_STATE_INVALID", "Run 标识不可重复。");
		this.#runs.set(run.runId, run);
	}
}
