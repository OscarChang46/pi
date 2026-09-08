import type { FlowArtifactStore } from "../contracts/flow-artifacts.ts";
import type { FlowCommandHandler, FlowCommandHandlers, FlowCommandOutcome } from "../contracts/flow-dispatch.ts";
import type { AdvanceInput, CommandRecord, EngineCommand, ExecutionClaim } from "../contracts/flow-engine.ts";
import type { DurableFlowStore } from "../contracts/flow-storage.ts";
import type { TimePort } from "../contracts/index.ts";
import { FLOW_COMMAND_STATUS, FLOW_EFFECT } from "../contracts/react-flow-values.ts";
import { createVariantMatcher } from "./variant-matcher.ts";

/** 派发依赖：耐久命令目录与执行策略，无HTTP或Core推进职责。 */
export interface FlowDispatchDependencies {
	/** 读取系统Completed以修复业务结果提交前崩溃，undefined表示尚无完成记录。 */
	readonly replay?: (input: AdvanceInput, command: EngineCommand) => FlowCommandOutcome | null | undefined;
	/** 命令及Run权威存储。 */
	readonly store: DurableFlowStore;
	/** 命令结果的不可变存储。 */
	readonly artifacts: FlowArtifactStore;
	/** 截止时间来源。 */
	readonly time: TimePort;
	/** 首次派发策略表。 */
	readonly handlers: FlowCommandHandlers;
	/** 仅注册能够从耐久事实恢复的策略，禁止重放未知Provider请求。 */
	readonly recoveryHandlers?: Partial<FlowCommandHandlers>;
	/** 生产宿主注入系统Activity拦截；独立业务策略测试可不装配宿主。 */
	readonly activity?: (
		input: AdvanceInput,
		command: EngineCommand,
		execute: () => Promise<FlowCommandOutcome | null>,
	) => Promise<FlowCommandOutcome | null>;
}

/** 活动租约句柄；续期更新此句柄，异步结果写入使用最新有效期。 */
export interface FlowExecutionLease {
	/** 相同Owner、Attempt、fence的当前租约。 */
	claim: ExecutionClaim;
}

const unknownOutcome = createVariantMatcher<EngineCommand["payload"], string, FlowCommandOutcome>({
	InvokeModel: (_payload, commandId) => ({
		source: "recovery",
		payload: { kind: "ModelFailed", modelCommandId: commandId, effect: FLOW_EFFECT.UNKNOWN },
	}),
	RequestPermission: (payload) => ({
		source: "security",
		payload: { kind: "PermissionResolved", proposalId: payload.proposal.proposalId, result: { kind: "unavailable" } },
	}),
	DispatchTool: (payload, commandId) => ({
		source: "recovery",
		payload: {
			kind: "ToolObserved",
			toolCommandId: commandId,
			proposalId: payload.proposal.proposalId,
			effect: FLOW_EFFECT.UNKNOWN,
			outcome: "failed",
			resultRef: null,
		},
	}),
	CreateChildRun: (payload) => ({
		source: "child",
		payload: { kind: "ChildCompleted", childId: payload.childId, outcome: "failed", resultRef: null },
	}),
	CancelOutstanding: () => {
		throw new Error("FLOW_CLEANUP_INCOMPLETE");
	},
	RequestReconciliation: () => {
		throw new Error("FLOW_RECONCILIATION_INCOMPLETE");
	},
});

