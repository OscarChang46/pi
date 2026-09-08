import assert from "node:assert/strict";

import { test } from "node:test";
import { createRunCommand } from "../../src/application/composition-root.ts";
import { AgentRuntime } from "../../src/cognitive/agent-runtime.ts";
import { loadRuntimeSettings } from "../../src/config/index.ts";
import type { AgentAdapter, ToolDescriptor } from "../../src/contracts/index.ts";
import type { ToolCoordinatorPort } from "../../src/contracts/tool-runtime.ts";
import type { ToolExecutionScope } from "../../src/contracts/tool-scope.ts";
import { ContextEngine } from "../../src/control/context-engine.ts";
import { createReadOnlyPermissionCeiling } from "../../src/control/permission-scope.ts";
import { RunFlow } from "../../src/control/run-flow.ts";
import { testContext, testTimePort } from "../support/test-context.ts";

const settings = loadRuntimeSettings();
const command = {
	...createRunCommand("/workspace", settings),
	delegationPolicy: { ...settings.config.runtime.delegationPolicy, enabled: false },
};
const ceiling = createReadOnlyPermissionCeiling(command.toolPolicy, "workspace:test", 1024);
const scope: ToolExecutionScope = {
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
const tool: ToolDescriptor = {
	name: "lawclaw_read_text",
	version: "1",
	description: "读取测试输入",
	risk: "read_only",
	inputSchema: { type: "object", properties: {} },
	maxResultBytes: 1024,
};

test("[AK-BND-001] 认知候选交回控制层，工具结果进入下一轮上下文", async () => {
	const trace: string[] = [];
	let turns = 0;
	const adapter: AgentAdapter = {
		async *executeTurn(_context, request) {
			assert.ok(Object.isFrozen(request));
			assert.ok(Object.isFrozen(request.tools));
			assert.deepEqual(
				request.tools.map((item) => item.name),
				[tool.name],
			);
			trace.push(`model:${++turns}`);
			if (turns === 1)
				yield {
					type: "turn_completed",
					message: {
						role: "assistant",
						runtimeMessageRef: "private:1",
						stopReason: "tool_use",
						content: [{ type: "tool_call", toolCallId: "call:1", toolName: tool.name, arguments: {} }],
					},
				};
			else {
				assert.ok(request.frame.messages.some((item) => item.role === "tool" && item.text === "checked result"));
				yield {
					type: "turn_completed",
					message: {
						role: "assistant",
						runtimeMessageRef: "private:2",
						stopReason: "stop",
						content: [{ type: "text", text: "ok" }],
					},
				};
			}
		},
	};
	const tools: ToolCoordinatorPort = {
		async initialize() {
			trace.push("catalog");
		},
		listAllowed() {
			return [tool];
		},
		assertActive() {},
		async execute() {
			trace.push("control:tool");
			return { text: "checked result", isError: false, metadata: {} };
		},
	};
	const flow = new RunFlow(
		new AgentRuntime(adapter),
		new ContextEngine(settings.config.kernel.context),
		tools,
		{
			async delegate() {
				throw new Error("不可委派");
			},
		},
		settings.config.kernel.runLimits,
		1024,
		testTimePort,
	);
	const result = await flow.run(
		testContext(),
		command,
		new AbortController().signal,
		{ loopStarted() {}, loopFinished() {} },
		scope,
	);
	assert.equal(result.status, "completed");
	assert.deepEqual(trace, ["catalog", "model:1", "control:tool", "model:2"]);
});
