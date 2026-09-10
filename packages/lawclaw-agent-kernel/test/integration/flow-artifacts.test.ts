import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { createModels, fauxAssistantMessage, fauxProvider } from "@earendil-works/pi-ai";
import { PiAgentAdapter } from "../../src/cognitive/adapters/pi-agent-adapter.ts";
import type { ContextPayload } from "../../src/contracts/control/context-engine/assembly-candidate.ts";
import { PiContextAdapter } from "../../src/infrastructure/adapters/pi-context/pi-context-adapter.ts";
import { SqliteFlowArtifacts } from "../../src/infrastructure/adapters/sqlite-flow-artifacts.ts";
import { AgentRunDatabase } from "../../src/infrastructure/state-storage/adapters/run-registry/agent-run-database.ts";
import { TestClock, temporaryWorkspace } from "../support/harness.ts";
import { testContext } from "../support/test-context.ts";

test("[AK-FE-021] Artifact重开验证内容摘要并隔离作用域", async (t) => {
	const directory = await temporaryWorkspace(t);
	let db = new AgentRunDatabase(join(directory, "flow.sqlite"));
	const body = { text: "中文", cost: 0.125 };
	const ref = new SqliteFlowArtifacts(db, "a").put(body);
	db.close();
	db = new AgentRunDatabase(join(directory, "flow.sqlite"));
	t.after(() => db.close());
	const store = new SqliteFlowArtifacts(db, "a");
	assert.deepEqual(store.get(ref), body);
	assert.throws(() => new SqliteFlowArtifacts(db, "b").get(ref), /NOT_FOUND/);
	assert.throws(() => store.get({ ...ref, bytes: ref.bytes + 1 }), /CORRUPT/);
	db.write("UPDATE flow_artifacts SET body=? WHERE id=?", "{}", ref.id);
	assert.throws(() => store.get(ref), /CORRUPT/);
});

test("[AK-FE-022] Pi 从 SQLite 规范载荷恢复并只派发候选正文", async (t) => {
	const directory = await temporaryWorkspace(t);
	let db = new AgentRunDatabase(join(directory, "flow.sqlite"));
	const payload: ContextPayload = {
		system: "test",
		task: "continue",
		messages: [
			{ role: "user", text: "original task" },
			{ role: "assistant", content: [{ type: "text", text: "persisted answer" }], stopReason: "stop" },
		],
		materials: [],
		memory: [],
		tools: [],
	};
	const ref = new SqliteFlowArtifacts(db, "a").put(payload);
	db.close();
	db = new AgentRunDatabase(join(directory, "flow.sqlite"));
	t.after(() => db.close());
	const restored = new SqliteFlowArtifacts(db, "a").get(ref) as ContextPayload;
	assert.throws(() => new SqliteFlowArtifacts(db, "b").get(ref), /NOT_FOUND/);
	const faux = fauxProvider({ models: [{ id: "restore-test" }] });
	faux.setResponses([fauxAssistantMessage("second")]);
	const models = createModels();
	models.setProvider(faux.provider);
	const clock = new TestClock();
	const mapper = new PiContextAdapter();
	let mapped = false;
	const adapter = new PiAgentAdapter(
		faux.getModel(),
		models.streamSimple.bind(models),
		{ maxRetries: 0 },
		clock,
		(input) => {
			assert.deepEqual(input, payload);
			const converted = mapper.toModelInput(input);
			assert.equal(converted.messages.length, 3);
			assert.match(JSON.stringify(converted.messages), /persisted answer/);
			mapped = true;
			return converted;
		},
	);
	let completed = false;
	for await (const event of adapter.executeTurn(
		testContext(clock),
		{ sessionId: "s", payload: restored, formatVersion: "ctx-input-1", modelAdapterVersion: "pi-context-1" },
		new AbortController().signal,
	)) {
		if (event.type === "turn_completed") {
			completed = true;
			assert.equal("runtimeMessageRef" in event.message, false);
		}
	}
	assert.equal(mapped, true);
	assert.equal(completed, true);
});
