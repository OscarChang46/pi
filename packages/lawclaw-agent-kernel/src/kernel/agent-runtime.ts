import {
	type AgentRunResult,
	KernelError,
	type RequestContext,
	type StartAgentRunCommand,
} from "../contracts/index.ts";
import type { AgentRunExecutor } from "./agent-run.ts";
import { AgentSession } from "./agent-session.ts";
import type { PermissionCeiling } from "./permission-approval.ts";

/** AgentRuntime 聚合根的会话和 Run 容量配置。 */
export interface AgentObjectModelLimits {
	readonly maxSessions: number;
	readonly maxRunsPerSession: number;
}

/** Agent 系统聚合根；拥有 Session 目录并通过 Session 创建 AgentRun。 */
export class AgentRuntime {
	readonly runtimeId: string;
	readonly agentId: string;
	readonly #executor: AgentRunExecutor;
	readonly #limits: AgentObjectModelLimits;
	readonly #runtimeCeiling: PermissionCeiling;
	readonly #sessions = new Map<string, AgentSession>();
	#tenantId: string | undefined;

	/** 创建固定执行器和容量上限的 Runtime 聚合根。 */
	public constructor(
		runtimeId: string,
		agentId: string,
		executor: AgentRunExecutor,
		limits: AgentObjectModelLimits,
		runtimeCeiling: PermissionCeiling,
	) {
		this.runtimeId = runtimeId;
		this.agentId = agentId;
		this.#executor = executor;
		this.#limits = limits;
		this.#runtimeCeiling = runtimeCeiling;
	}

	/** 返回 Runtime 当前管理的 Session。 */
	public get sessions(): readonly AgentSession[] {
		return Object.freeze([...this.#sessions.values()]);
	}

	/** 获取已有 Session，或在容量内创建同租户 Session。 */
	public session(context: RequestContext, sessionId: string): AgentSession {
		if (this.#tenantId && this.#tenantId !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "AgentRuntime 不能跨租户复用。", false);
		}
		const existing = this.#sessions.get(sessionId);
		if (existing) return existing;
		if (this.#sessions.size >= this.#limits.maxSessions) {
			throw new KernelError("RUNTIME_SESSION_LIMIT_EXCEEDED", "AgentRuntime 已达到 Session 容量上限。", false, {
				maxSessions: this.#limits.maxSessions,
			});
		}
		this.#tenantId = context.tenant.tenantId;
		const created = new AgentSession(
			this.runtimeId,
			this.agentId,
			sessionId,
			context.tenant.tenantId,
			this.#executor,
			this.#runtimeCeiling,
			this.#runtimeCeiling,
			this.#limits.maxRunsPerSession,
		);
		this.#sessions.set(sessionId, created);
		return created;
	}

	/** 兼容原入口：通过 Session 创建并执行 AgentRun。 */
	public async run(
		context: RequestContext,
		command: StartAgentRunCommand,
		signal: AbortSignal = new AbortController().signal,
	): Promise<AgentRunResult> {
		return this.session(context, command.sessionId).startRun(context, command, signal);
	}
}
