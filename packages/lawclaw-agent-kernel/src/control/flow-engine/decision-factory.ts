import type {
	AdvanceDecision,
	AdvanceInput,
	AdvanceResult,
	FlowPosition,
	TransitionPlan,
} from "../../contracts/flow-engine.ts";
import { canonicalize, flowDigest, flowId, freezeDecision } from "./canonical.ts";
import { reject } from "./input-guard.ts";
import { isTransitionPlan } from "./input-schema.ts";
import { validatePlan } from "./plan-validation.ts";

/** 封装不可变决策并检查计划内部一致性；不重新决定业务迁移。 */
export class DecisionFactory {
	/** 分配稳定身份、检查预算与等待命令绑定；矛盾计划不产生决策。 */
	public create(input: AdvanceInput, plan: TransitionPlan): AdvanceResult {
		const invalid = (): AdvanceResult => reject("FLOW_INTERNAL_PLAN_INVALID");
		const { run, event, operation } = input;
		try {
			canonicalize(plan);
		} catch (error) {
			if (error instanceof TypeError) return invalid();
			throw error;
		}
		if (!isTransitionPlan(plan)) return invalid();
		if (!validatePlan(input, plan)) return invalid();
		const { position } = plan.next;
		const commands = plan.commands;
		const inputDigest = flowDigest({
			protocolVersion: input.protocolVersion,
			run,
			session: input.session,
			context: input.context,
			contextFailure: input.contextFailure,
			event,
			priorReceipt: input.priorReceipt,
			nowMs: operation.nowMs,
			deadlineAtMs: operation.deadlineAtMs,
		});
		const decisionId = flowId("dec", {
			v: "FE-CON-1",
			runId: run.runId,
			attemptId: run.attemptId,
			expectedVersion: run.version,
			eventId: event.eventId,
			inputDigest,
		});
		const identified = commands.map((payload, ordinal) => {
			const commandId = flowId("cmd", { decisionId, ordinal, payload });
			return {
				commandId,
				idempotencyKey: commandId,
				causationId: event.eventId,
				runId: run.runId,
				originAttemptId: run.attemptId,
				executionEnvelopeRef: run.bindings.executionEnvelopeRef,
				deadlineAtMs: payload.kind === "CancelOutstanding" ? operation.nowMs + 30000 : operation.deadlineAtMs,
				payload,
			};
		});
		if (identified.some((c) => Buffer.byteLength(canonicalize(c)) > 65536)) return invalid();
		let nextPosition: FlowPosition;
		if ("commandOrdinal" in position) {
			const { commandOrdinal, ...rest } = position;
			nextPosition = { ...rest, commandId: identified[commandOrdinal].commandId };
		} else nextPosition = position;
		const content: Omit<AdvanceDecision, "decisionDigest"> = {
			decisionId,
			inputDigest,
			runId: run.runId,
			attemptId: run.attemptId,
			expectedVersion: run.version,
			expectedCancelEpoch: run.cancelEpoch,
			consumedEventId: event.eventId,
			consumedSequence: event.sequence,
			next: { ...plan.next, position: nextPosition },
			commands: identified,
		};
		return freezeDecision(
			structuredClone({ kind: "advance", decision: { ...content, decisionDigest: flowDigest(content) } } as const),
		);
	}
}
