import { KernelError } from "../contracts/index.ts";

/** 单次 Agent Loop 的技术终态。 */
export type AgentLoopStatus = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

/** AgentRun 用来接收执行引擎 Loop 生命周期的内部端口。 */
export interface AgentLoopLifecyclePort {
	/** 在一次模型 Turn 开始前创建对应 Loop。 */
	loopStarted(ordinal: number, startedAt: string): void;
	/** 在该 Turn 的工具处理和上下文更新结束后关闭 Loop。 */
	loopFinished(ordinal: number, status: Exclude<AgentLoopStatus, "RUNNING">, finishedAt: string): void;
}

/** AgentRun 内的一次模型—动作—上下文迭代实体。 */
export class AgentLoop {
	readonly ordinal: number;
	readonly startedAt: string;
	#status: AgentLoopStatus = "RUNNING";
	#finishedAt: string | undefined;

	/** 创建顺序不可变、初始为 RUNNING 的 Loop。 */
	public constructor(ordinal: number, startedAt: string) {
		if (!Number.isSafeInteger(ordinal) || ordinal < 1 || startedAt.trim() === "") {
			throw new KernelError("RUN_STATE_INVALID", "AgentLoop 序号或开始时间无效。", false);
		}
		this.ordinal = ordinal;
		this.startedAt = startedAt;
	}

	/** 当前 Loop 状态。 */
	public get status(): AgentLoopStatus {
		return this.#status;
	}

	/** Loop 完成或失败的时间；运行中为空。 */
	public get finishedAt(): string | undefined {
		return this.#finishedAt;
	}

	/** 以不可逆终态关闭 Loop。 */
	public finish(status: Exclude<AgentLoopStatus, "RUNNING">, finishedAt: string): void {
		if (this.#status !== "RUNNING" || finishedAt.trim() === "") {
			throw new KernelError("RUN_STATE_INVALID", "AgentLoop 只能从 RUNNING 进入一次终态。", false);
		}
		this.#status = status;
		this.#finishedAt = finishedAt;
	}
}
