import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createRunCommand } from "../../src/application/composition-root.ts";
import { AgentRuntime } from "../../src/cognitive/agent-runtime.ts";
import { loadRuntimeSettings } from "../../src/config/index.ts";

import { ContextEngine } from "../../src/control/context-engine.ts";
import { temporaryWorkspace } from "../support/harness.ts";
import { testContext } from "../support/test-context.ts";

const settings = loadRuntimeSettings();
const command = {
	...createRunCommand("/workspace", settings),
	delegationPolicy: { ...settings.config.runtime.delegationPolicy, enabled: false },
};
test("[AK-BND-002] 认知层在工具候选之后收到取消，不向控制层交付可执行完成结果", async () => {
	const cancel = new AbortController();
	const runtime = new AgentRuntime({
		async *executeTurn() {
			cancel.abort();
			yield {
				type: "turn_completed",
				message: { role: "assistant", runtimeMessageRef: "private:cancel", stopReason: "tool_use", content: [] },
			};
		},
	});
	await assert.rejects(async () => {
		for await (const _ of runtime.executeTurn(
			testContext(),
			{
				sessionId: command.sessionId,
				frame: new ContextEngine(settings.config.kernel.context).assemble({
					systemPrompt: "system",
					goal: "goal",
					items: [],
					maxInputTokens: 1000,
					outputReserveTokens: 100,
				}),
				tools: [],
			},
			cancel.signal,
		)) {
			assert.fail("取消后不能产生候选");
		}
	});
});

test("[AK-BND-003] 源码门禁拒绝跨职责实现依赖和运行时环", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "lawclaw-boundaries-"));
	try {
		await mkdir(path.join(root, "cognitive"));
		await mkdir(path.join(root, "tools"));
		await writeFile(path.join(root, "cognitive/bad.ts"), 'import "../tools/bad.ts";');
		await writeFile(path.join(root, "tools/bad.ts"), 'import "../cognitive/bad.ts";');
		const checked = spawnSync(
			process.execPath,
			[path.resolve(import.meta.dirname, "../../scripts/check-source-boundaries.mjs"), root],
			{ encoding: "utf8" },
		);
		assert.equal(checked.status, 1);
		assert.match(checked.stderr, /跨职责直接依赖/u);
		assert.match(checked.stderr, /循环依赖/u);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("[AK-BND-004] 源码门禁拒绝目录缺失、空扫描和不可解析文件", async (context) => {
	const root = await temporaryWorkspace(context);
	const check = (directory: string) =>
		spawnSync(
			process.execPath,
			[path.resolve(import.meta.dirname, "../../scripts/check-source-boundaries.mjs"), directory],
			{ encoding: "utf8" },
		);
	assert.equal(check(path.join(root, "missing")).status, 1);
	assert.equal(check(root).status, 1);
	await mkdir(path.join(root, "control"));
	await writeFile(path.join(root, "control/broken.ts"), "export const broken = ;");
	assert.equal(check(root).status, 1);
	await writeFile(path.join(root, "control/broken.ts"), "export const valid = 1;");
	assert.equal(check(root).status, 0);
});
