import {
	type AgentRunResult,
	KernelError,
	type RequestContext,
	type StartAgentRunCommand,
} from "../contracts/index.ts";
import { AgentRun, type AgentRunExecutor } from "./agent-run.ts";
import type { PermissionCeiling } from "./permission-approval.ts";

/** Runtime 内管理多次用户请求和 AgentRun 的逻辑会话对象。 */
export class AgentSession {
	readonly sessionId: string;
	readonly tenantId: string;
	readonly runtimeId: string;
	readonly agentId: string;
	readonly #executor: AgentRunExecutor;
	readonly #runtimeCeiling: PermissionCeiling;
	readonly #sessionCeiling: PermissionCeiling;
	readonly #maxRuns: number;
	readonly #runs = new Map<string, AgentRun>();
	#activeRunId: string | undefined;

	/** 创建绑定单一租户、默认串行执行的 Session。 */
	public constructor(
		runtimeId: string,
		agentId: string,
		sessionId: string,
		tenantId: string,
		executor: AgentRunExecutor,
		runtimeCeiling: PermissionCeiling,
		sessionCeiling: PermissionCeiling,
		maxRuns: number,
	) {
		this.runtimeId = runtimeId;
		this.agentId = agentId;
		this.sessionId = sessionId;
		this.tenantId = tenantId;
		this.#executor = executor;
		this.#runtimeCeiling = runtimeCeiling;
		this.#sessionCeiling = sessionCeiling;
		this.#maxRuns = maxRuns;
	}

	/** 返回该 Session 管理的全部 Run。 */
	public get runs(): readonly AgentRun[] {
		return Object.freeze([...this.#runs.values()]);
	}

	/** 在会话内创建并执行一次新的 AgentRun。 */
	public async startRun(
		context: RequestContext,
		command: StartAgentRunCommand,
		signal: AbortSignal = new AbortController().signal,
	): Promise<AgentRunResult> {
		if (context.tenant.tenantId !== this.tenantId || command.sessionId !== this.sessionId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "AgentRun 与 Session 的租户或会话标识不一致。", false);
		}
		if (this.#activeRunId) {
			throw new KernelError("RUN_STATE_INVALID", "同一 AgentSession 首版只允许一个活动 Run。", false);
		}
		if (this.#runs.has(command.runId)) {
			throw new KernelError("RUN_STATE_INVALID", "AgentSession 中的 runId 不可重复。", false);
		}
		if (this.#runs.size >= this.#maxRuns) {
			throw new KernelError("SESSION_RUN_LIMIT_EXCEEDED", "AgentSession 已达到 Run 容量上限。", false, {
				maxRuns: this.#maxRuns,
			});
		}
		const run = new AgentRun(
			context,
			command,
			this.#executor,
			{ runtimeId: this.runtimeId, agentId: this.agentId },
			this.#runtimeCeiling,
			this.#sessionCeiling,
		);
		this.#runs.set(run.runId, run);
		this.#activeRunId = run.runId;
		try {
			return await run.execute(signal);
		} finally {
			this.#activeRunId = undefined;
		}
	}

	/** 按标识读取 Session 内的 Run。 */
	public getRun(runId: string): AgentRun | undefined {
		return this.#runs.get(runId);
	}
}
