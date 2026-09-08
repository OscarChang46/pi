import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { temporaryWorkspace } from "../support/harness.ts";

const runner = path.resolve(import.meta.dirname, "../../scripts/verify.mjs");
type Entry = { id: string; level: string; file: string };
function manifest(entries: Entry[]) {
	return {
		schemaVersion: 1,
		capabilities: [{ id: "fixture", title: "fixture", status: "implemented" }],
		requirements: entries.map((entry) => ({
			id: `REQ-${entry.id}`,
			capability: "fixture",
			status: "implemented",
			title: entry.id,
			risk: "fixture-risk",
			levels: [entry.level],
			cases: [entry],
		})),
	};
}
async function fixture(root: string, body = "assert.equal(1, 1);", level = "ut", id = "AK-FIX-001") {
	const file = `test/${level}/fixture.test.ts`;
	await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
	await fs.mkdir(path.join(root, "docs/verification"), { recursive: true });
	await fs.writeFile(
		path.join(root, file),
		`import assert from 'node:assert/strict';\nimport {test} from 'node:test';\ntest('[${id}] fixture', async (context) => {${body}});\n`,
	);
	const entry = { id, level, file };
	await fs.writeFile(path.join(root, "docs/verification/acceptance.json"), JSON.stringify(manifest([entry])));
	return entry;
}
function invoke(root: string, ...args: string[]) {
	return spawnSync(process.execPath, [runner, "--root", root, ...args], {
		encoding: "utf8",
		timeout: 30_000,
		maxBuffer: 1024 * 1024,
	});
}
async function report(root: string) {
	return JSON.parse(await fs.readFile(path.join(root, ".artifacts/verification/report.json"), "utf8")) as {
		success: boolean;
		problems: string[];
		cases: { id: string; result: string }[];
		requirements: { implementation: string; result: string }[];
	};
}

test("[AK-VER-001] 整体与分层发现集合一致，并支持精确 ID 筛选", async (context) => {
	const root = await temporaryWorkspace(context);
	const entries: Entry[] = [];
	for (const [index, level] of ["ut", "dt", "contract", "integration", "system"].entries())
		entries.push(await fixture(root, "assert.ok(true);", level, `AK-FIX-00${index + 1}`));
	await fs.writeFile(path.join(root, "docs/verification/acceptance.json"), JSON.stringify(manifest(entries)));
	const all = invoke(root, "--list");
	assert.equal(all.status, 0, all.stdout + all.stderr);
	const split = entries.flatMap((entry) => {
		const result = invoke(root, "--list", "--level", entry.level);
		assert.equal(result.status, 0, result.stdout + result.stderr);
		return JSON.parse(result.stdout) as Entry[];
	});
	assert.deepEqual(
		split.map((c) => c.id).sort(),
		(JSON.parse(all.stdout) as Entry[]).map((c) => c.id),
	);
	const selected = invoke(root, "--id", "AK-FIX-003");
	assert.equal(selected.status, 0, selected.stdout + selected.stderr);
	assert.deepEqual(
		(await report(root)).cases.filter((c) => c.result === "passed").map((c) => c.id),
		["AK-FIX-003"],
	);
});

test("[AK-VER-002] 故意断言失败与必需用例跳过均阻断，报告不泄漏断言正文", async (context) => {
	const root = await temporaryWorkspace(context);
	for (const body of ["assert.fail('PRIVATE_ASSERTION_CANARY');", "context.skip('skip required');"]) {
		await fixture(root, body);
		const result = invoke(root);
		assert.equal(result.status, 1);
		const evidence = await report(root);
		assert.equal(evidence.success, false);
		assert.equal(evidence.cases[0].result, "failed");
		assert.ok(!JSON.stringify(evidence).includes("PRIVATE_ASSERTION_CANARY"));
	}
});

test("[AK-VER-003] 重复 ID、未登记用例、失效映射和零文件扫描均阻断", async (context) => {
	const root = await temporaryWorkspace(context);
	const entry = await fixture(root);
	const clean = manifest([entry]);
	for (const broken of [
		manifest([entry, entry]),
		manifest([{ ...entry, file: "test/ut/missing.test.ts" }]),
		{ ...clean, requirements: [] },
		{ ...clean, requirements: {} },
	]) {
		await fs.writeFile(path.join(root, "docs/verification/acceptance.json"), JSON.stringify(broken));
		assert.equal(invoke(root).status, 1);
		assert.equal((await report(root)).success, false);
	}
	await fixture(root);
	await fs.copyFile(path.join(root, entry.file), path.join(root, "test/ut/duplicate.test.ts"));
	assert.equal(invoke(root).status, 1);
	await fs.rm(path.join(root, "test"), { recursive: true });
	assert.equal(invoke(root).status, 1);
	await fs.mkdir(path.join(root, "test"));
	assert.equal(invoke(root).status, 1);
});

