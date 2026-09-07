import type { ActionProposal, ModelOutput, RuntimePayload, TranscriptEntry } from "../../contracts/flow-engine.ts";
import { canonicalize, flowId } from "./canonical.ts";
import { reject } from "./input-guard.ts";
import { transitionContext } from "./transition-context.ts";
import type { Resolution, TransitionInput } from "./transition-definition.ts";
import { defineTransition } from "./transition-definition.ts";
import { createVariantMatcher } from "./variant-matcher.ts";

type ModelInput = TransitionInput<"AwaitingModel", "ModelCompleted">;
type ModelContext = { input: ModelInput; append: readonly TranscriptEntry[] };
const resolveModelOutput = createVariantMatcher<ModelOutput, ModelContext, Resolution>({
	answer: (output, { input, append }) => {
		const { plan, failed } = transitionContext(input);
		const budget = input.run.budget;
		return output.outputRef.bytes > budget.maxOutputBytes
			? failed("FLOW_CONTEXT_LIMIT_EXCEEDED", append)
			: plan({ kind: "Completed", outputRef: output.outputRef }, [], append, []);
	},
	tools: (output, { input, append }) => {
		const { plan, failed } = transitionContext(input);
		const { budget, usage } = input.run;

		if (output.proposals.some((p) => p.argumentsRef.bytes > budget.maxOutputBytes))
			return failed("FLOW_CONTEXT_LIMIT_EXCEEDED", append);
		if (budget.maxToolCalls - usage.toolsReserved < output.proposals.length)
			return failed("FLOW_BUDGET_EXCEEDED", append);
		const proposal = output.proposals[0];
		if (!proposal) return reject("FLOW_INPUT_INVALID", "event.payload.output.proposals");
		return plan(
			{ kind: "AwaitingPermission", proposalId: proposal.proposalId, commandOrdinal: 0 },
			[{ kind: "RequestPermission", proposal }],
			append,
			output.proposals,
		);
	},
	child: (output, { input, append }) => {
		const { plan, failed } = transitionContext(input);
		const { run, event, operation } = input;
		const { budget, usage } = run;
		const child = output.spec;
		if (
			child.budget.maxTurns < 1 ||
			child.budget.maxInputTokens < 1 ||
			child.budget.maxContextBytes < 1 ||
			child.budget.maxOutputBytes < 1 ||
			usage.childrenReserved >= budget.maxChildren ||
			run.depth + 1 > budget.maxDepth ||
			run.depth + 1 > child.budget.maxDepth ||
			child.deadlineAtMs > operation.deadlineAtMs ||
			child.deadlineAtMs <= operation.nowMs ||
			Object.entries(child.budget).some(([key, value]) => value > budget[key as keyof typeof budget]) ||
			child.budget.maxTurns > budget.maxTurns - usage.turnsReserved ||
			child.budget.maxToolCalls > budget.maxToolCalls - usage.toolsReserved ||
			child.budget.maxChildren > budget.maxChildren - usage.childrenReserved - 1
		)
			return failed("FLOW_BUDGET_EXCEEDED", append);
		if (child.goalRef.bytes > budget.maxContextBytes) return failed("FLOW_CONTEXT_LIMIT_EXCEEDED", append);
		const childId = flowId("child", { runId: run.runId, eventId: event.eventId, kind: "child" });
		return plan(
			{ kind: "AwaitingChild", childId, commandOrdinal: 0 },
			[{ kind: "CreateChildRun", childId, spec: child }],
			append,
			[],
			{ ...usage, childrenReserved: usage.childrenReserved + 1 },
		);
	},
});

type PermissionResult = Extract<RuntimePayload, { kind: "PermissionResolved" }>["result"];
type PermissionContext = { input: TransitionInput<"AwaitingPermission", "PermissionResolved">; first: ActionProposal };
const resolvePermissionResult = createVariantMatcher<PermissionResult, PermissionContext, Resolution>({
	ask: (result, { input, first }) =>
		transitionContext(input).plan({
			kind: "Suspended",
			reason: { kind: "approval", approvalRef: result.approvalRef, proposalId: first.proposalId },
		}),
	deny: (_result, { input }) => transitionContext(input).failed("FLOW_PERMISSION_DENIED"),
	unavailable: (_result, { input }) => transitionContext(input).failed("FLOW_PERMISSION_UNAVAILABLE"),
	allow: (result, { input, first }) => {
		const { run, operation } = input;
		const { budget, usage, pendingActions } = run;
		const { plan, failed } = transitionContext(input);
		if (result.expiresAtMs <= operation.nowMs) return failed("FLOW_PERMIT_INVALID");
		if (usage.toolsReserved >= budget.maxToolCalls) return failed("FLOW_BUDGET_EXCEEDED");
		return plan(
			{ kind: "AwaitingTool", proposalId: first.proposalId, commandOrdinal: 0 },
			[{ kind: "DispatchTool", proposal: first, permitRef: result.permitRef }],
			[],
			pendingActions,
			{ ...usage, toolsReserved: usage.toolsReserved + 1 },
		);
	},
});

