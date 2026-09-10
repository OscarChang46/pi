import assert from "node:assert/strict";
import { test } from "node:test";
import { createRunCommand } from "../../src/application/composition-root.ts";
import { createInMemoryContextDependencies } from "../../src/application/context-assembly-composition.ts";
import { AgentRuntime } from "../../src/cognitive/agent-runtime.ts";
import { loadRuntimeSettings } from "../../src/config/index.ts";
import type { AgentExecutionBudget, RuntimeEventCandidate } from "../../src/contracts/index.ts";
import type { ToolCoordinatorPort } from "../../src/contracts/tool-runtime.ts";
import { createReadOnlyPermissionCeiling } from "../../src/control/permission-scope.ts";
import { RunFlow } from "../../src/control/run-flow.ts";
import { assertEventSequence, deferred, scriptedModel } from "../support/harness.ts";
import { testContext, testTimePort } from "../support/test-context.ts";

const settings = loadRuntimeSettings();
function harness(turns: readonly (readonly RuntimeEventCandidate[])[], budget: Partial<AgentExecutionBudget> = {}) {
	const base = createRunCommand({ sessionId: "session:limits", workspaceRoot: "/workspace" }, settings);
	const command = {
		...base,
		contextItems: [],
		budget: { ...base.budget, ...budget },
		delegationPolicy: { ...base.delegationPolicy, enabled: false },
	};
	const ceiling = createReadOnlyPermissionCeiling(command.toolPolicy, "workspace:test", 1024);
	const scope = {
		runtimeId: "runtime:test",
		agentId: "agent:test",
		sessionId: command.sessionId,
		runId: command.runId,
		policySnapshotId: "snapshot-test",
		runtimeCeiling: ceiling,
		sessionCeiling: ceiling,
		runCeiling: ceiling,
		resourceClaims: ceiling.resources,
		requestedEgress: [],
		requestedSecrets: [],
	};
	let toolCalls = 0;
	const tools: ToolCoordinatorPort = {
		async initialize() {},
		listAllowed() {
			return [];
		},
		assertActive() {},
		async execute() {
			toolCalls++;
			return { text: "ok", isError: false, metadata: {} };
		},
	};
	const model = scriptedModel(turns);
	const flow = new RunFlow(
		new AgentRuntime(model.adapter),
		createInMemoryContextDependencies(),
		tools,
		{
			async delegate() {
				throw new Error("unexpected delegation");
			},
		},
		settings.config.kernel.runLimits,
		1024,
		testTimePort,
	);
	return { command, model, flow, scope, tools, toolCalls: () => toolCalls };
}
const toolTurn: RuntimeEventCandidate = {
	type: "turn_completed",
	message: {
		role: "assistant",
		stopReason: "tool_use",
		content: [{ type: "tool_call", toolCallId: "call:1", toolName: "test_read", arguments: {} }],
	},
};

test("[AK-LIMIT-001] 达到轮次预算后停止新模型调用，失败事件保持单调", async () => {
	const h = harness([[toolTurn], [toolTurn]], { maxTurns: 1 });
	const result = await h.flow.run(
		testContext(),
		h.command,
		new AbortController().signal,
		{ loopStarted() {}, loopFinished() {} },
		h.scope,
	);
	assert.equal(result.status, "failed");
	assert.equal(h.model.calls(), 1);
	assert.equal(h.toolCalls(), 1);
	assert.equal(result.events.at(-1)?.data.errorCode, "RUN_BUDGET_EXCEEDED");
	assertEventSequence(result.events);
});

test("[AK-LIMIT-002] 流式输出与工具次数超限不会继续执行", async () => {
	for (const h of [
		harness([[{ type: "text_delta", text: "too long" }]], { maxOutputChars: 1 }),
		harness([[toolTurn], [toolTurn]], { maxToolCalls: 1 }),
	]) {
		const result = await h.flow.run(
			testContext(),
			h.command,
			new AbortController().signal,
			{ loopStarted() {}, loopFinished() {} },
			h.scope,
		);
		assert.equal(result.status, "failed");
		assert.equal(result.events.at(-1)?.data.errorCode, "RUN_BUDGET_EXCEEDED");
		assert.ok(h.toolCalls() <= 1);
	}
});

test("[AK-LIMIT-003] 用受控超时信号验证初始化后到期，模型调用为零", async (context) => {
	const deadline = new AbortController();
	const created = deferred();
	context.mock.method(AbortSignal, "timeout", () => {
		created.resolve();
		deadline.abort(new Error("deadline"));
		return deadline.signal;
	});
	const h = harness([[toolTurn]]);
	const result = await h.flow.run(
		testContext(),
		h.command,
		new AbortController().signal,
		{ loopStarted() {}, loopFinished() {} },
		h.scope,
	);
	await created.promise;
	assert.equal(result.status, "cancelled");
	assert.equal(h.model.calls(), 0);
	assert.equal(h.toolCalls(), 0);
});
