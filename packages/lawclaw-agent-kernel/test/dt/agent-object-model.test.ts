import assert from "node:assert/strict";
import { test } from "node:test";
import {
	type AgentRunResult,
	KernelError,
	type RequestContext,
	type StartAgentRunCommand,
} from "../../src/contracts/index.ts";
import type { AgentLoopLifecyclePort } from "../../src/control/agent-loop.ts";
import { AgentSystem } from "../../src/control/agent-system.ts";
import { createReadOnlyPermissionCeiling } from "../../src/control/permission-scope.ts";
import type { AgentRunExecutor } from "../../src/control/run-registry/agent-run.ts";
import { RunRegistry } from "../../src/control/run-registry/run-registry.ts";
import { testContext } from "../support/test-context.ts";
import { TwoLoopExecutor } from "../support/two-loop-executor.ts";

const commandBase: Omit<StartAgentRunCommand, "runId" | "sessionId"> = {
	systemPrompt: "system",
	goal: "goal",
	contextItems: [],
	toolPolicy: {
		allowedToolNames: [],
		allowedRisks: [],
		maxCalls: 1,
		perCallTimeoutMs: 1_000,
		maxArgumentsBytes: 1_024,
	},
	delegationPolicy: {
		enabled: false,
		maxDepth: 1,
		maxChildren: 1,
		timeoutMs: 1_000,
		maxTaskChars: 100,
		maxResultBytes: 1_024,
	},
	budget: {
		maxTurns: 2,
		maxToolCalls: 1,
		maxDurationMs: 1_000,
		maxInputTokens: 1_000,
		outputReserveTokens: 100,
		maxOutputChars: 1_000,
	},
	workspaceRoot: "/workspace",
};

function command(sessionId: string, runId: string): StartAgentRunCommand {
	return { ...commandBase, sessionId, runId };
}

const runtimeCeiling = createReadOnlyPermissionCeiling(commandBase.toolPolicy, "workspace:test", 1_024);

function ensureRootSession(runtime: AgentSystem, logicalKey: string): string {
	return runtime.ensure(testContext(), {
		commandId: `ensure:${logicalKey}`,
		intent: {
			logicalKey,
			agentDefinitionRef: "agent-definition:test",
			contextPolicyRef: "context-policy:test",
			parent: null,
		},
	}).anchor.sessionId;
}

class ControllableExecutor implements AgentRunExecutor {
	readonly started: Promise<void>;
	readonly #released: Promise<void>;
	#markStarted: () => void = () => undefined;
	#release: () => void = () => undefined;

	constructor() {
		this.started = new Promise((resolve) => {
			this.#markStarted = resolve;
		});
		this.#released = new Promise((resolve) => {
			this.#release = resolve;
		});
	}

	release(): void {
		this.#release();
	}

	async run(
		context: RequestContext,
		commandValue: StartAgentRunCommand,
		signal?: AbortSignal,
		lifecycle?: AgentLoopLifecyclePort,
	): Promise<AgentRunResult> {
		this.#markStarted();
		await this.#released;
		return new TwoLoopExecutor().run(context, commandValue, signal, lifecycle);
	}
}

test("[AK-RUN-001] RunRegistry 保留历史，Session 完成后不保留 Run 集合", async () => {
	const runtime = new AgentSystem(
		"runtime:test",
		"agent:test",
		new TwoLoopExecutor(),
		{
			maxSessions: 2,
		},
		runtimeCeiling,
		new RunRegistry(),
	);
	const sessionId = ensureRootSession(runtime, "logical:1");
	await runtime.run(testContext(), command(sessionId, "run:1"));
	await runtime.run(testContext(), command(sessionId, "run:2"));

	assert.equal(runtime.sessions.length, 1);
	const session = runtime.sessions[0];
	assert.equal(session?.activeRunBinding, undefined);
	assert.equal(runtime.getRun("run:1")?.status, "COMPLETED");
	assert.equal(runtime.getRun("run:1")?.loops.length, 2);
	assert.deepEqual(
		runtime.getRun("run:2")?.loops.map((loop) => loop.status),
		["COMPLETED", "COMPLETED"],
	);
});

test("[AK-RUN-002] Runtime 拒绝跨租户复用、重复 Run 与 Session 容量扩张", async () => {
	const runtime = new AgentSystem(
		"runtime:test",
		"agent:test",
		new TwoLoopExecutor(),
		{
			maxSessions: 1,
		},
		runtimeCeiling,
		new RunRegistry(),
	);
	const sessionId = ensureRootSession(runtime, "logical:1");
	await runtime.run(testContext(), command(sessionId, "run:1"));
	await assert.rejects(() => runtime.run(testContext(), command(sessionId, "run:1")));
	assert.throws(
		() => ensureRootSession(runtime, "logical:2"),
		(error: unknown) => error instanceof KernelError && error.code === "RUNTIME_SESSION_LIMIT_EXCEEDED",
	);
	const otherTenant = {
		...testContext(),
		tenant: { ...testContext().tenant, tenantId: "tenant:other" },
	};
	await assert.rejects(() => runtime.run(otherTenant, command(sessionId, "run:4")));
});

