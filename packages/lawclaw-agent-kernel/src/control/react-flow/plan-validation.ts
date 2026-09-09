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
import { canonicalize } from "../../contracts/flow-value.ts";
import { FLOW_WAIT_REASON, isTerminalReActState, REACT_FLOW_STATE } from "../../contracts/react-flow-values.ts";
import { createVariantMatcher } from "../variant-matcher.ts";

type ValidationContext = { input: AdvanceInput; plan: TransitionPlan };
type WaitingPosition = Extract<PlannedPosition, { commandOrdinal: number }>;

function onlyCommand<Kind extends CommandPayload["kind"]>(
	commands: readonly CommandPayload[],
	kind: Kind,
): Extract<CommandPayload, { kind: Kind }> | undefined {
	const command = commands[0];
	return commands.length === 1 && command?.kind === kind
		? (command as Extract<CommandPayload, { kind: Kind }>)
		: undefined;
}

function waiting(
	position: WaitingPosition,
	commands: readonly CommandPayload[],
	kind: CommandPayload["kind"],
): boolean {
	return position.commandOrdinal === 0 && onlyCommand(commands, kind) !== undefined;
}

function proposalMatches(
	position: { proposalId: string },
	plan: TransitionPlan,
	kind: "RequestPermission" | "DispatchTool",
): boolean {
	const command = onlyCommand(plan.commands, kind);
	return (
		command !== undefined &&
		position.proposalId === command.proposal.proposalId &&
		plan.next.pendingActions.length > 0 &&
		canonicalize(plan.next.pendingActions[0]) === canonicalize(command.proposal)
	);
}

function reconciliationMatches(target: string, incident: string, commands: readonly CommandPayload[]): boolean {
	const command = onlyCommand(commands, "RequestReconciliation");
	return command !== undefined && command.targetCommandId === target && command.incidentRef === incident;
}

const validateWait = createVariantMatcher<WaitReason, ValidationContext, boolean>({
	[FLOW_WAIT_REASON.APPROVAL]: (_reason, { plan }) => plan.commands.length === 0,
	[FLOW_WAIT_REASON.TOOL_UNKNOWN]: (reason, { plan }) =>
		reconciliationMatches(reason.toolCommandId, reason.incidentRef, plan.commands),
	[FLOW_WAIT_REASON.MODEL_UNKNOWN]: (reason, { plan }) =>
		reconciliationMatches(reason.modelCommandId, reason.incidentRef, plan.commands),
});

// 这是计划完整性约束，不选择下一状态；新增状态必须声明其命令关系。
const validatePosition = createVariantMatcher<PlannedPosition, ValidationContext, boolean>({
	[REACT_FLOW_STATE.READY]: (_position, { plan }) => plan.commands.length === 0,
	[REACT_FLOW_STATE.AWAITING_MODEL]: (position, { plan }) => waiting(position, plan.commands, "InvokeModel"),
	[REACT_FLOW_STATE.AWAITING_PERMISSION]: (position, { plan }) =>
		waiting(position, plan.commands, "RequestPermission") && proposalMatches(position, plan, "RequestPermission"),
	[REACT_FLOW_STATE.AWAITING_TOOL]: (position, { plan }) =>
		waiting(position, plan.commands, "DispatchTool") && proposalMatches(position, plan, "DispatchTool"),
	[REACT_FLOW_STATE.AWAITING_CHILD]: (position, { plan }) => {
		const command = onlyCommand(plan.commands, "CreateChildRun");
		return position.commandOrdinal === 0 && command !== undefined && position.childId === command.childId;
	},
	[REACT_FLOW_STATE.SUSPENDED]: (position, context) => validateWait(position.reason, context),
	[REACT_FLOW_STATE.COMPLETED]: () => true,
	[REACT_FLOW_STATE.FAILED]: () => true,
	[REACT_FLOW_STATE.CANCELLED]: (_position, { input, plan }) => {
		const command = onlyCommand(plan.commands, "CancelOutstanding");
		return command !== undefined && command.cancelEpoch === input.run.cancelEpoch;
	},
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
	const terminal = isTerminalReActState(position.kind);
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
