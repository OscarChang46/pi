import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { FlowEngine } from "../../src/control/flow-system/flow-engine.ts";
import { SqliteFlowJournal } from "../../src/infrastructure/adapters/sqlite-flow-journal.ts";

// 故障进程只修改临时合成账本，在外部生效与Completed之间真实终止。
const directory = process.argv[2];
const journal = new SqliteFlowJournal(join(directory, "journal.sqlite"), "tenant-a");
await new FlowEngine(journal).run({ flowRunId: "system-run", workflowVersion: "v1", input: { value: 1 } }, (context) =>
	context.activity({ key: "call-1", name: "ledger", version: "v1", input: { amount: "10.00" } }, async () => {
		writeFileSync(join(directory, "ledger.txt"), "1", { flush: true });
		process.kill(process.pid, "SIGKILL");
		return "unreachable";
	}),
);
