import assert from "node:assert/strict";
import { test } from "node:test";
import { createContextEngineFactory } from "../../src/application/context-assembly-composition.ts";
import type { FrozenHistorySource } from "../../src/contracts/control/context-engine/runtime-preparation.ts";
import { FrozenHistoryReader } from "../../src/control/context-engine/frozen-history-reader.ts";
import { contextFixture } from "../support/context-assembly.ts";

test("[AK-CTX-118] 冻结历史绑定确切版本且缺失来源不能当成空历史", async (t) => {
	const f = contextFixture(t);
	const anchor = { sessionId: "session:history", version: 3, headRef: "history:3" };
	const records = [f.record("run:past", "event:user", 0, { role: "user", text: "历史原文" })];
	const source: FrozenHistorySource = {
		binding: { kind: "session", anchor, recordRefs: null },
		result: { records, contents: [] },
	};
	const reader = new FrozenHistoryReader([source]);
	records.splice(0);
	anchor.version = 4;
	const request = {
		binding: { kind: "session" as const, anchor: { ...anchor, version: 3 }, recordRefs: null },
		sourceOrdinal: 7,
		limits: { maxRecords: 10, maxBytes: 10000 },
	};
	const result = await reader.read(request, new AbortController().signal);
	assert.equal(result.records[0]?.message?.role === "user" && result.records[0].message.text, "历史原文");
	assert.equal(result.records[0]?.orderKey.sourceOrdinal, 7);
	assert.ok(Object.isFrozen(result.records));
	await assert.rejects(
		reader.read({ ...request, binding: { ...request.binding, anchor } }, new AbortController().signal),
		{ code: "BINDING_MISMATCH" },
	);
	await assert.rejects(new FrozenHistoryReader([]).read(request, new AbortController().signal), {
		code: "BINDING_MISMATCH",
	});
	await assert.rejects(
		reader.read(
			{ ...request, binding: { ...request.binding, recordRefs: ["missing"] } },
			new AbortController().signal,
		),
		{ code: "BINDING_MISMATCH" },
	);
	await assert.rejects(
		reader.read({ ...request, limits: { maxRecords: 0, maxBytes: 10000 } }, new AbortController().signal),
		{ code: "CONTEXT_LIMIT" },
	);
	await assert.rejects(
		reader.read({ ...request, limits: { maxRecords: 10, maxBytes: 1 } }, new AbortController().signal),
		{ code: "CONTEXT_LIMIT" },
	);
	await assert.rejects(reader.read(request, AbortSignal.abort()), { code: "CANCELLED" });
});

test("[AK-CTX-119] 共享宿主组装入口隔离调用并拒绝缺失Run版本与父依赖", async (t) => {
	const f = contextFixture(t);
	const engineFactory = createContextEngineFactory(f.artifacts);
	const anchor = { sessionId: "session:history", version: 3, headRef: "history:3" };
	const user = f.record("run:past", "event:user", 0, { role: "user", text: "原始用户任务" });
	const answer = f.record("run:past", "event:answer", 1, {
		role: "assistant",
		content: [{ type: "text", text: "历史回答" }],
		stopReason: "stop",
	});
	const dependent = {
		...answer,
		dependencies: [{ fromRecordRef: answer.recordRef, toRecordRef: user.recordRef, kind: "requires" as const }],
	};
	const source: FrozenHistorySource = {
		binding: { kind: "session", anchor, recordRefs: null },
		result: { records: [user, dependent], contents: [] },
	};
	const basis = { ...f.basis, sessionInput: { kind: "existing" as const, anchor } };
	const [history, initial] = await Promise.all([
		engineFactory.create([source]).assemble(basis, new AbortController().signal),
		engineFactory.create([]).assemble(f.basis, new AbortController().signal),
	]);
	assert.equal(history.payload.messages.length, 2);
	assert.equal(history.trace.units.length, 1);
	assert.equal(initial.payload.messages.length, 0);
	assert.equal(initial.payload.task, history.payload.task);
	await assert.rejects(
		engineFactory.create([source]).assemble(
			{
				...basis,
				runInput: { kind: "existing", runId: "run:current", sourceRunVersion: 7, transcriptHeadRef: "head:7" },
			},
			new AbortController().signal,
		),
		{ code: "BINDING_MISMATCH" },
	);
	await assert.rejects(
		engineFactory.create([source]).assemble(
			{
				...f.basis,
				sessionInput: { kind: "read_only", source: anchor },
				parentContext: {
					parent: anchor,
					selectorRef: "selector:1",
					selectorVersion: "v1",
					candidateRefs: [answer.recordRef],
					requiredRefs: [],
					maxInheritedTokens: 1000,
				},
			},
			new AbortController().signal,
		),
		{ code: "SCHEMA_INVALID" },
	);
});