test("[AK-SESSION-004] 同一 Session 的并发第二个 Run 立即拒绝，释放后可顺序运行", async () => {
	const executor = new ControllableExecutor();
	const runtime = new AgentSystem(
		"runtime:test",
		"agent:test",
		executor,
		{ maxSessions: 1 },
		runtimeCeiling,
		new RunRegistry(),
	);
	const sessionId = ensureRootSession(runtime, "logical:1");

	const firstRun = runtime.run(testContext(), command(sessionId, "run:1"));
	await executor.started;
	const concurrentRun = runtime.run(testContext(), command(sessionId, "run:2"));
	executor.release();
	await assert.rejects(
		() => concurrentRun,
		(error: unknown) => error instanceof KernelError && error.code === "SESSION_RUN_ACTIVE",
	);
	await firstRun;
	await runtime.run(testContext(), command(sessionId, "run:2"));

	assert.equal(runtime.sessions[0]?.activeRunBinding, undefined);
	assert.equal(runtime.getRun("run:1")?.status, "COMPLETED");
	assert.equal(runtime.getRun("run:2")?.status, "COMPLETED");
});

test("[AK-SESSION-005] Run 不得隐式创建缺失的 Session", async () => {
	const runtime = new AgentSystem(
		"runtime:test",
		"agent:test",
		new TwoLoopExecutor(),
		{ maxSessions: 1 },
		runtimeCeiling,
		new RunRegistry(),
	);

	await assert.rejects(
		() => runtime.run(testContext(), command("session:missing", "run:missing")),
		(error: unknown) => error instanceof KernelError && error.code === "SESSION_NOT_FOUND",
	);
	assert.equal(runtime.sessions.length, 0);
	assert.equal(runtime.getRun("run:missing"), undefined);
});

test("[AK-SESSION-006] Root Session 按 logicalKey 查询并由显式意图创建确认锚点", () => {
	const runtime = new AgentSystem(
		"runtime:test",
		"agent:test",
		new TwoLoopExecutor(),
		{ maxSessions: 1 },
		runtimeCeiling,
		new RunRegistry(),
	);
	const intent = {
		logicalKey: "logical:case-1",
		agentDefinitionRef: "agent-definition:1",
		contextPolicyRef: "context-policy:1",
		parent: null,
	};

	assert.deepEqual(runtime.lookup(testContext(), intent.logicalKey), { state: "absent" });
	const ensured = runtime.ensure(testContext(), { commandId: "ensure:case-1", intent });

	assert.equal(ensured.created, true);
	assert.equal(ensured.anchor.version, 0);
	assert.ok(ensured.anchor.sessionId.length > 0);
	assert.ok(ensured.anchor.headRef.length > 0);
	assert.deepEqual(runtime.lookup(testContext(), intent.logicalKey), {
		state: "found",
		anchor: ensured.anchor,
	});
});

test("[AK-SESSION-007] ensure 回执保持原结果并拒绝同命令异载荷", () => {
	const runtime = new AgentSystem(
		"runtime:test",
		"agent:test",
		new TwoLoopExecutor(),
		{ maxSessions: 1 },
		runtimeCeiling,
		new RunRegistry(),
	);
	const intent = {
		logicalKey: "logical:case-1",
		agentDefinitionRef: "agent-definition:1",
		contextPolicyRef: "context-policy:1",
		parent: null,
	};
	const first = runtime.ensure(testContext(), { commandId: "ensure:first", intent });
	const second = runtime.ensure(testContext(), { commandId: "ensure:second", intent });

	assert.equal(first.created, true);
	assert.equal(second.created, false);
	assert.deepEqual(second.anchor, first.anchor);
	assert.deepEqual(runtime.ensure(testContext(), { commandId: "ensure:first", intent }), first);
	assert.throws(
		() =>
			runtime.ensure(testContext(), {
				commandId: "ensure:first",
				intent: { ...intent, contextPolicyRef: "context-policy:changed" },
			}),
		(error: unknown) => error instanceof KernelError && error.code === "IDEMPOTENCY_CONFLICT",
	);
	assert.throws(
		() =>
			runtime.ensure(testContext(), {
				commandId: "ensure:third",
				intent: { ...intent, contextPolicyRef: "context-policy:changed" },
			}),
		(error: unknown) => error instanceof KernelError && error.code === "SESSION_BINDING_MISMATCH",
	);
});

test("[AK-SESSION-008] 两个首次调用只创建一个 Root 且失败者取得赢家锚点", () => {
	const runtime = new AgentSystem(
		"runtime:test",
		"agent:test",
		new TwoLoopExecutor(),
		{ maxSessions: 2 },
		runtimeCeiling,
		new RunRegistry(),
	);
	const intent = {
		logicalKey: "logical:race",
		agentDefinitionRef: "agent-definition:1",
		contextPolicyRef: "context-policy:1",
		parent: null,
	};

	assert.equal(runtime.lookup(testContext(), intent.logicalKey).state, "absent");
	assert.equal(runtime.lookup(testContext(), intent.logicalKey).state, "absent");
	const winner = runtime.ensure(testContext(), { commandId: "ensure:winner", intent });
	const loser = runtime.ensure(testContext(), { commandId: "ensure:loser", intent });

	assert.equal(winner.created, true);
	assert.equal(loser.created, false);
	assert.deepEqual(loser.anchor, winner.anchor);
	assert.equal(runtime.sessions.length, 1);
});
