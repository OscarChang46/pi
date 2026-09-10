import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRuntimeSettings } from "../src/config/index.ts";
import type { FlowActivity } from "../src/contracts/control/flow-engine/flow-engine-contract.ts";
import { FlowEngine } from "../src/control/flow-engine/flow-engine.ts";
import { SqliteFlowJournal } from "../src/infrastructure/state-storage/adapters/flow-engine/sqlite-flow-journal.ts";

// 受信本机维护入口；recover前必须由操作方停止原宿主，避免仍在途的外部调用。
const [action, flowRunId, detail] = process.argv.slice(2);
const settings = loadRuntimeSettings();
const journal = new SqliteFlowJournal(
	join(process.env.FLOW_DATA_DIRECTORY ?? ".artifacts/flow-local/data", "flow-system.sqlite"),
	settings.config.runtime.requestContext.tenantId,
);
const engine = new FlowEngine(journal);
const commands: Record<string, () => unknown> = {
	inspect: () => ({ flowRun: journal.get(flowRunId), events: journal.history(flowRunId).map(({ sequence, kind }) => ({ sequence, kind })) }),
	recover: () => engine.recover(flowRunId),
	terminate: () => engine.terminate(flowRunId, detail ?? "MAINTENANCE_TERMINATED"),
	reconcile: () => {
		const receipt = JSON.parse(readFileSync(detail, "utf8")) as { activity: FlowActivity; result: unknown; evidence: string };
		journal.reconcile(flowRunId, receipt.activity, receipt.result, receipt.evidence);
		return { flowRunId, reconciled: true };
	},
};
try {
	if (!flowRunId || !Object.hasOwn(commands, action)) throw new Error("FLOW_ADMIN_USAGE");
	console.log(JSON.stringify(commands[action]()));
} catch (error) {
	const code = error instanceof Error && /^FLOW_[A-Z_]+$/.test(error.message) ? error.message : "FLOW_ADMIN_FAILED";
	console.error(JSON.stringify({ code }));
	process.exitCode = 1;
} finally {
	journal.close();
}
