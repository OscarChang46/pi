import type { ActionProposal, AdvanceInput, AdvanceResult, FlowErrorCode } from "../../contracts/flow-engine.ts";
import { canonicalize, flowDigest, flowId } from "../../contracts/flow-value.ts";
import { FLOW_EFFECT, isTerminalReActState } from "../../contracts/react-flow-values.ts";
import { isAdvanceInput } from "./input-schema.ts";

type ShortCircuit = Exclude<AdvanceResult, { readonly kind: "advance" }>;

/** 校验后的输入或短路结果；拒绝内容不携带原始字段值。 */
export type InputCheck =
	| {
			/** 已通过验证的分支。 */
			readonly kind: "accepted";
			/** 完整规范化输入。 */
			readonly input: AdvanceInput;
	  }
	| {
			/** 不再运行迁移的分支。 */
			readonly kind: "short_circuit";
			/** 稳定拒绝或幂等忽略。 */
			readonly result: ShortCircuit;
	  };

/** 构建稳定的拒绝结果；字段路径只能由静态协议代码提供。 */
export function reject(code: FlowErrorCode, field: string | null = null): Extract<AdvanceResult, { kind: "reject" }> {
	return { kind: "reject", error: { code, field } };
}

function validProposals(proposals: readonly ActionProposal[]): boolean {
	return (
		proposals.length <= 8 &&
		new Set(proposals.map((p) => p.proposalId)).size === proposals.length &&
		proposals.every(
			(p) =>
				p.actionDigest ===
				flowDigest({
					proposalId: p.proposalId,
					toolDescriptorRef: p.toolDescriptorRef,
					toolDescriptorDigest: p.toolDescriptorDigest,
					argumentsRef: p.argumentsRef,
				}),
		)
	);
}

/** 无状态输入校验；身份认证与 Artifact 访问授权仍由可信边界负责。 */
export class InputGuard {
	/** 拒绝未知结构、作用域、重复冲突与旧 Attempt，合法重复和终态提前返回。 */
	public check(value: unknown): InputCheck {
		const denied = (code: FlowErrorCode, field: string | null = null): InputCheck => ({
			kind: "short_circuit",
			result: reject(code, field),
		});
		try {
			canonicalize(value);
		} catch (error) {
			if (error instanceof TypeError) return denied("FLOW_INPUT_INVALID");
			throw error;
		}
		if (!isAdvanceInput(value)) return denied("FLOW_INPUT_INVALID");
		const { run, session, event, operation, priorReceipt, context, contextFailure } = value;
		const { payload } = event;
		const sources: Record<typeof event.source, readonly string[]> = {
			scheduler: ["AdvanceRequested", "CancelRequested", "DeadlineReached"],
			model: ["ModelCompleted", "ModelFailed"],
			security: ["PermissionResolved", "ApprovalResolved"],
			tool: ["ToolObserved"],
			child: ["ChildCompleted"],
			recovery: ["EffectReconciled", "ModelCompleted", "ModelFailed", "ToolObserved", "ChildCompleted"],
		};
		if (!sources[event.source].includes(payload.kind)) return denied("FLOW_SCOPE_MISMATCH", "event.source");
		if (
			event.runId !== run.runId ||
			session.sessionId !== run.bindings.sessionId ||
			session.version !== run.bindings.sessionVersion
		)
			return denied("FLOW_SCOPE_MISMATCH", "run.bindings");
		if (event.attemptId !== run.attemptId) return denied("FLOW_STALE_ATTEMPT", "event.attemptId");
		if (operation.deadlineAtMs > run.deadlineAtMs || (context !== null && contextFailure !== null))
			return denied("FLOW_INPUT_INVALID", "operation.deadlineAtMs");
		if (Buffer.byteLength(canonicalize(event)) > 65536) return denied("FLOW_INPUT_INVALID", "event");
		if (flowDigest({ source: event.source, causationId: event.causationId, payload }) !== event.payloadDigest)
			return denied("FLOW_EVENT_CONFLICT", "event.payloadDigest");
		if (
			!validProposals(run.pendingActions) ||
			(payload.kind === "ModelCompleted" &&
				payload.output.kind === "tools" &&
				(payload.output.proposals.length === 0 || !validProposals(payload.output.proposals)))
		)
			return denied("FLOW_INPUT_INVALID", "run.pendingActions");
		const b = run.budget;
		if (
			b.maxTurns < 1 ||
			b.maxTurns > 64 ||
			b.maxToolCalls > 128 ||
			b.maxChildren > 8 ||
			b.maxDepth > 2 ||
			b.maxContextBytes < 1 ||
			b.maxContextBytes > 4194304 ||
			b.maxInputTokens < 1 ||
			b.maxInputTokens > 131072 ||
			b.outputReserveTokens > 32768 ||
			b.maxOutputBytes < 1 ||
			b.maxOutputBytes > 1048576 ||
			run.depth > b.maxDepth ||
			run.usage.turnsReserved > b.maxTurns ||
			run.usage.toolsReserved > b.maxToolCalls ||
			run.usage.childrenReserved > b.maxChildren
		)
			return denied("FLOW_INPUT_INVALID", "run.budget");
		if (
			payload.kind === "ToolObserved" &&
			((payload.outcome === "success" &&
				(payload.resultRef === null ||
					!([FLOW_EFFECT.NONE, FLOW_EFFECT.KNOWN_APPLIED] as const).some((e) => e === payload.effect))) ||
				(payload.outcome === "failed" && payload.resultRef !== null))
		)
			return denied("FLOW_EVENT_CONFLICT", "event.payload.resultRef");
		if (payload.kind === "ChildCompleted" && (payload.outcome === "completed") !== (payload.resultRef !== null))
			return denied("FLOW_EVENT_CONFLICT", "event.payload.resultRef");
		if (
			payload.kind === "EffectReconciled" &&
			(payload.result === "tool_completed" || payload.result === "model_completed") !== (payload.resultRef !== null)
		)
			return denied("FLOW_EVENT_CONFLICT", "event.payload.resultRef");
		if (priorReceipt !== null) {
			if (
				priorReceipt.eventId !== event.eventId ||
				priorReceipt.sequence !== event.sequence ||
				priorReceipt.payloadDigest !== event.payloadDigest
			)
				return denied("FLOW_EVENT_CONFLICT", "event.payloadDigest");
			if (priorReceipt.sequence > run.consumedSequence)
				return denied("FLOW_EVENT_CONFLICT", "priorReceipt.sequence");
			return {
				kind: "short_circuit",
				result: { kind: "ignore", reason: "duplicate", existingCommitId: priorReceipt.commitId },
			};
		}
		if (event.sequence <= run.consumedSequence) return denied("FLOW_EVENT_CONFLICT", "event.sequence");
		if (isTerminalReActState(run.position.kind))
			return { kind: "short_circuit", result: { kind: "ignore", reason: "terminal", existingCommitId: null } };
		if (event.sequence !== run.consumedSequence + 1) return denied("FLOW_SEQUENCE_GAP", "event.sequence");
		if (
			run.version === Number.MAX_SAFE_INTEGER ||
			run.consumedSequence === Number.MAX_SAFE_INTEGER ||
			operation.nowMs > Number.MAX_SAFE_INTEGER - 30000
		)
			return denied("FLOW_INPUT_INVALID", "run.version");
		if (
			payload.kind === "AdvanceRequested" &&
			(payload.basisVersion !== run.version ||
				event.eventId !== flowId("wake", { runId: run.runId, version: run.version, kind: "advance" }))
		)
			return denied("FLOW_EVENT_CONFLICT", "event.eventId");
		return { kind: "accepted", input: value };
	}
}
