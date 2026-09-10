import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { createRequestContext } from "../../src/application/composition-root.ts";
import { createFlowService } from "../../src/application/flow-composition.ts";
import { DurableSessionManager } from "../../src/control/session-manager/durable-session-manager.ts";
import { SqliteSessionRepository } from "../../src/infrastructure/state-storage/adapters/sqlite-session-repository.ts";
import { deferred, scriptedModel, temporaryWorkspace } from "../support/harness.ts";

function answer(text: string) {
	return [
		{
			type: "turn_completed" as const,
			message: {
				role: "assistant" as const,
				stopReason: "stop" as const,
				content: [{ type: "text" as const, text }],
			},
		},
	];
}

test("[AK-SESSION-019] 历史写入后回执插入失败原子回滚，恢复不重复追加", async (t) => {
	const directory = await temporaryWorkspace(t);
	const service = await createFlowService({ dataDirectory: directory, modelsPath: "unused", providerId: "test", modelId: "test", modelOverride: scriptedModel([answer("confirmed")]).adapter });
	t.after(() => service.close());
	const scope = createRequestContext().tenant.tenantId;
	const repository = new SqliteSessionRepository(join(directory, "sessions.sqlite"), scope);
	t.after(() => repository.close());
	const sessions = new DurableSessionManager(repository, service.store, service.artifacts, scope);
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({ runId: "receipt-gap", goal: "question", nowMs: now, deadlineAtMs: now + 15000 });
	service.sessions.admit(input);
	t.mock.method(service.sessions, "finalize", () => {});
	await service.driver.drive(input.run.runId);
	const record = repository.record.bind(repository);
	let failOnce = true;
	t.mock.method(repository, "record", (...args: Parameters<typeof record>) => { if (failOnce) { failOnce = false; throw new Error("receipt insert failed"); } return record(...args); });
	assert.throws(() => sessions.finalize(input.run.runId), /receipt insert failed/);
	assert.equal(sessions.snapshot(input.session.sessionId).anchor.version, 0);
	assert.equal(sessions.snapshot(input.session.sessionId).records.length, 0);
	assert.equal(sessions.snapshot(input.session.sessionId).active?.state, "RELEASING");
	sessions.recover();
	const confirmed = sessions.snapshot(input.session.sessionId);
	assert.equal(confirmed.anchor.version, 1);
	assert.equal(confirmed.active, null);
	sessions.finalize(input.run.runId);
	assert.deepEqual(sessions.snapshot(input.session.sessionId), confirmed);
});

test("[AK-SESSION-020] Run 失败确认后释放且后续轮次使用原已采纳历史", async (t) => {
	const model = scriptedModel([answer("next")]);
	const service = await createFlowService({ dataDirectory: await temporaryWorkspace(t), modelsPath: "unused", providerId: "test", modelId: "test", modelOverride: model.adapter });
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({ runId: "expired", sessionKey: "conversation", goal: "expired task", nowMs: now - 1000, deadlineAtMs: now - 1 });
	service.sessions.admit(input);
	await service.driver.drive(input.run.runId);
	assert.equal(service.store.load(input.run.runId)?.run.position.kind, "Failed");
	assert.equal(service.sessions.snapshot(input.session.sessionId).active, null);
	assert.equal(service.sessions.snapshot(input.session.sessionId).anchor.version, 0);
	assert.equal(model.calls(), 0);
	const next = await service.frames.initial({ runId: "after-failure", sessionKey: "conversation", goal: "next task", nowMs: now, deadlineAtMs: now + 15000 });
	service.sessions.admit(next); await service.driver.drive(next.run.runId);
	assert.equal(model.calls(), 1);
	assert.equal(model.requests[0].payload.messages.filter((message) => message.role === "user").length, 0);
	assert.equal(service.sessions.snapshot(input.session.sessionId).anchor.version, 1);
});

