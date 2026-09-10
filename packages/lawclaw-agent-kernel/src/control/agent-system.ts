import { randomUUID } from "node:crypto";
import {
	ACTIVE_RUN_BINDING_STATE,
	type AgentRunResult,
	digest,
	type EnsureSessionCommand,
	type EnsureSessionResult,
	KernelError,
	type RequestContext,
	type SessionCommandPort,
	type SessionLookupResult,
	type SessionQueryPort,
	type StartAgentRunCommand,
} from "../contracts/index.ts";
import type { PermissionCeiling } from "../contracts/permissions.ts";
import type { AgentRunExecutor } from "./run-registry/agent-run.ts";
import { AgentRun } from "./run-registry/agent-run.ts";
import type { RunRegistry } from "./run-registry/run-registry.ts";
import { AgentSession } from "./session-manager/agent-session.ts";

/** 控制入口的会话容量上限。 */
export interface AgentObjectModelLimits {
	/** 控制入口最多保留的技术会话数。 */
	readonly maxSessions: number;
}

interface SessionLookupBinding {
	readonly scopeKey: string;
	readonly logicalKey: string;
	readonly sessionId: string;
	readonly agentDefinitionRef: string;
	readonly contextPolicyRef: string;
}

interface EnsureReceipt {
	readonly scopeKey: string;
	readonly commandId: string;
	readonly payloadDigest: string;
	readonly result: EnsureSessionResult;
}

/** 本地控制入口；协调独立 Session 档案与 Run 注册目录，不是 Runtime 聚合根。 */
export class AgentSystem implements SessionQueryPort, SessionCommandPort {
	/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
	readonly runtimeId: string;
	/** Agent 的稳定技术标识；不承载业务角色解释。 */
	readonly agentId: string;
	readonly #executor: AgentRunExecutor;
	readonly #limits: AgentObjectModelLimits;
	readonly #runtimeCeiling: PermissionCeiling;
	readonly #runs: RunRegistry;
	readonly #sessions = new Map<string, AgentSession>();
	readonly #sessionBindings = new Map<string, SessionLookupBinding>();
	readonly #ensureReceipts = new Map<string, EnsureReceipt>();
	#scopeKey: string | undefined;

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

	/** 按 logicalKey 只读查询已确认 Root；缺失时不创建标识、Session 或回执。 */
	public lookup(context: RequestContext, logicalKey: string): SessionLookupResult {
		this.#assertTenantScope(context);
		const binding = this.#sessionBindings.get(logicalKey);
		if (!binding) return Object.freeze({ state: "absent" });
		const session = this.#sessions.get(binding.sessionId);
		if (!session) {
			throw new KernelError("SESSION_NOT_FOUND", "logicalKey 指向的 Session 不存在。", false, {
				sessionId: binding.sessionId,
			});
		}
		return Object.freeze({ state: "found", anchor: session.anchor() });
	}