type ReconciliationInput = TransitionInput<"Suspended.tool_unknown" | "Suspended.model_unknown", "EffectReconciled">;
function validateReconciliation(
	input: ReconciliationInput,
	target: string,
	expected: "model_completed" | "tool_completed",
): Resolution | null {
	const { event, run } = input;
	const payload = event.payload;
	const { failed, conflict } = transitionContext(input);
	if (
		payload.commandId !== target ||
		event.causationId !== target ||
		payload.incidentRef !== run.position.reason.incidentRef ||
		(payload.result !== expected && payload.result !== "not_applied" && payload.result !== "failed")
	)
		return conflict();
	if (payload.result === "not_applied" || payload.result === "failed" || payload.resultRef === null)
		return failed("FLOW_RECONCILIATION_FAILED");
	if (payload.resultRef.bytes > run.budget.maxOutputBytes) return failed("FLOW_CONTEXT_LIMIT_EXCEEDED");
	return null;
}

/** FE-CON-1显式迁移表；终态无出边，未登记组合默认拒绝。 */
export const FLOW_TRANSITIONS = Object.freeze([
	defineTransition("Ready", "AdvanceRequested", ["AwaitingPermission", "AwaitingModel", "Failed"], (input) => {
		const { run, context, contextFailure } = input;
		const { budget, usage, pendingActions } = run;

		const first = pendingActions[0];
		const { plan, failed } = transitionContext(input);

		if (first)
			return plan({ kind: "AwaitingPermission", proposalId: first.proposalId, commandOrdinal: 0 }, [
				{ kind: "RequestPermission", proposal: first },
			]);
		if (contextFailure !== null)
			return failed(contextFailure === "unavailable" ? "FLOW_CONTEXT_UNAVAILABLE" : "FLOW_CONTEXT_LIMIT_EXCEEDED");
		if (
			context === null ||
			canonicalize(context.bindings) !== canonicalize(run.bindings) ||
			context.sourceRunVersion !== run.version ||
			context.transcriptHeadRef !== run.transcriptHeadRef
		)
			return reject("FLOW_CONTEXT_REQUIRED", "context");
		if (context.promptRef.bytes > budget.maxContextBytes || context.inputTokens > budget.maxInputTokens)
			return failed("FLOW_CONTEXT_LIMIT_EXCEEDED");
		if (usage.turnsReserved >= budget.maxTurns) return failed("FLOW_BUDGET_EXCEEDED");
		return plan(
			{ kind: "AwaitingModel", commandOrdinal: 0 },
			[{ kind: "InvokeModel", promptRef: context.promptRef }],
			[],
			[],
			{ ...usage, turnsReserved: usage.turnsReserved + 1 },
		);
	}),
	defineTransition(
		"AwaitingModel",
		"ModelCompleted",
		["Completed", "AwaitingPermission", "AwaitingChild", "Failed"],
		(input) => {
			const { run, event } = input;
			const { position, budget } = run;
			const payload = event.payload;

			const { failed, entry, conflict } = transitionContext(input);

			if (payload.modelCommandId !== position.commandId || event.causationId !== position.commandId)
				return conflict();
			const append = [entry("assistant", payload.assistantTurnRef)];
			if (payload.assistantTurnRef.bytes > budget.maxOutputBytes) return failed("FLOW_CONTEXT_LIMIT_EXCEEDED");
			return resolveModelOutput(payload.output, { input, append });
		},
	),
	defineTransition("AwaitingModel", "ModelFailed", ["Suspended.model_unknown", "Failed"], (input) => {
		const { run, event } = input;
		const { position } = run;
		const payload = event.payload;

		const { plan, failed, conflict } = transitionContext(input);

		if (payload.modelCommandId !== position.commandId || event.causationId !== position.commandId) return conflict();
		if (payload.effect === "UNKNOWN" || payload.effect === "KNOWN_APPLIED") {
			const incidentRef = flowId("inc", {
				runId: run.runId,
				targetCommandId: position.commandId,
				kind: "unknown",
			});
			return plan(
				{
					kind: "Suspended",
					reason: { kind: "model_unknown", modelCommandId: position.commandId, incidentRef },
				},
				[{ kind: "RequestReconciliation", targetCommandId: position.commandId, incidentRef }],
			);
		}
		return failed("FLOW_MODEL_FAILED");
	}),
	defineTransition(
		"AwaitingPermission",
		"PermissionResolved",
		["Suspended.approval", "AwaitingTool", "Failed"],
		(input) => {
			const { run, event } = input;
			const { position, pendingActions } = run;
			const payload = event.payload;
			const first = pendingActions[0];
			const { conflict } = transitionContext(input);

			if (!first) return reject("FLOW_INPUT_INVALID", "run.pendingActions");

			if (payload.proposalId !== position.proposalId || event.causationId !== position.commandId) return conflict();
			return resolvePermissionResult(payload.result, { input, first });
		},
	),
	defineTransition("AwaitingTool", "ToolObserved", ["Suspended.tool_unknown", "Ready", "Failed"], (input) => {
		const { run, event } = input;
		const { position, budget, pendingActions } = run;
		const payload = event.payload;

		const { plan, failed, entry, conflict } = transitionContext(input);

		if (
			payload.toolCommandId !== position.commandId ||
			payload.proposalId !== position.proposalId ||
			event.causationId !== position.commandId
		)
			return conflict();
		if (payload.effect === "UNKNOWN") {
			const incidentRef = flowId("inc", {
				runId: run.runId,
				targetCommandId: position.commandId,
				kind: "unknown",
			});
			return plan(
				{ kind: "Suspended", reason: { kind: "tool_unknown", toolCommandId: position.commandId, incidentRef } },
				[{ kind: "RequestReconciliation", targetCommandId: position.commandId, incidentRef }],
			);
		}
		if (payload.outcome === "failed" || payload.resultRef === null) return failed("FLOW_TOOL_FAILED");
		if (payload.resultRef.bytes > budget.maxOutputBytes) return failed("FLOW_CONTEXT_LIMIT_EXCEEDED");
		return plan(
			{ kind: "Ready" },
			[],
			[entry("tool", payload.resultRef, position.proposalId)],
			pendingActions.slice(1),
		);
	}),
	defineTransition("AwaitingChild", "ChildCompleted", ["Ready", "Failed"], (input) => {
		const { run, event } = input;
		const { position, budget } = run;
		const payload = event.payload;

		const { plan, failed, entry, conflict } = transitionContext(input);

		if (payload.childId !== position.childId || event.causationId !== position.commandId) return conflict();
		if (payload.outcome !== "completed" || payload.resultRef === null) return failed("FLOW_CHILD_FAILED");
		if (payload.resultRef.bytes > budget.maxOutputBytes) return failed("FLOW_CONTEXT_LIMIT_EXCEEDED");
		return plan({ kind: "Ready" }, [], [entry("child", payload.resultRef, null, position.childId)]);
	}),
	defineTransition("Suspended.approval", "ApprovalResolved", ["AwaitingPermission", "Failed"], (input) => {
		const { run, event } = input;
		const { position, pendingActions } = run;
		const payload = event.payload;
		const first = pendingActions[0];
		const { plan, failed, conflict } = transitionContext(input);

		const reason = position.reason;

		if (
			payload.approvalRef !== reason.approvalRef ||
			payload.proposalId !== reason.proposalId ||
			first?.proposalId !== reason.proposalId ||
			event.causationId !== reason.approvalRef
		)
			return conflict();
		return payload.approved
			? plan({ kind: "AwaitingPermission", proposalId: first.proposalId, commandOrdinal: 0 }, [
					{ kind: "RequestPermission", proposal: first },
				])
			: failed("FLOW_PERMISSION_DENIED");
	}),
	defineTransition("Suspended.tool_unknown", "EffectReconciled", ["Ready", "Failed"], (input) => {
		const invalid = validateReconciliation(input, input.run.position.reason.toolCommandId, "tool_completed");
		if (invalid) return invalid;
		const first = input.run.pendingActions[0];
		if (!first) return reject("FLOW_INPUT_INVALID", "run.pendingActions");
		const { plan, entry } = transitionContext(input);
		return plan(
			{ kind: "Ready" },
			[],
			[entry("tool", input.event.payload.resultRef!, first.proposalId)],
			input.run.pendingActions.slice(1),
		);
	}),
	defineTransition("Suspended.model_unknown", "EffectReconciled", ["Completed", "Failed"], (input) => {
		const invalid = validateReconciliation(input, input.run.position.reason.modelCommandId, "model_completed");
		if (invalid) return invalid;
		const { plan, entry } = transitionContext(input);
		const result = input.event.payload.resultRef!;
		return plan({ kind: "Completed", outputRef: result }, [], [entry("assistant", result)], []);
	}),
]);
