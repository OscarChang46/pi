import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("[AK-FS-012] Flow状态检查阻止裸判断、类型、表键、SQL及拼接子状态，并允许常量和普通字段", () => {
	const directory = mkdtempSync(path.join(tmpdir(), "flow-state-check-"));
	const checker = path.resolve(import.meta.dirname, "../../scripts/check-flow-state-constants.mjs");
	try {
		const invalid = [
			'if (run.state === "Running") execute();',
			'const states = ["Completed", "Failed"];',
			'const table = { Ready: "Running" };',
			'const table = { "Ready": target };',
			'type State = "Ready" | "Running";',
			"const sql = \"SELECT * FROM events WHERE kind='Activity_Completed'\";",
			`const sql = \`SELECT * FROM commands WHERE status='PENDING' AND id=\${id}\`;`,
			`const key = \`Suspended.\${reason}\`;`,
			'if (result.kind === "exit") return result;',
		];
		for (const source of invalid) {
			writeFileSync(path.join(directory, "flow-system.ts"), source);
			const result = spawnSync(process.execPath, [checker, directory], { encoding: "utf8" });
			assert.equal(result.status, 1, source);
			assert.match(result.stderr, /状态值必须引用所属模块常量/, source);
		}
		writeFileSync(
			path.join(directory, "flow-system.ts"),
			`
if (run.state === FLOW_SYSTEM_STATE.RUNNING) execute();
const table = { [FLOW_SYSTEM_STATE.READY]: FLOW_SYSTEM_STATE.RUNNING };
type State = typeof FLOW_SYSTEM_STATE.READY;
const context = { yield: handler, next: targets };
// Running and PENDING in comments document the protocol.
const reason = "FLOW_RUN_NOT_FOUND";
`,
		);
		const result = spawnSync(process.execPath, [checker, directory], { encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