	/** 显式确保 Root 存在；同命令重放返回原结果，不同命令竞争返回同一赢家锚点。 */
	public ensure(context: RequestContext, command: EnsureSessionCommand): EnsureSessionResult {
		this.#assertTenantScope(context);
		this.#assertEnsureCommand(command);
		const payloadDigest = digest(command.intent);
		const receipt = this.#ensureReceipts.get(command.commandId);
		if (receipt) {
			if (receipt.payloadDigest !== payloadDigest) {
				throw new KernelError("IDEMPOTENCY_CONFLICT", "同一 ensure 命令不能更换创建意图。", false, {
					commandId: command.commandId,
				});
			}
			return receipt.result;
		}

		const binding = this.#sessionBindings.get(command.intent.logicalKey);
		if (binding) {
			this.#assertMatchingBinding(binding, command);
			const existing = this.#sessions.get(binding.sessionId);
			if (!existing) {
				throw new KernelError("SESSION_NOT_FOUND", "logicalKey 指向的 Session 不存在。", false, {
					sessionId: binding.sessionId,
				});
			}
			return this.#recordEnsureReceipt(context, command.commandId, payloadDigest, {
				anchor: existing.anchor(),
				created: false,
			});
		}
		if (this.#sessions.size >= this.#limits.maxSessions) {
			throw new KernelError("RUNTIME_SESSION_LIMIT_EXCEEDED", "AgentSystem 已达到 Session 容量上限。", false, {
				maxSessions: this.#limits.maxSessions,
			});
		}
		this.#scopeKey = context.tenant.tenantId;
		const created = new AgentSession(`session:${randomUUID()}`, context.tenant.tenantId, this.agentId);
		this.#sessions.set(created.sessionId, created);
		this.#sessionBindings.set(
			command.intent.logicalKey,
			Object.freeze({
				scopeKey: context.tenant.tenantId,
				logicalKey: command.intent.logicalKey,
				sessionId: created.sessionId,
				agentDefinitionRef: command.intent.agentDefinitionRef,
				contextPolicyRef: command.intent.contextPolicyRef,
			}),
		);
		return this.#recordEnsureReceipt(context, command.commandId, payloadDigest, {
			anchor: created.anchor(),
			created: true,
		});
	}

	/** 在已显式确保的 Session 上创建并执行独立 Run；缺失时失败且不写入。 */
	public async run(
		context: RequestContext,
		command: StartAgentRunCommand,
		signal: AbortSignal = new AbortController().signal,
	): Promise<AgentRunResult> {
		this.#assertTenantScope(context);
		const session = this.#sessions.get(command.sessionId);
		if (!session) {
			throw new KernelError("SESSION_NOT_FOUND", "Run 只能绑定已显式创建的 Session。", false, {
				sessionId: command.sessionId,
			});
		}
		if (this.#runs.get(command.runId)) throw new KernelError("RUN_STATE_INVALID", "Run 标识不可重复。");
		const run = new AgentRun(
			context,
			command,
			this.#executor,
			{ runtimeId: this.runtimeId, agentId: this.agentId },
			this.#runtimeCeiling,
			this.#runtimeCeiling,
		);
		const binding = session.reserveRun({
			runId: run.runId,
			reserveCommandId: `in-memory:reserve:${run.runId}`,
			admissionCommandId: `in-memory:admit:${run.runId}`,
			payloadDigest: digest(command),
		});
		try {
			try {
				this.#runs.register(run);
			} catch (error) {
				session.confirmRunAdmissionRejected(run.runId, binding.bindingVersion);
				throw error;
			}
			session.confirmRunAdmission(run.runId, binding.bindingVersion, `in-memory:admission-receipt:${run.runId}`);
			run.bindSessionContext(session.contextForRun(run.runId, binding.bindingVersion));
			return await run.execute(signal);
		} finally {
			if (session.activeRunBinding?.state === ACTIVE_RUN_BINDING_STATE.ACTIVE) {
				session.beginRunRelease(
					run.runId,
					binding.bindingVersion,
					`in-memory:terminal-receipt:${run.runId}:${run.status}`,
				);
				session.finalizeRunRelease(run.runId, binding.bindingVersion);
			}
		}
	}
	/** 查询独立 Run 的状态对象；不会从 Session 反查执行器。 */
	public getRun(runId: string): AgentRun | undefined {
		return this.#runs.get(runId);
	}

	#assertEnsureCommand(command: EnsureSessionCommand): void {
		if (
			command.commandId.trim().length === 0 ||
			command.intent.logicalKey.trim().length === 0 ||
			command.intent.agentDefinitionRef.trim().length === 0 ||
			command.intent.contextPolicyRef.trim().length === 0 ||
			command.intent.parent !== null
		) {
			throw new KernelError(
				"SESSION_CREATION_INVALID",
				"Root Session ensure 命令缺失必填字段或包含 parent。",
				false,
			);
		}
	}

	#assertMatchingBinding(binding: SessionLookupBinding, command: EnsureSessionCommand): void {
		if (
			binding.agentDefinitionRef !== command.intent.agentDefinitionRef ||
			binding.contextPolicyRef !== command.intent.contextPolicyRef
		) {
			throw new KernelError(
				"SESSION_BINDING_MISMATCH",
				"logicalKey 已绑定不同的 Agent 定义或 Context 策略。",
				false,
			);
		}
	}

	#recordEnsureReceipt(
		context: RequestContext,
		commandId: string,
		payloadDigest: string,
		result: EnsureSessionResult,
	): EnsureSessionResult {
		const frozenResult = Object.freeze({ anchor: result.anchor, created: result.created });
		this.#ensureReceipts.set(
			commandId,
			Object.freeze({
				scopeKey: context.tenant.tenantId,
				commandId,
				payloadDigest,
				result: frozenResult,
			}),
		);
		return frozenResult;
	}

	#assertTenantScope(context: RequestContext): void {
		if (this.#scopeKey && this.#scopeKey !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "AgentSystem 不能跨租户复用。", false);
		}
	}
}
