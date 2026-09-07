import {
	type AgentRunResult,
	KernelError,
	type RequestContext,
	type StartAgentRunCommand,
} from "../contracts/index.ts";
import type { PermissionCeiling } from "../contracts/permissions.ts";
import type { AgentRunExecutor } from "./agent-run.ts";
import { AgentRun } from "./agent-run.ts";
import { AgentSession } from "./agent-session.ts";
import type { RunRegistry } from "./run-registry.ts";

/** 控制入口的会话与关联 Run 容量上限。 */
export interface AgentObjectModelLimits {
	/** 控制入口最多保留的技术会话数。 */
	readonly maxSessions: number;
	/** 每个技术会话允许关联的 Run 数量上限。 */
	readonly maxRunsPerSession: number;
}

/** 本地控制入口；协调独立 Session 档案与 Run 注册目录，不是 Runtime 聚合根。 */
export class AgentSystem {
	/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
	readonly runtimeId: string;
	/** Agent 的稳定技术标识；不承载业务角色解释。 */
	readonly agentId: string;
	readonly #executor: AgentRunExecutor;
	readonly #limits: AgentObjectModelLimits;
	readonly #runtimeCeiling: PermissionCeiling;
	readonly #runs: RunRegistry;
	readonly #sessions = new Map<string, AgentSession>();
	#tenantId: string | undefined;

	/** 注入执行端口、Run 目录与容量上限；不创建模型 Adapter。 */
	public constructor(
		runtimeId: string,
		agentId: string,
		executor: AgentRunExecutor,
		limits: AgentObjectModelLimits,
		runtimeCeiling: PermissionCeiling,
		runs: RunRegistry,
	) {
		this.#runs = runs;
		this.runtimeId = runtimeId;
		this.agentId = agentId;
		this.#executor = executor;
		this.#limits = limits;
		this.#runtimeCeiling = runtimeCeiling;
	}

	/** 返回控制入口管理的技术会话档案快照。 */
	public get sessions(): readonly AgentSession[] {
		return Object.freeze([...this.#sessions.values()]);
	}

	/** 获取已有 Session，或在容量内创建同租户 Session。 */
	public session(context: RequestContext, sessionId: string): AgentSession {
		if (this.#tenantId && this.#tenantId !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "AgentSystem 不能跨租户复用。", false);
		}
		const existing = this.#sessions.get(sessionId);
		if (existing) return existing;
		if (this.#sessions.size >= this.#limits.maxSessions) {
			throw new KernelError("RUNTIME_SESSION_LIMIT_EXCEEDED", "AgentSystem 已达到 Session 容量上限。", false, {
				maxSessions: this.#limits.maxSessions,
			});
		}
		this.#tenantId = context.tenant.tenantId;
		const created = new AgentSession(sessionId, context.tenant.tenantId, this.agentId);
		this.#sessions.set(sessionId, created);
		return created;
	}

	/** 创建并执行独立 Run；取消向下传播，完成或失败后释放会话活动关联。 */
	public async run(
		context: RequestContext,
		command: StartAgentRunCommand,
		signal: AbortSignal = new AbortController().signal,
	): Promise<AgentRunResult> {
		const session = this.session(context, command.sessionId);
		if (this.#runs.get(command.runId)) throw new KernelError("RUN_STATE_INVALID", "Run 标识不可重复。");
		if (session.runIds.length >= this.#limits.maxRunsPerSession)
			throw new KernelError("SESSION_RUN_LIMIT_EXCEEDED", "Session 关联的 Run 数量已达到上限。");
		const run = new AgentRun(
			context,
			command,
			this.#executor,
			{ runtimeId: this.runtimeId, agentId: this.agentId },
			this.#runtimeCeiling,
			this.#runtimeCeiling,
		);
		session.beginRun(run.runId);
		try {
			this.#runs.register(run);
			return await run.execute(signal);
		} finally {
			session.finishRun(run.runId);
		}
	}
	/** 查询独立 Run 的状态对象；不会从 Session 反查执行器。 */
	public getRun(runId: string): AgentRun | undefined {
		return this.#runs.get(runId);
	}
}
