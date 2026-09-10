import assert from "node:assert/strict";
import { test } from "node:test";
import { createFlowService } from "../../src/application/flow-composition.ts";
import { deferred, scriptedModel, temporaryWorkspace } from "../support/harness.ts";

test("[AK-FS-011] 系统Completed与业务结果落盘之间故障，恢复消费历史且模型只调用一次", async (t) => {
	const model = scriptedModel([
		[
			{
				type: "turn_completed",
				message: {
					role: "assistant",
					stopReason: "stop",
					content: [{ type: "text", text: "RECOVERED" }],
				},
			},
		],
	]);
	const service = await createFlowService({
		dataDirectory: await temporaryWorkspace(t),
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: model.adapter,
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	service.sessions.admit(
		await service.frames.initial({
			runId: "business-commit-gap",
			goal: "answer",
			nowMs: now,
			deadlineAtMs: now + 15000,
		}),
	);
	const original = service.store.recordCommand.bind(service.store);
	let failOnce = true;
	t.mock.method(service.store, "recordCommand", (...args: Parameters<typeof original>) => {
		if (failOnce && args[1].resultRef !== null) {
			failOnce = false;
			throw new Error("synthetic commit failure");
		}
		return original(...args);
	});
	await service.driver.drive("business-commit-gap");
	assert.equal(service.journal.get("business-commit-gap").state, "Yield");
	assert.equal(
		service.journal.history("business-commit-gap").filter((event) => event.kind === "Activity_Completed").length,
		1,
	);
	await service.driver.drive("business-commit-gap");
	assert.equal(service.store.load("business-commit-gap")?.run.position.kind, "Completed");
	assert.equal(service.journal.get("business-commit-gap").state, "Terminate");
	assert.equal(model.calls(), 1);
});

test("[AK-FE-029] 同Run并发驱动加入同一执行，所有调用者等到耐久完成", async (t) => {
	const directory = await temporaryWorkspace(t);
	const entered = deferred();
	const finish = deferred();
	let calls = 0;
	const service = await createFlowService({
		dataDirectory: directory,
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: {
			async *executeTurn() {
				calls++;
				entered.resolve();
				await finish.promise;
				yield {
					type: "turn_completed",
					message: {
						role: "assistant",
						stopReason: "stop",
						content: [{ type: "text", text: "ONE_EXECUTION" }],
					},
				};
			},
		},
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	service.sessions.admit(
		await service.frames.initial({
			runId: "concurrent-run",
			goal: "回答一次",
			nowMs: now,
			deadlineAtMs: now + 15000,
		}),
	);
	const first = service.driver.drive("concurrent-run");
	await entered.promise;
	const second = service.driver.drive("concurrent-run");
	let joinedFinished = false;
	void second.then(() => {
		joinedFinished = true;
	});
	await Promise.resolve();
	assert.equal(joinedFinished, false);
	finish.resolve();
	await Promise.all([first, second]);
	assert.equal(calls, 1);
	assert.equal(service.store.load("concurrent-run")?.run.position.kind, "Completed");
	assert.equal(service.store.commands("concurrent-run").length, 1);
});

test("[AK-FE-027] 子Run独立持久化并把结果交还父Run，禁止递归委派", async (t) => {
	const directory = await temporaryWorkspace(t);
	const model = scriptedModel([
		[
			{
				type: "turn_completed",
				message: {
					role: "assistant",
					stopReason: "tool_use",
					content: [
						{
							type: "tool_call",
							toolCallId: "child-1",
							toolName: "lawclaw_delegate",
							arguments: { task: "回答CHILD_OK" },
						},
					],
				},
			},
		],
		[
			{
				type: "turn_completed",
				message: {
					role: "assistant",
					stopReason: "stop",
					content: [{ type: "text", text: "CHILD_OK" }],
				},
			},
		],
		[
			{
				type: "turn_completed",
				message: {
					role: "assistant",
					stopReason: "stop",
					content: [{ type: "text", text: "PARENT_OK" }],
				},
			},
		],
	]);
	const service = await createFlowService({
		dataDirectory: directory,
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: model.adapter,
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({
		runId: "parent-run",
		goal: "委派一个子任务",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	service.sessions.admit(input);
	await service.driver.drive(input.run.runId);
	const childCommand = service.store
		.commands(input.run.runId)
		.find((record) => record.command.payload.kind === "CreateChildRun");
	assert.ok(childCommand);
	assert.equal(childCommand.command.payload.kind, "CreateChildRun");
	const childId = childCommand.command.payload.childId;
	const child = service.store.load(childId);
	assert.equal(child?.run.position.kind, "Completed");
	assert.equal(child.run.depth, 1);
	assert.equal(child.run.budget.maxChildren, 0);
	assert.ok(child.run.deadlineAtMs <= input.run.deadlineAtMs);
	assert.equal(service.store.load(input.run.runId)?.run.position.kind, "Completed");
	const childEntry = service.store.transcript(input.run.runId).find((entry) => entry.kind === "child");
	assert.ok(childEntry);
	assert.deepEqual(service.artifacts.get(childEntry.artifact), {
		role: "task_observation",
		childId,
		childRunId: childId,
		outcome: "SUCCEEDED",
		resultRef: child.run.position.kind === "Completed" ? child.run.position.outputRef : null,
		errorRef: null,
		text: "CHILD_OK",
	});
	assert.equal(model.calls(), 3);
	await service.driver.drive(input.run.runId);
	assert.equal(model.calls(), 3);
	assert.equal(service.store.listRunIds(10).length, 2);
});

test("[AK-FE-023] 耐久驱动器经真实Core提交完成并保存回答", async (t) => {
	const directory = await temporaryWorkspace(t);
	const model = scriptedModel([
		[
			{
				type: "turn_completed",
				message: {
					role: "assistant",
					stopReason: "stop",
					content: [{ type: "text", text: "FLOW_OK" }],
				},
			},
		],
	]);
	const service = await createFlowService({
		dataDirectory: directory,
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: model.adapter,
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({
		runId: "answer-run",
		goal: "回答FLOW_OK",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	service.sessions.admit(input);
	await service.driver.drive(input.run.runId);
	const position = service.store.load(input.run.runId)?.run.position;
	assert.equal(position?.kind, "Completed");
	assert.equal(service.artifacts.get(position.outputRef), "FLOW_OK");
	await service.driver.drive(input.run.runId);
	assert.equal(model.calls(), 1);
	assert.equal(service.store.commands(input.run.runId).length, 1);
});

test("[AK-FE-024] 耐久工具路径经过PDP、Permit消费、PEP和真实只读Provider", async (t) => {
	const directory = await temporaryWorkspace(t);
	const model = scriptedModel([
		[
			{
				type: "turn_completed",
				message: {
					role: "assistant",
					stopReason: "tool_use",
					content: [
						{
							type: "tool_call",
							toolCallId: "read-1",
							toolName: "lawclaw_read_text",
							arguments: { path: "input.txt" },
						},
					],
				},
			},
		],
		[
			{
				type: "turn_completed",
				message: {
					role: "assistant",
					stopReason: "stop",
					content: [{ type: "text", text: "read complete" }],
				},
			},
		],
		[
			{
				type: "turn_completed",
				message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "continued" }] },
			},
		],
	]);
	let service = await createFlowService({
		dataDirectory: directory,
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: model.adapter,
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({
		runId: "tool-run",
		sessionKey: "conversation",
		goal: "读取input.txt",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	service.sessions.admit(input);
	await service.driver.drive(input.run.runId);
	assert.equal(service.store.load(input.run.runId)?.run.position.kind, "Completed");
	assert.deepEqual(
		service.store.commands(input.run.runId).map((record) => record.command.payload.kind),
		["InvokeModel", "RequestPermission", "DispatchTool", "InvokeModel"],
	);
	const entry = service.store.transcript(input.run.runId).find((item) => item.kind === "tool");
	assert.ok(entry);
	const result = service.artifacts.get(entry.artifact);
	assert.ok(
		typeof result === "object" &&
			result !== null &&
			"text" in result &&
			typeof result.text === "string" &&
			result.text.length > 0,
	);
	assert.equal(model.calls(), 2);
	assert.ok(model.requests[1].payload.messages.some((item) => item.role === "tool"));
	service.close();
	service = await createFlowService({
		dataDirectory: directory,
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: model.adapter,
	});
	const next = await service.frames.initial({
		runId: "continued-run",
		sessionKey: "conversation",
		goal: "continue from original",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	service.sessions.admit(next);
	await service.driver.drive(next.run.runId);
	assert.equal(service.store.load(next.run.runId)?.run.position.kind, "Completed");
	assert.equal(model.calls(), 3);
	assert.equal(model.requests[2].sessionId, model.requests[0].sessionId);
	assert.deepEqual(
		model.requests[2].payload.messages.filter((item) => item.role === "user").map((item) => item.text),
		["读取input.txt"],
	);
	assert.ok(model.requests[2].payload.messages.some((item) => item.role === "tool"));
	assert.equal(model.requests[2].payload.task, "continue from original");
	assert.ok(
		model.requests[2].payload.messages.some(
			(item) =>
				item.role === "assistant" &&
				item.content.some((block) => block.type === "text" && block.text === "read complete"),
		),
	);
});
