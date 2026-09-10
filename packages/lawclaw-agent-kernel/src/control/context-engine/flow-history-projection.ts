import type {
	ContextMessage,
	ExpectedChildObservation,
	SourceRecord,
} from "../../contracts/control/context-engine/assembly-contract.ts";
import { requireContext } from "../../contracts/control/context-engine/context-error.ts";
import type { AgentRunStore } from "../../contracts/control/run-registry/run-storage.ts";
import type { FlowArtifactStore } from "../../contracts/flow-artifacts.ts";
import type { FlowCommandOutcome } from "../../contracts/flow-dispatch.ts";
import { flowId } from "../../contracts/flow-value.ts";
import { FLOW_COMMAND_STATUS } from "../../contracts/react-flow-values.ts";
import { projectRunMessage } from "./run-history-projection.ts";

/** 从已提交转录及协调命令分别构造正文与应到观察清单，保留原模型命令身份。 */
export function projectFlowHistory(
	store: AgentRunStore,
	artifacts: FlowArtifactStore,
	runId: string,
): {
	/** 完整未选择的来源记录。 */ readonly records: readonly SourceRecord[];
	/** 来自协调事实的独立清单。 */ readonly expectedChildObservations: readonly ExpectedChildObservation[];
} {
	const commands = store.commands(runId);
	const entries = store.transcript(runId);
	const proposals = new Map<string, { modelCommandId: string; declarationRef: string }>();
	const records: SourceRecord[] = [];
	for (const [sequence, entry] of entries.entries()) {
		let message = artifacts.get(entry.artifact) as ContextMessage;
		let modelCommandId: string | null = entry.commandId;
		const requires: string[] = [];
		if (entry.kind === "assistant") {
			requireContext(message.role === "assistant");
			const child = commands.find(
				(record) =>
					record.command.payload.kind === "CreateChildRun" && record.command.causationId === entry.eventId,
			)?.command;
			if (child?.payload.kind === "CreateChildRun") {
				const childId = child.payload.childId;
				message = {
					...message,
					content: message.content.map((block) => {
						if (block.type !== "tool_call" || block.toolName !== "lawclaw_delegate") return block;
						requireContext(typeof block.arguments.task === "string");
						return { type: "child_task" as const, childId, childRunId: childId, task: block.arguments.task };
					}),
				};
			}
		} else if (entry.kind === "tool") {
			requireContext(message.role === "tool" && entry.proposalId !== null);
			const call = proposals.get(entry.proposalId);
			requireContext(call !== undefined, "BINDING_MISMATCH");
			modelCommandId = call.modelCommandId;
			requires.push(call.declarationRef);
		} else {
			requireContext(message.role === "task_observation" && message.childId === entry.childId, "BINDING_MISMATCH");
			modelCommandId = null;
		}
		const record = projectRunMessage(artifacts, {
			runId,
			eventId: entry.eventId,
			sequence,
			modelCommandId,
			message,
			requires,
		});
		records.push(record);
		if (message.role === "assistant")
			for (const block of message.content) {
				if (block.type === "tool_call")
					proposals.set(flowId("proposal", { commandId: entry.commandId, toolCallId: block.toolCallId }), {
						modelCommandId: entry.commandId,
						declarationRef: record.recordRef,
					});
			}
	}
	const expectedChildObservations: ExpectedChildObservation[] = [];
	for (const record of commands) {
		if (record.command.payload.kind !== "CreateChildRun" || record.resultRef === null) continue;
		const outcome = artifacts.get(record.resultRef) as FlowCommandOutcome | null;
		if (outcome === null) continue;
		requireContext(outcome.payload.kind === "ChildCompleted", "BINDING_MISMATCH");
		if (outcome.payload.outcome === "cancelled" || outcome.payload.resultRef === null) continue;
		const eventId = flowId("fact", { commandId: record.command.commandId, payload: outcome.payload });
		expectedChildObservations.push({
			recordRef: flowId("ctx-rec", {
				kind: "run_event",
				originAgentRunId: runId,
				originEventRef: eventId,
				recordIndex: 0,
			}),
			childId: outcome.payload.childId,
			childRunId: outcome.payload.childId,
			outcome: outcome.payload.outcome === "completed" ? FLOW_COMMAND_STATUS.SUCCEEDED : FLOW_COMMAND_STATUS.FAILED,
		});
	}
	return { records, expectedChildObservations };
}
