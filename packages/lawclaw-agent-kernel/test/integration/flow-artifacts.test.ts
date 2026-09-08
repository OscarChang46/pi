import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { PiAgentAdapter } from "../../src/cognitive/adapters/pi-agent-adapter.ts";
import type { ContextFrame, KernelAssistantMessage } from "../../src/contracts/index.ts";
import { FlowSqliteDatabase } from "../../src/infrastructure/adapters/flow-sqlite-database.ts";
import { SqliteAdapterMessages, SqliteFlowArtifacts } from "../../src/infrastructure/adapters/sqlite-flow-artifacts.ts";
import { TestClock, temporaryWorkspace } from "../support/harness.ts";
import { testContext } from "../support/test-context.ts";

test("[AK-FE-021] Artifact重开验证内容摘要并隔离作用域", async (t) => {
	const directory = await temporaryWorkspace(t);
	let db = new FlowSqliteDatabase(join(directory, "flow.sqlite"));
	const body = { text: "中文", cost: 0.125 };
	const ref = new SqliteFlowArtifacts(db, "a").put(body);
	db.close();
	db = new FlowSqliteDatabase(join(directory, "flow.sqlite"));
	t.after(() => db.close());
	const store = new SqliteFlowArtifacts(db, "a");
	assert.deepEqual(store.get(ref), body);
	assert.throws(() => new SqliteFlowArtifacts(db, "b").get(ref), /NOT_FOUND/);
	assert.throws(() => store.get({ ...ref, bytes: ref.bytes + 1 }), /CORRUPT/);
	db.write("UPDATE flow_artifacts SET body=? WHERE id=?", "{}", ref.id);
	assert.throws(() => store.get(ref), /CORRUPT/);
});

test("[AK-FE-022] Pi新Adapter从SQLite恢复私有历史消息并拒绝跨租户读取", async (t) => {
	const directory = await temporaryWorkspace(t);
	const db = new FlowSqliteDatabase(join(directory, "flow.sqlite"));
	t.after(() => db.close());
	const messages = new SqliteAdapterMessages(db, "a");
	const faux = fauxProvider({ models: [{ id: "restore-test" }] });
	faux.setResponses([fauxAssistantMessage("first"), fauxAssistantMessage("second")]);
	const models = createModels();
	models.setProvider(faux.provider);
	const clock = new TestClock();
	const frame: ContextFrame = {
		frameId: "frame",
		systemPrompt: "test",
		messages: [{ role: "user", text: "test" }],
		estimatedTokens: 1,
		reductionTrace: {
			droppedItemIds: [],
			selectedItemIds: [],
			reasonCodes: [],
			estimatedTokensBefore: 1,
			estimatedTokensAfter: 1,
		},
	};
	const first = new PiAgentAdapter(
		faux.getModel(),
		models.streamSimple.bind(models),
		{ maxRetries: 0, maxPrivateMessages: 1 },
		clock,
		messages,
	);
	let assistant: KernelAssistantMessage | undefined;
	for await (const event of first.executeTurn(
		testContext(clock),
		{ sessionId: "s", frame, tools: [] },
		new AbortController().signal,
	)) {
		if (event.type === "turn_completed") assistant = event.message;
	}
	assert.ok(assistant);
	const recovered = new PiAgentAdapter(
		faux.getModel(),
		models.streamSimple.bind(models),
		{ maxRetries: 0, maxPrivateMessages: 1 },
		clock,
		messages,
	);
	const request = {
		sessionId: "s",
		frame: { ...frame, messages: [...frame.messages, assistant, { role: "user" as const, text: "continue" }] },
		tools: [],
	};
	let completed = false;
	for await (const event of recovered.executeTurn(testContext(clock), request, new AbortController().signal)) {
		if (event.type === "turn_completed") completed = true;
	}
	assert.equal(completed, true);
	assert.equal(messages.get("other", assistant.runtimeMessageRef), null);
	assert.throws(() => messages.put("tenant-test", assistant.runtimeMessageRef, {}), /CONFLICT/);
	const context = testContext(clock);
	await assert.rejects(async () => {
		for await (const _event of recovered.executeTurn(
			{ ...context, tenant: { ...context.tenant, tenantId: "other" } },
			request,
			new AbortController().signal,
		)) {
			/* 只观察是否拒绝 */
		}
	}, /私有消息引用/);
});
