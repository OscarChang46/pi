import type { AdvanceInput, TransitionPlan } from "../../contracts/flow-engine.ts";
import { FLOW_EFFECT, FLOW_WAIT_REASON, REACT_FLOW_STATE } from "../../contracts/react-flow-values.ts";

// FE-CON-1 封闭字段结构；语义绑定和预算由 InputGuard / Resolver 检查。
function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function checkRef(value: unknown): boolean {
	return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function checkCounter(value: unknown): boolean {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

function checkFrozenBindings(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 6 &&
		Object.hasOwn(value, "sessionId") &&
		checkRef(value.sessionId) &&
		Object.hasOwn(value, "sessionVersion") &&
		checkCounter(value.sessionVersion) &&
		Object.hasOwn(value, "executionEnvelopeRef") &&
		checkRef(value.executionEnvelopeRef) &&
		Object.hasOwn(value, "routeSnapshotRef") &&
		checkRef(value.routeSnapshotRef) &&
		Object.hasOwn(value, "policySnapshotRef") &&
		checkRef(value.policySnapshotRef) &&
		Object.hasOwn(value, "configVersion") &&
		checkRef(value.configVersion)
	);
}

function checkWaitReason(value: unknown): boolean {
	return (
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === FLOW_WAIT_REASON.APPROVAL &&
			Object.hasOwn(value, "approvalRef") &&
			checkRef(value.approvalRef) &&
			Object.hasOwn(value, "proposalId") &&
			checkRef(value.proposalId)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === FLOW_WAIT_REASON.TOOL_UNKNOWN &&
			Object.hasOwn(value, "toolCommandId") &&
			checkRef(value.toolCommandId) &&
			Object.hasOwn(value, "incidentRef") &&
			checkRef(value.incidentRef)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === FLOW_WAIT_REASON.MODEL_UNKNOWN &&
			Object.hasOwn(value, "modelCommandId") &&
			checkRef(value.modelCommandId) &&
			Object.hasOwn(value, "incidentRef") &&
			checkRef(value.incidentRef))
	);
}

function checkDigest(value: unknown): boolean {
	return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function checkArtifactRef(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 3 &&
		Object.hasOwn(value, "id") &&
		checkRef(value.id) &&
		Object.hasOwn(value, "digest") &&
		checkDigest(value.digest) &&
		Object.hasOwn(value, "bytes") &&
		checkCounter(value.bytes)
	);
}

function checkFlowErrorCode(value: unknown): boolean {
	return (
		value === "FLOW_INPUT_INVALID" ||
		value === "FLOW_SCOPE_MISMATCH" ||
		value === "FLOW_EVENT_CONFLICT" ||
		value === "FLOW_SEQUENCE_GAP" ||
		value === "FLOW_STALE_ATTEMPT" ||
		value === "FLOW_INVALID_TRANSITION" ||
		value === "FLOW_CONTEXT_REQUIRED" ||
		value === "FLOW_CONTEXT_LIMIT_EXCEEDED" ||
		value === "FLOW_BUDGET_EXCEEDED" ||
		value === "FLOW_CONTEXT_UNAVAILABLE" ||
		value === "FLOW_MODEL_FAILED" ||
		value === "FLOW_PERMISSION_DENIED" ||
		value === "FLOW_PERMISSION_UNAVAILABLE" ||
		value === "FLOW_PERMIT_INVALID" ||
		value === "FLOW_TOOL_FAILED" ||
		value === "FLOW_CHILD_FAILED" ||
		value === "FLOW_RECONCILIATION_FAILED" ||
		value === "FLOW_INTERNAL_PLAN_INVALID"
	);
}

