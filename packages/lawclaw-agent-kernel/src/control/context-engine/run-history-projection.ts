import type { ContextMessage, SourceRecord } from "../../contracts/control/context-engine/assembly-messages.ts";
import type { FlowArtifactStore } from "../../contracts/flow-artifacts.ts";
import { flowId } from "../../contracts/flow-value.ts";

/** 从原始已确认事件投影，来源路径和当前消费 Run 不参与身份。 */
export function projectRunMessage(
	artifacts: FlowArtifactStore,
	input: {
		/** 原事件所属 Run。 */ readonly runId: string;
		/** 原提交事件。 */ readonly eventId: string;
		/** 原来源内顺序。 */ readonly sequence: number;
		/** 原模型调用身份，用户任务为 null。 */ readonly modelCommandId: string | null;
		/** 规范事实正文。 */ readonly message: ContextMessage;
		/** 显式前驱，由宿主任务契约或命令关系提供。 */ readonly requires: readonly string[];
	},
): SourceRecord {
	const identity = {
		kind: "run_event" as const,
		originAgentRunId: input.runId,
		originEventRef: input.eventId,
		recordIndex: 0,
	};
	const recordRef = flowId("ctx-rec", identity);
	const message = input.message;
	const calls: SourceRecord["callBindings"][number][] = [];
	if (message.role === "assistant")
		message.content.forEach((block, blockOrdinal) => {
			if (block.type === "tool_call") {
				if (!input.modelCommandId) throw new Error("CONTEXT_MODEL_COMMAND_MISSING");
				calls.push({
					identity: {
						originAgentRunId: input.runId,
						modelCommandId: input.modelCommandId,
						callId: block.toolCallId,
					},
					side: "request",
					blockOrdinal,
				});
			}
		});
	if (message.role === "tool") {
		if (!input.modelCommandId) throw new Error("CONTEXT_MODEL_COMMAND_MISSING");
		calls.push({
			identity: { originAgentRunId: input.runId, modelCommandId: input.modelCommandId, callId: message.toolCallId },
			side: "result",
			blockOrdinal: null,
		});
	}
	return {
		recordRef,
		identity,
		contentRef: artifacts.put(message),
		message,
		orderKey: { sourceOrdinal: 0, sequence: input.sequence, recordOrdinal: 0 },
		callBindings: calls,
		dependencies: input.requires.map((toRecordRef) => ({ fromRecordRef: recordRef, toRecordRef, kind: "requires" })),
	};
}
