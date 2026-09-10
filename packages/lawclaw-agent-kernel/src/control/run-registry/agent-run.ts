import type { RunSessionContext } from "../../contracts/control/context-engine/runtime-preparation.ts";
import {
	type AgentRunResult,
	KernelError,
	type RequestContext,
	type StartAgentRunCommand,
} from "../../contracts/index.ts";
import type { PermissionCeiling } from "../../contracts/permissions.ts";
import type { ToolExecutionScope } from "../../contracts/tool-scope.ts";
import { AgentLoop, type AgentLoopLifecyclePort, type AgentLoopStatus } from "../agent-loop.ts";
import { computeWorkspaceResourceId, createReadOnlyPermissionCeiling } from "../permission-scope.ts";

/** AgentRun 聚合的生命周期状态。 */
export type AgentRunStatus = "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

/** AgentRun 调用底层 Loop 执行器所需的最小内部契约。 */
export interface AgentRunExecutor {
	/** 执行一次有界 Run；通过生命周期端口报告进度，传播取消，返回规范结果，不拥有注册目录。 */
	run(
		context: RequestContext,
		command: StartAgentRunCommand,
		externalSignal: AbortSignal,
		lifecycle: AgentLoopLifecyclePort,
		executionScope: ToolExecutionScope,
		sessionContext?: RunSessionContext,
	): Promise<AgentRunResult>;
}

/** 独立技术 Run；拥有本次执行的状态与 Loop，Session 仅通过标识关联。 */
export class AgentRun implements AgentLoopLifecyclePort {
	/** 独立技术 Run 的稳定标识；必须与本次执行关联一致。 */
	readonly runId: string;
	/** 关联技术会话的稳定标识；不代表 Run 状态所有权。 */
	readonly sessionId: string;
	readonly #context: RequestContext;
	readonly #command: StartAgentRunCommand;
	readonly #executor: AgentRunExecutor;
	readonly #executionScope: ToolExecutionScope;
	readonly #loops: AgentLoop[] = [];
	#status: AgentRunStatus = "CREATED";
	#result: AgentRunResult | undefined;
	#sessionContext: RunSessionContext | undefined;
	/** 宿主在 Session 受理确认后注入冻结历史，执行期间不允许替换。 */
	public bindSessionContext(context: RunSessionContext): void {
		if (this.#status !== "CREATED" || this.#sessionContext)
			throw new KernelError("RUN_STATE_INVALID", "Session 历史不能重复绑定。");
		this.#sessionContext = context;
	}

	/** 创建尚未执行、绑定单一 Session 的 Run。 */
	public constructor(
		context: RequestContext,
		command: StartAgentRunCommand,
		executor: AgentRunExecutor,
		identity: { readonly runtimeId: string; readonly agentId: string },
		runtimeCeiling: PermissionCeiling,
		sessionCeiling: PermissionCeiling,
	) {
		this.runId = command.runId;
		this.sessionId = command.sessionId;
		this.#context = context;
		this.#command = command;
		this.#executor = executor;
		const runCeiling = createReadOnlyPermissionCeiling(
			command.toolPolicy,
			computeWorkspaceResourceId(command.workspaceRoot),
			runtimeCeiling.budget.maxResultBytes,
		);
		this.#executionScope = Object.freeze({
			runtimeId: identity.runtimeId,
			agentId: identity.agentId,
			sessionId: command.sessionId,
			runId: command.runId,
			policySnapshotId: context.tenant.authorizationSnapshot,
			runtimeCeiling,
			sessionCeiling,
			runCeiling,
			resourceClaims: runCeiling.resources,
			requestedEgress: Object.freeze([]),
			requestedSecrets: Object.freeze([]),
		});
	}

	/** 当前 Run 状态。 */
	public get status(): AgentRunStatus {
		return this.#status;
	}

	/** 按执行顺序返回该 Run 已创建的 Loop 快照。 */
	public get loops(): readonly AgentLoop[] {
		return Object.freeze([...this.#loops]);
	}

	/** Run 完成后返回执行结果；执行前为空。 */
	public get result(): AgentRunResult | undefined {
		return this.#result;
	}

	/** 启动一次且仅一次 AgentRun。 */
	public async execute(signal: AbortSignal = new AbortController().signal): Promise<AgentRunResult> {
		if (this.#status !== "CREATED") {
			throw new KernelError("RUN_STATE_INVALID", "AgentRun 不能被重复启动。", false, { runId: this.runId });
		}
		this.#status = "RUNNING";
		try {
			const result = await this.#executor.run(
				this.#context,
				this.#command,
				signal,
				this,
				this.#executionScope,
				this.#sessionContext,
			);
			this.#result = result;
			this.#status =
				result.status === "completed" ? "COMPLETED" : result.status === "cancelled" ? "CANCELLED" : "FAILED";
			return result;
		} catch (error) {
			this.#status = signal.aborted ? "CANCELLED" : "FAILED";
			throw error;
		}
	}

	/** 由 Loop 执行器按严格递增序号创建子实体。 */
	public loopStarted(ordinal: number, startedAt: string): void {
		if (this.#status !== "RUNNING" || ordinal !== this.#loops.length + 1) {
			throw new KernelError("RUN_STATE_INVALID", "AgentRun 收到乱序或越界的 Loop 开始通知。", false);
		}
		this.#loops.push(new AgentLoop(ordinal, startedAt));
	}

	/** 由 Loop 执行器关闭当前子实体。 */
	public loopFinished(ordinal: number, status: Exclude<AgentLoopStatus, "RUNNING">, finishedAt: string): void {
		const loop = this.#loops[ordinal - 1];
		if (!loop || ordinal !== this.#loops.length) {
			throw new KernelError("RUN_STATE_INVALID", "AgentRun 收到未知 Loop 的终态通知。", false);
		}
		loop.finish(status, finishedAt);
	}
}
