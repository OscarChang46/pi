import type {
	AdvanceInput,
	ArtifactRef,
	FlowErrorCode,
	PlannedPosition,
	TranscriptEntry,
	TransitionPlan,
} from "../../contracts/flow-engine.ts";
import { reject } from "./input-guard.ts";

/** 为单次迁移动作提供纯计划构造函数，不保存Run状态。 */
export function transitionContext(input: AdvanceInput) {
	const { run, event } = input;
	const { pendingActions, usage } = run;
	const plan = (
		next: PlannedPosition,
		commands: TransitionPlan["commands"] = [],
		append: readonly TranscriptEntry[] = [],
		pending = pendingActions,
		nextUsage = usage,
	): TransitionPlan => ({
		next: { position: next, usage: nextUsage, pendingActions: pending, transcriptAppend: append },
		commands,
	});
	const failed = (code: FlowErrorCode, append: readonly TranscriptEntry[] = []): TransitionPlan =>
		plan({ kind: "Failed", code }, [], append, []);
	const entry = (
		kind: TranscriptEntry["kind"],
		artifact: ArtifactRef,
		proposalId: string | null = null,
		childId: string | null = null,
	): TranscriptEntry => ({
		kind,
		artifact,
		eventId: event.eventId,
		commandId: event.causationId,
		proposalId,
		childId,
	});
	const conflict = () => reject("FLOW_EVENT_CONFLICT", "event.causationId");

	return { plan, failed, entry, conflict };
}