function checkFlowPosition(value: unknown): boolean {
	return (
		(record(value) &&
			Object.keys(value).length === 1 &&
			Object.hasOwn(value, "kind") &&
			value.kind === REACT_FLOW_STATE.READY) ||
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === REACT_FLOW_STATE.AWAITING_MODEL &&
			Object.hasOwn(value, "commandId") &&
			checkRef(value.commandId)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === REACT_FLOW_STATE.AWAITING_PERMISSION &&
			Object.hasOwn(value, "proposalId") &&
			checkRef(value.proposalId) &&
			Object.hasOwn(value, "commandId") &&
			checkRef(value.commandId)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === REACT_FLOW_STATE.AWAITING_TOOL &&
			Object.hasOwn(value, "proposalId") &&
			checkRef(value.proposalId) &&
			Object.hasOwn(value, "commandId") &&
			checkRef(value.commandId)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === REACT_FLOW_STATE.AWAITING_CHILD &&
			Object.hasOwn(value, "childId") &&
			checkRef(value.childId) &&
			Object.hasOwn(value, "commandId") &&
			checkRef(value.commandId)) ||
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === REACT_FLOW_STATE.SUSPENDED &&
			Object.hasOwn(value, "reason") &&
			checkWaitReason(value.reason)) ||
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === REACT_FLOW_STATE.COMPLETED &&
			Object.hasOwn(value, "outputRef") &&
			checkArtifactRef(value.outputRef)) ||
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === REACT_FLOW_STATE.FAILED &&
			Object.hasOwn(value, "code") &&
			checkFlowErrorCode(value.code)) ||
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === REACT_FLOW_STATE.CANCELLED &&
			Object.hasOwn(value, "reason") &&
			(value.reason === "requested" || value.reason === "deadline"))
	);
}

function checkRunBudget(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 8 &&
		Object.hasOwn(value, "maxTurns") &&
		checkCounter(value.maxTurns) &&
		Object.hasOwn(value, "maxToolCalls") &&
		checkCounter(value.maxToolCalls) &&
		Object.hasOwn(value, "maxChildren") &&
		checkCounter(value.maxChildren) &&
		Object.hasOwn(value, "maxDepth") &&
		checkCounter(value.maxDepth) &&
		Object.hasOwn(value, "maxContextBytes") &&
		checkCounter(value.maxContextBytes) &&
		Object.hasOwn(value, "maxInputTokens") &&
		checkCounter(value.maxInputTokens) &&
		Object.hasOwn(value, "outputReserveTokens") &&
		checkCounter(value.outputReserveTokens) &&
		Object.hasOwn(value, "maxOutputBytes") &&
		checkCounter(value.maxOutputBytes)
	);
}

function checkRunUsage(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 3 &&
		Object.hasOwn(value, "turnsReserved") &&
		checkCounter(value.turnsReserved) &&
		Object.hasOwn(value, "toolsReserved") &&
		checkCounter(value.toolsReserved) &&
		Object.hasOwn(value, "childrenReserved") &&
		checkCounter(value.childrenReserved)
	);
}

function checkMillis(value: unknown): boolean {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

function checkActionProposal(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 5 &&
		Object.hasOwn(value, "proposalId") &&
		checkRef(value.proposalId) &&
		Object.hasOwn(value, "toolDescriptorRef") &&
		checkRef(value.toolDescriptorRef) &&
		Object.hasOwn(value, "toolDescriptorDigest") &&
		checkDigest(value.toolDescriptorDigest) &&
		Object.hasOwn(value, "argumentsRef") &&
		checkArtifactRef(value.argumentsRef) &&
		Object.hasOwn(value, "actionDigest") &&
		checkDigest(value.actionDigest)
	);
}

function checkRunSnapshot(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 14 &&
		Object.hasOwn(value, "runId") &&
		checkRef(value.runId) &&
		Object.hasOwn(value, "attemptId") &&
		checkRef(value.attemptId) &&
		Object.hasOwn(value, "version") &&
		checkCounter(value.version) &&
		Object.hasOwn(value, "consumedSequence") &&
		checkCounter(value.consumedSequence) &&
		Object.hasOwn(value, "bindings") &&
		checkFrozenBindings(value.bindings) &&
		Object.hasOwn(value, "position") &&
		checkFlowPosition(value.position) &&
		Object.hasOwn(value, "budget") &&
		checkRunBudget(value.budget) &&
		Object.hasOwn(value, "usage") &&
		checkRunUsage(value.usage) &&
		Object.hasOwn(value, "depth") &&
		checkCounter(value.depth) &&
		Object.hasOwn(value, "deadlineAtMs") &&
		checkMillis(value.deadlineAtMs) &&
		Object.hasOwn(value, "cancelEpoch") &&
		checkCounter(value.cancelEpoch) &&
		Object.hasOwn(value, "cancellationRequested") &&
		typeof value.cancellationRequested === "boolean" &&
		Object.hasOwn(value, "pendingActions") &&
		Array.isArray(value.pendingActions) &&
		value.pendingActions.every((item: unknown) => checkActionProposal(item)) &&
		Object.hasOwn(value, "transcriptHeadRef") &&
		checkRef(value.transcriptHeadRef)
	);
}

