import type { SourceRecord } from "../../contracts/control/context-engine/assembly-messages.ts";
import type { FlowArtifactStore } from "../../contracts/flow-artifacts.ts";
import { flowId } from "../../contracts/flow-value.ts";
import { projectRunMessage } from "./run-history-projection.ts";

/** 完成的 Run 追加原用户任务，并将完整回答轮次与任务形成不可拆的依赖闭包。 */
export function completedRunHistory(
	artifacts: FlowArtifactStore,
	runId: string,
	task: string,
	records: readonly SourceRecord[],
): readonly SourceRecord[] {
	const user = projectRunMessage(artifacts, {
		runId,
		eventId: flowId("task", { runId }),
		sequence: 0,
		modelCommandId: null,
		message: { role: "user", text: task },
		requires: [],
	});
	return [
		user,
		...records.map((record, index) => ({
			...record,
			orderKey: { ...record.orderKey, sequence: index + 1 },
			dependencies: [
				...record.dependencies,
				{ fromRecordRef: record.recordRef, toRecordRef: user.recordRef, kind: "requires" as const },
			],
		})),
	];
}
