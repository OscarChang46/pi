import assert from "node:assert/strict";
import { test } from "node:test";
import { loadRuntimeSettings } from "../../src/config/index.ts";
import { KernelError } from "../../src/contracts/index.ts";
import { DelegationEngine } from "../../src/control/delegation-engine.ts";
import { FakeDelegationProvider } from "../../src/infrastructure/adapters/fake-delegation-provider.ts";
import { deferred } from "../support/harness.ts";
import { testContext, testTimePort } from "../support/test-context.ts";

const policy = {
	enabled: true,
	maxDepth: 1 as const,
	maxChildren: 1,
	timeoutMs: 1_000,
	maxTaskChars: 100,
	maxResultBytes: 1_024,
};
const maxTrackedParents = loadRuntimeSettings().config.kernel.delegation.maxTrackedParents;

test("[AK-DEL-003] 空任务、超长任务、禁用策略和已取消调用不进入子调用", async () => {
	let calls = 0;
	const engine = new DelegationEngine(
		{
			async executeChild() {
				calls++;
				throw new Error("不应执行");
			},
		},
		maxTrackedParents,
		testTimePort,
	);
	for (const [task, enabled, signal] of [
		["", true, new AbortController().signal],
		["x".repeat(101), true, new AbortController().signal],
		["task", false, new AbortController().signal],
		["task", true, AbortSignal.abort()],
	] as const) {
		await assert.rejects(
			engine.delegate(
				testContext(),
				{ parentRunId: "parent:blocked", depth: 0, task, workspaceRoot: "/workspace" },
				{ ...policy, enabled },
				signal,
			),
		);
	}
	assert.equal(calls, 0);
});

test("[AK-DEL-004] 父取消传播到活动子调用且等待资源收敛", async () => {
	const entered = deferred();
	const controller = new AbortController();
	let active = 0;
	const engine = new DelegationEngine(
		{
			async executeChild(_context, _request, signal) {
				active++;
				try {
					await new Promise<never>((_resolve, reject) => {
						signal.addEventListener("abort", () => reject(signal.reason), { once: true });
						entered.resolve();
					});
					throw new Error("unreachable");
				} finally {
					active--;
				}
			},
		},
		maxTrackedParents,
		testTimePort,
	);
	const work = engine.delegate(
		testContext(),
		{ parentRunId: "parent:cancel", depth: 0, task: "task", workspaceRoot: "/workspace" },
		policy,
		controller.signal,
	);
	const rejected = assert.rejects(work);
	await entered.promise;
	controller.abort();
	await rejected;
	assert.equal(active, 0);
});

test("[AK-DEL-005] 子调用结果超限与父调用次数上限都被执行", async () => {
	let calls = 0;
	const engine = new DelegationEngine(
		{
			async executeChild() {
				calls++;
				return { childRunId: "child:test", status: "completed" as const, summary: "x".repeat(1025) };
			},
		},
		maxTrackedParents,
		testTimePort,
	);
	const request = { parentRunId: "parent:limit", depth: 0, task: "task", workspaceRoot: "/workspace" };
	await assert.rejects(engine.delegate(testContext(), request, policy, new AbortController().signal));
	await assert.rejects(engine.delegate(testContext(), request, policy, new AbortController().signal));
	assert.equal(calls, 1);
});

test("[AK-DEL-001] DelegationEngine 允许父 Run 创建一个子 Run", async () => {
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

test("[AK-DEL-002] DelegationEngine 拒绝递归子 Agent", async () => {
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
