import type { AgentRunSnapshot, RuntimeEvent, RuntimePayload } from "../contracts/flow-engine.ts";
import { flowDigest, flowId } from "../contracts/flow-value.ts";

/** 为可信边界生成下一序列事件；首轮受理和驱动使用同一身份与摘要规则。 */
export function createFlowEvent(
	agentRun: AgentRunSnapshot,
	payload: RuntimePayload,
	source: RuntimeEvent["source"],
	causationId: string,
): RuntimeEvent {
	return {
		eventId:
			payload.kind === "AdvanceRequested"
				? flowId("wake", { runId: agentRun.runId, version: agentRun.version, kind: "advance" })
				: flowId("fact", { commandId: causationId, payload }),
		runId: agentRun.runId,
		attemptId: agentRun.attemptId,
		sequence: agentRun.consumedSequence + 1,
		source,
		causationId,
		payload,
		payloadDigest: flowDigest({ source, causationId, payload }),
	};
}
