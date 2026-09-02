import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentRunResult, RequestContext, StartAgentRunCommand } from "../src/contracts/index.ts";
import type { AgentLoopLifecyclePort } from "../src/kernel/agent-loop.ts";
import type { AgentRunExecutor } from "../src/kernel/agent-run.ts";
import { AgentRuntime } from "../src/kernel/agent-runtime.ts";
import { createReadOnlyPermissionCeiling } from "../src/kernel/tool-runtime.ts";
import { testContext, testTimePort } from "./test-context.ts";

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

class TwoLoopExecutor implements AgentRunExecutor {
	async run(
		_context: RequestContext,
		commandValue: StartAgentRunCommand,
		_signal?: AbortSignal,
		lifecycle?: AgentLoopLifecyclePort,
	): Promise<AgentRunResult> {
		for (const ordinal of [1, 2]) {
			lifecycle?.loopStarted(ordinal, testTimePort.now().isoUtc);
			lifecycle?.loopFinished(ordinal, "COMPLETED", testTimePort.now().isoUtc);
		}
		return {
			runId: commandValue.runId,
			status: "completed",
			output: "ok",
			turns: 2,
			toolCalls: 0,
			events: [],
			lastFrame: {
				frameId: "frame:test",
				systemPrompt: commandValue.systemPrompt,
				messages: [],
				estimatedTokens: 1,
				reductionTrace: {
					droppedItemIds: [],
					selectedItemIds: [],
					reasonCodes: [],
					estimatedTokensBefore: 1,
					estimatedTokensAfter: 1,
				},
			},
		};
	}
}

test("Runtime → Session → AgentRun → Loop 形成真实所有权层级", async () => {
	const runtime = new AgentRuntime(
		"runtime:test",
		"agent:test",
		new TwoLoopExecutor(),
		{
			maxSessions: 2,
			maxRunsPerSession: 2,
		},
		runtimeCeiling,
	);
	await runtime.run(testContext(), command("session:1", "run:1"));
	await runtime.run(testContext(), command("session:1", "run:2"));

	assert.equal(runtime.sessions.length, 1);
	const session = runtime.sessions[0];
	assert.equal(session?.runs.length, 2);
	assert.equal(session?.getRun("run:1")?.loops.length, 2);
	assert.deepEqual(
		session?.getRun("run:2")?.loops.map((loop) => loop.status),
		["COMPLETED", "COMPLETED"],
	);
});

test("Runtime 和 Session 拒绝跨租户复用、重复 Run 与容量扩张", async () => {
	const runtime = new AgentRuntime(
		"runtime:test",
		"agent:test",
		new TwoLoopExecutor(),
		{
			maxSessions: 1,
			maxRunsPerSession: 1,
		},
		runtimeCeiling,
	);
	await runtime.run(testContext(), command("session:1", "run:1"));
	await assert.rejects(() => runtime.run(testContext(), command("session:1", "run:1")));
	await assert.rejects(() => runtime.run(testContext(), command("session:1", "run:2")));
	await assert.rejects(() => runtime.run(testContext(), command("session:2", "run:3")));
	const otherTenant = {
		...testContext(),
		tenant: { ...testContext().tenant, tenantId: "tenant:other" },
	};
	await assert.rejects(() => runtime.run(otherTenant, command("session:1", "run:4")));
});