test("[AK-VER-004] 未知层级、未知 ID、空选择及层级冲突均拒绝", async (context) => {
	const root = await temporaryWorkspace(context);
	await fixture(root);
	for (const args of [
		["--level", "invalid"],
		["--id", "AK-FIX-999"],
		["--level", "dt"],
		["--level", "dt", "--id", "AK-FIX-001"],
		["--id", "AK-FIX-001", "--id", "AK-FIX-001"],
	])
		assert.equal(invoke(root, ...args).status, 1);
});

test("[AK-VER-005] 计划中能力不创建占位测试，也不计为验证通过", async (context) => {
	const root = await temporaryWorkspace(context);
	const entry = await fixture(root);
	const data = manifest([entry]);
	data.capabilities.push({ id: "future", title: "future", status: "planned" });
	data.requirements.push({
		id: "FUTURE",
		capability: "future",
		status: "planned",
		title: "future",
		risk: "future",
		levels: ["system"],
		cases: [],
	});
	await fs.writeFile(path.join(root, "docs/verification/acceptance.json"), JSON.stringify(data));
	assert.equal(invoke(root).status, 0);
	assert.deepEqual(
		(await report(root)).requirements.find((r) => r.implementation === "planned")?.result,
		"not_covered",
	);
});

test("[AK-VER-006] 测试失败后的清理钩子仍执行，子进程凭据隔离且网络默认拒绝", async (context) => {
	const root = await temporaryWorkspace(context);
	await fixture(
		root,
		`
	 context.after(async () => { await fs.writeFile(${JSON.stringify(path.join(root, "cleaned"))}, 'yes'); });
	 assert.equal(process.env.OPENAI_API_KEY, undefined);
	 assert.equal(process.env.LAWCLAW_CONFIG_FILE.endsWith('agent-kernel.yaml'), true);
	 await assert.rejects(fetch('https://example.invalid'), /VERIFICATION_NETWORK_DISABLED/);
	 assert.fail('intentional');
	`,
	);
	const file = path.join(root, "test/ut/fixture.test.ts");
	await fs.writeFile(file, `import fs from 'node:fs/promises';\n${await fs.readFile(file, "utf8")}`);
	const result = spawnSync(process.execPath, [runner, "--root", root], {
		encoding: "utf8",
		timeout: 30_000,
		env: { ...process.env, OPENAI_API_KEY: "synthetic-test-canary" },
	});
	assert.equal(result.status, 1);
	assert.equal(await fs.readFile(path.join(root, "cleaned"), "utf8"), "yes");
	assert.equal((await report(root)).cases[0].result, "failed");
});

test("[AK-VER-007] 加载阶段崩溃和未实际注册的用例不会被计为通过", async (context) => {
	const root = await temporaryWorkspace(context);
	await fixture(root);
	const file = path.join(root, "test/ut/fixture.test.ts");
	await fs.writeFile(file, `throw new Error('load failure');\n${await fs.readFile(file, "utf8")}`);
	assert.equal(invoke(root).status, 1);
	assert.equal((await report(root)).cases[0].result, "not_covered");
});

test("[AK-VER-008] 进程执行器区分缺失环境、非零退出与超时，并回收被终止进程", async (context) => {
	const root = await temporaryWorkspace(context);
	const worker = path.join(root, "worker.mjs");
	await fs.writeFile(worker, "console.log(process.pid); setInterval(() => {}, 1000);");
	const failing = path.join(root, "failed.mjs");
	await fs.writeFile(failing, "process.exitCode = 7;");
	const script = path.join(root, "check.mjs");
	await fs.writeFile(
		script,
		`
import assert from 'node:assert/strict';
import { execute } from ${JSON.stringify(path.resolve(import.meta.dirname, "../../scripts/verification.mjs"))};
const missing = await execute(${JSON.stringify(path.join(root, "missing-command"))}, [], { timeout: 2000 });
assert.equal(missing.failure, 'environment_missing');
const failed = await execute(process.execPath, [${JSON.stringify(failing)}], { timeout: 2000 });
assert.equal(failed.code, 7);
const stopped = await execute(process.execPath, [${JSON.stringify(worker)}], { timeout: 2000 });
assert.equal(stopped.failure, 'process_timeout');
const pid = Number(stopped.stdout.trim());
assert.ok(Number.isInteger(pid) && pid > 0);
assert.throws(() => process.kill(pid, 0), error => error.code === 'ESRCH');
`,
	);
	const result = spawnSync(process.execPath, [script], { encoding: "utf8", timeout: 15_000 });
	assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("[AK-VER-009] 测试别名与动态注册被发现阶段拒绝", async (context) => {
	const root = await temporaryWorkspace(context);
	await fixture(root);
	const file = path.join(root, "test/ut/fixture.test.ts");
	await fs.appendFile(file, "\nconst alias = test; alias('unregistered', () => {});\n");
	assert.equal(invoke(root).status, 1);
	assert.ok((await report(root)).problems.some((problem) => problem.includes("别名")));
});
