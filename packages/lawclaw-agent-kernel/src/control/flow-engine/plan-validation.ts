import type {
	AdvanceInput,
	CommandPayload,
	PlannedPosition,
	RunBudget,
	RunUsage,
	TranscriptEntry,
	TransitionPlan,
	WaitReason,
} from "../../contracts/flow-engine.ts";
import { canonicalize } from "./canonical.ts";
import { createVariantMatcher } from "./variant-matcher.ts";

type ValidationContext = { input: AdvanceInput; plan: TransitionPlan };
type WaitingPosition = Extract<PlannedPosition, { commandOrdinal: number }>;

function waiting(
	position: WaitingPosition,
	commands: readonly CommandPayload[],
	kind: CommandPayload["kind"],
): boolean {
	return position.commandOrdinal === 0 && commands.length === 1 && commands[0].kind === kind;
}

function proposalMatches(position: { proposalId: string }, plan: TransitionPlan): boolean {
	const command = plan.commands[0];
	return (
		(command.kind === "RequestPermission" || command.kind === "DispatchTool") &&
		position.proposalId === command.proposal.proposalId &&
		plan.next.pendingActions.length > 0 &&
		canonicalize(plan.next.pendingActions[0]) === canonicalize(command.proposal)
	);
}

function reconciliationMatches(target: string, incident: string, commands: readonly CommandPayload[]): boolean {
	return (
		commands.length === 1 &&
		commands[0].kind === "RequestReconciliation" &&
		commands[0].targetCommandId === target &&
		commands[0].incidentRef === incident
	);
}

const validateWait = createVariantMatcher<WaitReason, ValidationContext, boolean>({
	approval: (_reason, { plan }) => plan.commands.length === 0,
	tool_unknown: (reason, { plan }) => reconciliationMatches(reason.toolCommandId, reason.incidentRef, plan.commands),
	model_unknown: (reason, { plan }) => reconciliationMatches(reason.modelCommandId, reason.incidentRef, plan.commands),
});

// 这是计划完整性约束，不选择下一状态；新增状态必须声明其命令关系。
const validatePosition = createVariantMatcher<PlannedPosition, ValidationContext, boolean>({
	Ready: (_position, { plan }) => plan.commands.length === 0,
	AwaitingModel: (position, { plan }) => waiting(position, plan.commands, "InvokeModel"),
	AwaitingPermission: (position, { plan }) =>
		waiting(position, plan.commands, "RequestPermission") && proposalMatches(position, plan),
	AwaitingTool: (position, { plan }) =>
		waiting(position, plan.commands, "DispatchTool") && proposalMatches(position, plan),
	AwaitingChild: (position, { plan }) =>
		waiting(position, plan.commands, "CreateChildRun") &&
		plan.commands[0].kind === "CreateChildRun" &&
		position.childId === plan.commands[0].childId,
	Suspended: (position, context) => validateWait(position.reason, context),
	Completed: () => true,
	Failed: () => true,
	Cancelled: (_position, { input, plan }) =>
		plan.commands.length === 1 &&
		plan.commands[0].kind === "CancelOutstanding" &&
		plan.commands[0].cancelEpoch === input.run.cancelEpoch,
});

const reservations = {
	turnsReserved: { command: "InvokeModel", budget: "maxTurns" },
	toolsReserved: { command: "DispatchTool", budget: "maxToolCalls" },
	childrenReserved: { command: "CreateChildRun", budget: "maxChildren" },
} satisfies Record<keyof RunUsage, { command: CommandPayload["kind"]; budget: keyof RunBudget }>;

const transcriptBindings = createVariantMatcher<TranscriptEntry, undefined, boolean>({
	assistant: (entry) => entry.proposalId === null && entry.childId === null,
	tool: (entry) => entry.proposalId !== null && entry.childId === null,
	child: (entry) => entry.childId !== null && entry.proposalId === null,
});

/** 对已通过结构校验的计划执行集合约束、记账及各状态命令绑定验证。 */
export function validatePlan(input: AdvanceInput, plan: TransitionPlan): boolean {
	const { run, event } = input;
	const { position, usage, pendingActions, transcriptAppend } = plan.next;
	const commands = plan.commands;
	const terminal = ["Completed", "Failed", "Cancelled"].includes(position.kind);
	if (
		commands.length > (terminal ? 2 : 1) ||
		pendingActions.length > 8 ||
		new Set(pendingActions.map((p) => p.proposalId)).size !== pendingActions.length ||
		commands.some((c) => Buffer.byteLength(canonicalize(c)) > 65536)
	)
		return false;
	if (
		terminal &&
		(pendingActions.length !== 0 ||
			commands.some((c) => c.kind !== "CancelOutstanding" && c.kind !== "RequestReconciliation"))
	)
		return false;
	if (
		!(Object.keys(reservations) as (keyof RunUsage)[]).every((field) => {
			const rule = reservations[field];
			return (
				usage[field] === run.usage[field] + commands.filter((c) => c.kind === rule.command).length &&
				usage[field] <= run.budget[rule.budget]
			);
		})
	)
		return false;
	return (
		validatePosition(position, { input, plan }) &&
		transcriptAppend.every(
			(entry) =>
				entry.eventId === event.eventId &&
				entry.commandId === event.causationId &&
				entry.artifact.bytes <= run.budget.maxOutputBytes &&
				transcriptBindings(entry, undefined),
		)
	);
}