function checkSessionSnapshot(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 3 &&
		Object.hasOwn(value, "sessionId") &&
		checkRef(value.sessionId) &&
		Object.hasOwn(value, "version") &&
		checkCounter(value.version) &&
		Object.hasOwn(value, "historyHeadRef") &&
		checkRef(value.historyHeadRef)
	);
}

function checkContextFrame(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 6 &&
		Object.hasOwn(value, "frameId") &&
		checkRef(value.frameId) &&
		Object.hasOwn(value, "bindings") &&
		checkFrozenBindings(value.bindings) &&
		Object.hasOwn(value, "sourceRunVersion") &&
		checkCounter(value.sourceRunVersion) &&
		Object.hasOwn(value, "transcriptHeadRef") &&
		checkRef(value.transcriptHeadRef) &&
		Object.hasOwn(value, "promptRef") &&
		checkArtifactRef(value.promptRef) &&
		Object.hasOwn(value, "inputTokens") &&
		checkCounter(value.inputTokens)
	);
}

function checkChildSpec(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 4 &&
		Object.hasOwn(value, "goalRef") &&
		checkArtifactRef(value.goalRef) &&
		Object.hasOwn(value, "envelopeSubsetRef") &&
		checkRef(value.envelopeSubsetRef) &&
		Object.hasOwn(value, "budget") &&
		checkRunBudget(value.budget) &&
		Object.hasOwn(value, "deadlineAtMs") &&
		checkMillis(value.deadlineAtMs)
	);
}

function checkModelOutput(value: unknown): boolean {
	return (
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "answer" &&
			Object.hasOwn(value, "outputRef") &&
			checkArtifactRef(value.outputRef)) ||
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "tools" &&
			Object.hasOwn(value, "proposals") &&
			Array.isArray(value.proposals) &&
			value.proposals.every((item: unknown) => checkActionProposal(item))) ||
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "child" &&
			Object.hasOwn(value, "spec") &&
			checkChildSpec(value.spec))
	);
}

function checkEffect(value: unknown): boolean {
	return (
		value === FLOW_EFFECT.NONE ||
		value === FLOW_EFFECT.KNOWN_NOT_APPLIED ||
		value === FLOW_EFFECT.KNOWN_APPLIED ||
		value === FLOW_EFFECT.UNKNOWN
	);
}

