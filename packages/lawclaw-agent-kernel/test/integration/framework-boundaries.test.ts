import assert from "node:assert/strict";

import { test } from "node:test";
import { createRunCommand } from "../../src/application/composition-root.ts";
import { createInMemoryContextDependencies } from "../../src/application/context-assembly-composition.ts";
import { AgentRuntime } from "../../src/cognitive/agent-runtime.ts";
import { loadRuntimeSettings } from "../../src/config/index.ts";
import type { AgentAdapter, ToolDescriptor } from "../../src/contracts/index.ts";
import type { ToolCoordinatorPort } from "../../src/contracts/tool-runtime.ts";
import { AgentSystem } from "../../src/control/agent-system.ts";
import { createReadOnlyPermissionCeiling } from "../../src/control/permission-scope.ts";
import { RunFlow } from "../../src/control/run-flow.ts";
import { RunRegistry } from "../../src/control/run-registry/run-registry.ts";
import { testContext, testTimePort } from "../support/test-context.ts";

const settings = loadRuntimeSettings();
const command = {
	...createRunCommand({ sessionId: "session:integration-boundary", workspaceRoot: "/workspace" }, settings),
	delegationPolicy: { ...settings.config.runtime.delegationPolicy, enabled: false },
};
const ceiling = createReadOnlyPermissionCeiling(command.toolPolicy, "workspace:test", 1024);
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
			assert.deepEqual(Object.keys(request).sort(), [
				"formatVersion",
				"modelAdapterVersion",
				"payload",
				"sessionId",
			]);
			assert.ok(Object.isFrozen(request));
			assert.ok(Object.isFrozen(request.payload.tools));
			assert.deepEqual(
				request.payload.tools.map((item) => item.name),
				[tool.name],
			);
			trace.push(`model:${++turns}`);
			if (turns === 1)
				yield {
					type: "turn_completed",
					message: {
						role: "assistant",
						stopReason: "tool_use",
						content: [{ type: "tool_call", toolCallId: "call:1", toolName: tool.name, arguments: {} }],
					},
				};
			else {
				assert.ok(request.payload.messages.some((item) => item.role === "tool" && item.text === "checked result"));
				if (turns === 3) {
					assert.equal(request.payload.task, "second task");
					assert.deepEqual(
						request.payload.messages.filter((item) => item.role === "user").map((item) => item.text),
						[command.goal],
					);
					assert.ok(
						request.payload.messages.some(
							(item) =>
								item.role === "assistant" &&
								item.content.some((block) => block.type === "text" && block.text === "ok"),
						),
					);
				}
				yield {
					type: "turn_completed",
					message: {
						role: "assistant",
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
		createInMemoryContextDependencies(),
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
	const system = new AgentSystem("runtime:test", "agent:test", flow, { maxSessions: 4 }, ceiling, new RunRegistry());
	const context = testContext();
	const session = system.ensure(context, {
		commandId: "ensure:test",
		intent: {
			logicalKey: "conversation",
			agentDefinitionRef: "agent:test",
			contextPolicyRef: "policy:test",
			parent: null,
		},
	});
	const first = { ...command, sessionId: session.anchor.sessionId };
	const result = await system.run(context, first);
	assert.equal(result.status, "completed");
	assert.deepEqual(trace, ["catalog", "model:1", "control:tool", "model:2"]);
	assert.equal(
		(await system.run(context, { ...first, runId: "run:second", goal: "second task" })).status,
		"completed",
	);
	assert.equal(system.lookup(context, "conversation").state, "found");
	assert.equal(system.sessions[0].version, 2);
});
