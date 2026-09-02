import assert from "node:assert/strict";
import { test } from "node:test";
import { FakeDelegationProvider } from "../src/adapters/fake-delegation-provider.ts";
import { loadRuntimeSettings } from "../src/config/index.ts";
import { KernelError } from "../src/contracts/index.ts";
import { DelegationEngine } from "../src/kernel/delegation-engine.ts";
import { testContext, testTimePort } from "./test-context.ts";

const policy = {
	enabled: true,
	maxDepth: 1 as const,
	maxChildren: 1,
	timeoutMs: 1_000,
	maxTaskChars: 100,
	maxResultBytes: 1_024,
};
const maxTrackedParents = loadRuntimeSettings().config.kernel.delegation.maxTrackedParents;

test("DelegationEngine 允许父 Run 创建一个子 Run", async () => {
	const result = await new DelegationEngine(
		new FakeDelegationProvider("子 Agent 已完成技术分析"),
		maxTrackedParents,
		testTimePort,
	).delegate(
		testContext(),
		{ parentRunId: "parent-1", depth: 0, task: "执行只读检查", workspaceRoot: process.cwd() },
		policy,
		new AbortController().signal,
	);
	assert.equal(result.status, "completed");
	assert.match(result.summary, /只读检查/u);
});

test("DelegationEngine 拒绝递归子 Agent", async () => {
	await assert.rejects(
		new DelegationEngine(
			new FakeDelegationProvider("子 Agent 已完成技术分析"),
			maxTrackedParents,
			testTimePort,
		).delegate(
			testContext(),
			{ parentRunId: "child-1", depth: 1, task: "再次委派", workspaceRoot: process.cwd() },
			policy,
			new AbortController().signal,
		),
		(error: unknown) => error instanceof KernelError && error.code === "DELEGATION_NOT_ALLOWED",
	);
});