function checkRuntimePayload(value: unknown): boolean {
	return (
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "AdvanceRequested" &&
			Object.hasOwn(value, "basisVersion") &&
			checkCounter(value.basisVersion)) ||
		(record(value) &&
			Object.keys(value).length === 4 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "ModelCompleted" &&
			Object.hasOwn(value, "modelCommandId") &&
			checkRef(value.modelCommandId) &&
			Object.hasOwn(value, "assistantTurnRef") &&
			checkArtifactRef(value.assistantTurnRef) &&
			Object.hasOwn(value, "output") &&
			checkModelOutput(value.output)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "ModelFailed" &&
			Object.hasOwn(value, "modelCommandId") &&
			checkRef(value.modelCommandId) &&
			Object.hasOwn(value, "effect") &&
			checkEffect(value.effect)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "PermissionResolved" &&
			Object.hasOwn(value, "proposalId") &&
			checkRef(value.proposalId) &&
			Object.hasOwn(value, "result") &&
			((record(value.result) &&
				Object.keys(value.result).length === 3 &&
				Object.hasOwn(value.result, "kind") &&
				value.result.kind === "allow" &&
				Object.hasOwn(value.result, "permitRef") &&
				checkRef(value.result.permitRef) &&
				Object.hasOwn(value.result, "expiresAtMs") &&
				checkMillis(value.result.expiresAtMs)) ||
				(record(value.result) &&
					Object.keys(value.result).length === 2 &&
					Object.hasOwn(value.result, "kind") &&
					value.result.kind === "ask" &&
					Object.hasOwn(value.result, "approvalRef") &&
					checkRef(value.result.approvalRef)) ||
				(record(value.result) &&
					Object.keys(value.result).length === 1 &&
					Object.hasOwn(value.result, "kind") &&
					value.result.kind === "deny") ||
				(record(value.result) &&
					Object.keys(value.result).length === 1 &&
					Object.hasOwn(value.result, "kind") &&
					value.result.kind === "unavailable"))) ||
		(record(value) &&
			Object.keys(value).length === 6 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "ToolObserved" &&
			Object.hasOwn(value, "toolCommandId") &&
			checkRef(value.toolCommandId) &&
			Object.hasOwn(value, "proposalId") &&
			checkRef(value.proposalId) &&
			Object.hasOwn(value, "effect") &&
			checkEffect(value.effect) &&
			Object.hasOwn(value, "outcome") &&
			(value.outcome === "success" || value.outcome === "failed") &&
			Object.hasOwn(value, "resultRef") &&
			(checkArtifactRef(value.resultRef) || value.resultRef === null)) ||
		(record(value) &&
			Object.keys(value).length === 4 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "ApprovalResolved" &&
			Object.hasOwn(value, "approvalRef") &&
			checkRef(value.approvalRef) &&
			Object.hasOwn(value, "proposalId") &&
			checkRef(value.proposalId) &&
			Object.hasOwn(value, "approved") &&
			typeof value.approved === "boolean") ||
		(record(value) &&
			Object.keys(value).length === 4 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "ChildCompleted" &&
			Object.hasOwn(value, "childId") &&
			checkRef(value.childId) &&
			Object.hasOwn(value, "outcome") &&
			(value.outcome === "completed" || value.outcome === "failed" || value.outcome === "cancelled") &&
			Object.hasOwn(value, "resultRef") &&
			(checkArtifactRef(value.resultRef) || value.resultRef === null)) ||
		(record(value) &&
			Object.keys(value).length === 5 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "EffectReconciled" &&
			Object.hasOwn(value, "commandId") &&
			checkRef(value.commandId) &&
			Object.hasOwn(value, "incidentRef") &&
			checkRef(value.incidentRef) &&
			Object.hasOwn(value, "result") &&
			(value.result === "model_completed" ||
				value.result === "tool_completed" ||
				value.result === "not_applied" ||
				value.result === "failed") &&
			Object.hasOwn(value, "resultRef") &&
			(checkArtifactRef(value.resultRef) || value.resultRef === null)) ||
		(record(value) &&
			Object.keys(value).length === 1 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "CancelRequested") ||
		(record(value) &&
			Object.keys(value).length === 1 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "DeadlineReached")
	);
}

function checkRuntimeEvent(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 8 &&
		Object.hasOwn(value, "eventId") &&
		checkRef(value.eventId) &&
		Object.hasOwn(value, "runId") &&
		checkRef(value.runId) &&
		Object.hasOwn(value, "attemptId") &&
		checkRef(value.attemptId) &&
		Object.hasOwn(value, "sequence") &&
		checkCounter(value.sequence) &&
		Object.hasOwn(value, "source") &&
		(value.source === "scheduler" ||
			value.source === "model" ||
			value.source === "security" ||
			value.source === "tool" ||
			value.source === "child" ||
			value.source === "recovery") &&
		Object.hasOwn(value, "causationId") &&
		checkRef(value.causationId) &&
		Object.hasOwn(value, "payload") &&
		checkRuntimePayload(value.payload) &&
		Object.hasOwn(value, "payloadDigest") &&
		checkDigest(value.payloadDigest)
	);
}

function checkPriorEventReceipt(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 4 &&
		Object.hasOwn(value, "eventId") &&
		checkRef(value.eventId) &&
		Object.hasOwn(value, "sequence") &&
		checkCounter(value.sequence) &&
		Object.hasOwn(value, "payloadDigest") &&
		checkDigest(value.payloadDigest) &&
		Object.hasOwn(value, "commitId") &&
		checkRef(value.commitId)
	);
}

function checkOperationContext(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 5 &&
		Object.hasOwn(value, "requestId") &&
		checkRef(value.requestId) &&
		Object.hasOwn(value, "traceparent") &&
		typeof value.traceparent === "string" &&
		Object.hasOwn(value, "correlationId") &&
		checkRef(value.correlationId) &&
		Object.hasOwn(value, "nowMs") &&
		checkMillis(value.nowMs) &&
		Object.hasOwn(value, "deadlineAtMs") &&
		checkMillis(value.deadlineAtMs)
	);
}