/** 负责命令受理、派发、结果保存和恢复；不直接修改Run位置。 */
export class FlowCommandDispatcher {
	readonly #deps: FlowDispatchDependencies;
	/** 注入策略及耐久端口。 */
	constructor(deps: FlowDispatchDependencies) {
		this.#deps = deps;
	}
	/** 优先返回已有结果；首次执行和恢复分别走独立策略。null表示子Run尚未终止或维护命令无业务事实。 */
	async resolve(
		input: AdvanceInput,
		record: CommandRecord,
		lease: FlowExecutionLease,
		signal: AbortSignal,
	): Promise<FlowCommandOutcome | null> {
		const replay = this.#deps.replay?.(input, record.command);
		if (replay !== undefined && record.resultRef === null) {
			this.#save(input, record, replay, FLOW_COMMAND_STATUS.SUCCEEDED, lease);
			return replay;
		}
		if (record.resultRef) {
			const outcome = this.#deps.artifacts.get(record.resultRef) as FlowCommandOutcome | null;
			if (outcome || record.command.payload.kind !== "CreateChildRun") return outcome;
			const recover = this.#deps.recoveryHandlers?.CreateChildRun;
			return recover ? recover(input, { ...record.command, payload: record.command.payload }, signal) : null;
		}
		if (record.status === FLOW_COMMAND_STATUS.PENDING) return this.#execute(input, record, lease, signal);
		return this.#recover(input, record, lease, signal);
	}
	async #recover(
		input: AdvanceInput,
		record: CommandRecord,
		lease: FlowExecutionLease,
		signal: AbortSignal,
	): Promise<FlowCommandOutcome | null> {
		const command = record.command;
		// Handler的索引来自同一命令判别字段，仅弥合TypeScript相关联合索引限制。
		const recovery = this.#deps.recoveryHandlers?.[command.payload.kind] as
			| FlowCommandHandler<EngineCommand["payload"]["kind"]>
			| undefined;
		const outcome = recovery
			? await recovery(input, command, signal)
			: unknownOutcome(command.payload, command.commandId);
		if (!outcome && command.payload.kind === "CreateChildRun") return null;
		this.#save(input, record, outcome, recovery ? FLOW_COMMAND_STATUS.SUCCEEDED : FLOW_COMMAND_STATUS.UNKNOWN, lease);
		return outcome;
	}
	async #execute(
		input: AdvanceInput,
		record: CommandRecord,
		lease: FlowExecutionLease,
		signal: AbortSignal,
	): Promise<FlowCommandOutcome | null> {
		const command = record.command;
		const claimed = this.#deps.store.claimCommand(input.run.runId, command.commandId, lease.claim);
		if (!claimed) throw new Error("FLOW_COMMAND_NOT_CLAIMED");
		const accepted: CommandRecord = { ...record, status: FLOW_COMMAND_STATUS.ACCEPTED, dispatchClaim: lease.claim };
		this.#deps.store.recordCommand(input.run.runId, accepted, lease.claim);
		const remaining = Math.max(1, command.deadlineAtMs - this.#deps.time.now().epochMilliseconds);
		const execution = new AbortController();
		let outcome: FlowCommandOutcome | null;
		let status: CommandRecord["status"] = FLOW_COMMAND_STATUS.SUCCEEDED;
		try {
			// Handler索引与命令判别字段相同，不接受调用者指定策略键。
			const handler = this.#deps.handlers[command.payload.kind] as FlowCommandHandler<
				EngineCommand["payload"]["kind"]
			>;
			const execute = () =>
				handler(input, command, AbortSignal.any([signal, execution.signal, AbortSignal.timeout(remaining)]));
			outcome = this.#deps.activity ? await this.#deps.activity(input, command, execute) : await execute();
		} catch {
			status = FLOW_COMMAND_STATUS.FAILED;
			outcome = unknownOutcome(command.payload, command.commandId);
		} finally {
			execution.abort();
		}
		this.#save(input, accepted, outcome, status, lease);
		return outcome;
	}
	#save(
		input: AdvanceInput,
		record: CommandRecord,
		outcome: FlowCommandOutcome | null,
		status: CommandRecord["status"],
		lease: FlowExecutionLease,
	): void {
		let effect = outcome && "effect" in outcome.payload ? outcome.payload.effect : FLOW_EFFECT.NONE;
		if (status === FLOW_COMMAND_STATUS.UNKNOWN) effect = FLOW_EFFECT.UNKNOWN;
		if (effect === FLOW_EFFECT.UNKNOWN) status = FLOW_COMMAND_STATUS.UNKNOWN;
		const command = record.command;
		this.#deps.store.recordCommand(
			input.run.runId,
			{
				...record,
				status,
				effect,
				resultRef: this.#deps.artifacts.put(outcome),
				providerReceiptRef:
					command.payload.kind === "CreateChildRun" ? command.payload.childId : record.providerReceiptRef,
			},
			lease.claim,
		);
	}
}