test("[AK-SESSION-011] 受理不推进历史，采纳后续轮携带完整历史且旧终态不释放新绑定", async (t) => {
	const model = scriptedModel([answer("first answer"), answer("second answer")]);
	const service = await createFlowService({
		dataDirectory: await temporaryWorkspace(t),
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: model.adapter,
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const first = await service.frames.initial({
		runId: "first",
		sessionKey: "conversation",
		goal: "first question",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	const original = service.sessions.snapshot(first.session.sessionId).anchor;
	assert.equal(original.version, 0);
	assert.throws(() => service.store.admit(first), /SESSION_BINDING_REQUIRED/);
	service.sessions.admit(first);
	service.sessions.admit(first);
	assert.deepEqual(service.sessions.snapshot(original.sessionId).anchor, original);
	await assert.rejects(
		service.frames.initial({
			runId: "blocked",
			sessionKey: "conversation",
			goal: "blocked",
			nowMs: now,
			deadlineAtMs: now + 15000,
		}),
		/SESSION_RUN_ACTIVE/,
	);
	await service.driver.drive("first");
	const confirmed = service.sessions.snapshot(original.sessionId);
	assert.equal(confirmed.anchor.version, 1);
	assert.equal(confirmed.active, null);
	assert.ok(confirmed.records.length >= 2);
	const second = await service.frames.initial({
		runId: "second",
		sessionKey: "conversation",
		goal: "followup",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	service.sessions.admit(second);
	service.sessions.finalize("first");
	assert.equal(service.sessions.snapshot(original.sessionId).active?.runId, "second");
	assert.deepEqual(service.sessions.snapshot(original.sessionId).anchor, confirmed.anchor);
	await service.driver.drive("second");
	assert.equal(service.sessions.snapshot(original.sessionId).anchor.version, 2);
	assert.equal(model.requests[1].sessionId, original.sessionId);
	assert.ok(
		model.requests[1].payload.messages.some(
			(message) => message.role === "user" && message.text === "first question",
		),
	);
});

test("[AK-SESSION-012] 受理已提交但回执丢失，只查原受理并保留单活", async (t) => {
	const service = await createFlowService({
		dataDirectory: await temporaryWorkspace(t),
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: scriptedModel([answer("ok")]).adapter,
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({
		runId: "lost-ack",
		sessionKey: "same",
		goal: "question",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	const admit = service.store.admit.bind(service.store);
	let calls = 0;
	t.mock.method(service.store, "admit", (...args: Parameters<typeof admit>) => {
		calls++;
		admit(...args);
		throw new Error("lost acknowledgment");
	});
	assert.throws(() => service.sessions.admit(input), /lost acknowledgment/);
	assert.equal(service.sessions.snapshot(input.session.sessionId).active?.state, "SUBMIT_UNKNOWN");
	service.sessions.recover();
	assert.equal(calls, 1);
	assert.equal(service.sessions.snapshot(input.session.sessionId).active?.state, "ACTIVE");
	assert.equal(service.store.listRunIds(10).length, 1);
	assert.throws(
		() => service.sessions.admit({ ...input, operation: { ...input.operation, requestId: "different" } }),
		/IDEMPOTENCY_CONFLICT/,
	);
});

test("[AK-SESSION-013] 占槽后受理前中断，重启恢复原输入而不重算候选", async (t) => {
	const directory = await temporaryWorkspace(t);
	const model = scriptedModel([answer("recovered")]);
	const options = {
		dataDirectory: directory,
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: model.adapter,
	};
	let service = await createFlowService(options);
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({
		runId: "reserved",
		goal: "question",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	t.mock.method(service.store, "admit", () => {
		throw new Error("before admission");
	});
	assert.throws(() => service.sessions.admit(input), /before admission/);
	assert.equal(service.store.load(input.run.runId), null);
	service.close();
	service = await createFlowService(options);
	assert.deepEqual(service.store.initial(input.run.runId), input);
	assert.equal(service.sessions.snapshot(input.session.sessionId).active?.state, "ACTIVE");
	assert.equal(model.calls(), 0);
	await service.driver.drive(input.run.runId);
	assert.equal(model.calls(), 1);
});

test("[AK-SESSION-014] Run 终态与历史采纳之间故障，重启只补采纳并幂等释放", async (t) => {
	const directory = await temporaryWorkspace(t);
	const model = scriptedModel([answer("durable result")]);
	const options = {
		dataDirectory: directory,
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: model.adapter,
	};
	let service = await createFlowService(options);
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({
		runId: "finalization-gap",
		sessionKey: "same",
		goal: "question",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	service.sessions.admit(input);
	t.mock.method(service.sessions, "finalize", () => {
		throw new Error("before history adoption");
	});
	await assert.rejects(service.driver.drive(input.run.runId), /before history adoption/);
	assert.equal(service.store.load(input.run.runId)?.run.position.kind, "Completed");
	assert.equal(service.sessions.snapshot(input.session.sessionId).anchor.version, 0);
	await assert.rejects(
		service.frames.initial({
			runId: "too-early",
			sessionKey: "same",
			goal: "next",
			nowMs: now,
			deadlineAtMs: now + 15000,
		}),
		/SESSION_RUN_ACTIVE/,
	);
	service.close();
	service = await createFlowService(options);
	const confirmed = service.sessions.snapshot(input.session.sessionId);
	assert.equal(confirmed.anchor.version, 1);
	assert.equal(confirmed.active, null);
	service.sessions.recover();
	await service.driver.drive(input.run.runId);
	assert.deepEqual(service.sessions.snapshot(input.session.sessionId), confirmed);
	assert.equal(model.calls(), 1);
});

test("[AK-SESSION-015] 双连接首次准备只建一个 Session，CAS 占槽只允许一个 Run", async (t) => {
	const options = {
		dataDirectory: await temporaryWorkspace(t),
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: scriptedModel([]).adapter,
	};
	const first = await createFlowService(options);
	const second = await createFlowService(options);
	t.after(() => {
		first.close();
		second.close();
	});
	const now = first.time.now().epochMilliseconds;
	const [a, b] = await Promise.all([
		first.frames.initial({ runId: "a", sessionKey: "shared", goal: "a", nowMs: now, deadlineAtMs: now + 15000 }),
		second.frames.initial({ runId: "b", sessionKey: "shared", goal: "b", nowMs: now, deadlineAtMs: now + 15000 }),
	]);
	assert.equal(a.session.sessionId, b.session.sessionId);
	first.sessions.admit(a);
	assert.throws(() => second.sessions.admit(b), /SESSION_RUN_ACTIVE/);
	assert.equal(second.store.load("b"), null);
	assert.equal(second.sessions.snapshot(a.session.sessionId).bindingVersion, 1);
});

test("[AK-SESSION-016] 候选失败不创建 Session，ensure 重投返回原锚点且拒绝异载荷", async (t) => {
	const service = await createFlowService({
		dataDirectory: await temporaryWorkspace(t),
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: scriptedModel([answer("ok")]).adapter,
	});
	t.after(() => service.close());
	const context = createRequestContext();
	const now = service.time.now().epochMilliseconds;
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(
		service.frames.initial(
			{ runId: "not-created", goal: "question", nowMs: now, deadlineAtMs: now + 15000 },
			controller.signal,
		),
	);
	assert.equal(service.sessions.lookup(context, "not-created").state, "absent");
	const input = await service.frames.initial({
		runId: "ensure-id",
		goal: "question",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	const initial = service.sessions.snapshot(input.session.sessionId);
	service.sessions.admit(input);
	await service.driver.drive(input.run.runId);
	assert.deepEqual(service.sessions.ensure(context, { commandId: "ensure-id", intent: initial.intent }), {
		anchor: initial.anchor,
		created: true,
	});
	assert.throws(
		() =>
			service.sessions.ensure(context, {
				commandId: "ensure-id",
				intent: { ...initial.intent, contextPolicyRef: "changed" },
			}),
		/IDEMPOTENCY_CONFLICT/,
	);
});

test("[AK-SESSION-017] 取消活动 Run 后确认释放，不把临时输出采纳为历史", async (t) => {
	const entered = deferred();
	const service = await createFlowService({
		dataDirectory: await temporaryWorkspace(t),
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: {
			async *executeTurn(_context, _request, signal) {
				entered.resolve();
				await new Promise<void>((resolve) => {
					if (signal?.aborted) resolve();
					else signal?.addEventListener("abort", () => resolve(), { once: true });
				});
				yield { type: "text_delta", text: "cancelled" };
				throw new Error("cancelled model");
			},
		},
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({
		runId: "cancelled",
		goal: "question",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	service.sessions.admit(input);
	const drive = service.driver.drive(input.run.runId);
	await entered.promise;
	service.store.cancel(input.run.runId);
	service.driver.abort(input.run.runId);
	await drive;
	await service.driver.drive(input.run.runId);
	assert.equal(service.store.load(input.run.runId)?.run.position.kind, "Cancelled");
	assert.equal(service.sessions.snapshot(input.session.sessionId).active, null);
	assert.equal(service.sessions.snapshot(input.session.sessionId).anchor.version, 0);
	assert.equal(service.sessions.snapshot(input.session.sessionId).records.length, 0);
});

test("[AK-SESSION-018] 本地受理明确拒绝清槽并记原拒绝，重投不伪装成功", async (t) => {
	const service = await createFlowService({
		dataDirectory: await temporaryWorkspace(t),
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: scriptedModel([]).adapter,
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	const input = await service.frames.initial({
		runId: "invalid",
		goal: "question",
		nowMs: now,
		deadlineAtMs: now + 15000,
	});
	const invalid = { ...input, event: { ...input.event, sequence: 2 } };
	assert.throws(() => service.sessions.admit(invalid), /FLOW_ADMISSION_INVALID/);
	assert.equal(service.sessions.snapshot(input.session.sessionId).active, null);
	assert.equal(service.sessions.snapshot(input.session.sessionId).anchor.version, 0);
	assert.equal(service.store.load("invalid"), null);
	assert.throws(() => service.sessions.admit(invalid), /FLOW_ADMISSION_INVALID/);
});