function checkAdvanceInput(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 8 &&
		Object.hasOwn(value, "protocolVersion") &&
		value.protocolVersion === "1.0.0" &&
		Object.hasOwn(value, "run") &&
		checkRunSnapshot(value.run) &&
		Object.hasOwn(value, "session") &&
		checkSessionSnapshot(value.session) &&
		Object.hasOwn(value, "context") &&
		(checkContextFrame(value.context) || value.context === null) &&
		Object.hasOwn(value, "contextFailure") &&
		(value.contextFailure === "unavailable" ||
			value.contextFailure === "limit_exceeded" ||
			value.contextFailure === null) &&
		Object.hasOwn(value, "event") &&
		checkRuntimeEvent(value.event) &&
		Object.hasOwn(value, "priorReceipt") &&
		(checkPriorEventReceipt(value.priorReceipt) || value.priorReceipt === null) &&
		Object.hasOwn(value, "operation") &&
		checkOperationContext(value.operation)
	);
}

function checkCommandPayload(value: unknown): boolean {
	return (
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "InvokeModel" &&
			Object.hasOwn(value, "promptRef") &&
			checkArtifactRef(value.promptRef)) ||
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "RequestPermission" &&
			Object.hasOwn(value, "proposal") &&
			checkActionProposal(value.proposal)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "DispatchTool" &&
			Object.hasOwn(value, "proposal") &&
			checkActionProposal(value.proposal) &&
			Object.hasOwn(value, "permitRef") &&
			checkRef(value.permitRef)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "CreateChildRun" &&
			Object.hasOwn(value, "childId") &&
			checkRef(value.childId) &&
			Object.hasOwn(value, "spec") &&
			checkChildSpec(value.spec)) ||
		(record(value) &&
			Object.keys(value).length === 2 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "CancelOutstanding" &&
			Object.hasOwn(value, "cancelEpoch") &&
			checkCounter(value.cancelEpoch)) ||
		(record(value) &&
			Object.keys(value).length === 3 &&
			Object.hasOwn(value, "kind") &&
			value.kind === "RequestReconciliation" &&
			Object.hasOwn(value, "targetCommandId") &&
			checkRef(value.targetCommandId) &&
			Object.hasOwn(value, "incidentRef") &&
			checkRef(value.incidentRef))
	);
}

function checkTranscriptEntry(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 6 &&
		Object.hasOwn(value, "kind") &&
		(value.kind === "assistant" || value.kind === "tool" || value.kind === "child") &&
		Object.hasOwn(value, "eventId") &&
		checkRef(value.eventId) &&
		Object.hasOwn(value, "commandId") &&
		checkRef(value.commandId) &&
		Object.hasOwn(value, "proposalId") &&
		(checkRef(value.proposalId) || value.proposalId === null) &&
		Object.hasOwn(value, "childId") &&
		(checkRef(value.childId) || value.childId === null) &&
		Object.hasOwn(value, "artifact") &&
		checkArtifactRef(value.artifact)
	);
}

function checkNextRunState(value: unknown): boolean {
	return (
		record(value) &&
		Object.keys(value).length === 4 &&
		Object.hasOwn(value, "position") &&
		checkFlowPosition(value.position) &&
		Object.hasOwn(value, "usage") &&
		checkRunUsage(value.usage) &&
		Object.hasOwn(value, "pendingActions") &&
		Array.isArray(value.pendingActions) &&
		value.pendingActions.every((item: unknown) => checkActionProposal(item)) &&
		Object.hasOwn(value, "transcriptAppend") &&
		Array.isArray(value.transcriptAppend) &&
		value.transcriptAppend.every((item: unknown) => checkTranscriptEntry(item))
	);
}

/** 验证完整输入的封闭字段结构；调用前须通过规范化 JSON 校验。 */
export function isAdvanceInput(value: unknown): value is AdvanceInput {
	return checkAdvanceInput(value);
}

/** 检查计划封闭结构，避免内部错误把任意字段带入持久决策。 */
export function isTransitionPlan(value: unknown): value is TransitionPlan {
	if (
		!record(value) ||
		Object.keys(value).sort().join() !== "commands,next" ||
		!Array.isArray(value.commands) ||
		!value.commands.every(checkCommandPayload) ||
		!record(value.next) ||
		!record(value.next.position)
	)
		return false;
	const position = value.next.position;
	if ("commandId" in position) return false;
	if ("commandOrdinal" in position) {
		const { commandOrdinal, ...rest } = position;
		if (!checkCounter(commandOrdinal)) return false;
		return checkNextRunState({ ...value.next, position: { ...rest, commandId: "planned-command" } });
	}
	return checkNextRunState(value.next);
}
