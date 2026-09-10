import assert from "node:assert/strict";
import { test } from "node:test";
import { createContextAssembler } from "../../src/application/context-assembly-composition.ts";
import type { ContextPayload } from "../../src/contracts/control/context-engine/assembly-candidate.ts";
import { decodeCandidate, encodeCandidate } from "../../src/contracts/control/context-engine/candidate-codec.ts";
import { flowId } from "../../src/contracts/flow-value.ts";
import { PiContextAdapter } from "../../src/infrastructure/adapters/pi-context/pi-context-adapter.ts";
import { contextFixture } from "../support/context-assembly.ts";

test("[AK-CTX-115] 完整候选解码拒绝旧格式、摘要、绑定及Trace损坏并保持软预算", async (context) => {
	const fixture = contextFixture(context);
	const history = fixture.history([fixture.record("run:old", "event:user", 1, { role: "user", text: "历史任务" })]);
	const candidate = await createContextAssembler(
		{ artifacts: fixture.artifacts, reader: history.reader },
		"causal-budget",
	).assemble(history.basis, new AbortController().signal);
	const encoded = encodeCandidate(candidate);
	assert.deepEqual(decodeCandidate(fixture.store.get(fixture.store.put(encoded)), candidate), candidate);
	assert.throws(() => decodeCandidate({ sessionId: "s", frame: {}, tools: [] }, candidate), {
		code: "FORMAT_UNSUPPORTED",
	});
	assert.throws(() => decodeCandidate(encoded, { ...candidate, inputDigest: "wrong" }), { code: "BINDING_MISMATCH" });
	assert.throws(
		() =>
			decodeCandidate(
				{ ...encoded, candidate: { ...candidate, payload: { ...candidate.payload, task: "被改写" } } },
				candidate,
			),
		{ code: "DIGEST_MISMATCH" },
	);
	assert.throws(
		() =>
			decodeCandidate(
				{ ...encoded, candidate: { ...candidate, trace: { ...candidate.trace, records: [] } } },
				candidate,
			),
		{ code: "SCHEMA_INVALID" },
	);
	assert.throws(() => decodeCandidate({ ...encoded, candidate: { ...candidate, extra: true } }, candidate), {
		code: "SCHEMA_INVALID",
	});
	const malformed = { ...candidate.payload, messages: [{ role: "unrecognized", text: "不得过滤" }] };
	assert.throws(() => new PiContextAdapter().toModelInput(malformed as unknown as ContextPayload), {
		code: "SCHEMA_INVALID",
	});
	const malformedCandidate = { ...candidate, payload: malformed, payloadDigest: flowId("ctx-payload", malformed) };
	assert.throws(() => decodeCandidate({ ...encoded, candidate: malformedCandidate }, malformedCandidate), {
		code: "SCHEMA_INVALID",
	});
	const soft = await createContextAssembler(
		{ artifacts: fixture.artifacts, reader: history.reader },
		"causal-budget",
	).assemble(
		{ ...history.basis, limits: { ...history.basis.limits, inputTokenLimit: 1 } },
		new AbortController().signal,
	);
	assert.equal(decodeCandidate(encodeCandidate(soft), soft).tokenAccounting.budgetStatus, "required_over_target");
});

test("[AK-CTX-116] 已恢复工具映射与原记录位置必须一一对应", async (context) => {
	const fixture = contextFixture(context);
	const call = { originAgentRunId: "run:old", modelCommandId: "model:1", callId: "same" };
	const request = fixture.record("run:old", "event:assistant", 1, {
		role: "assistant",
		stopReason: "tool_use",
		content: [{ type: "tool_call", toolCallId: "same", toolName: "read", arguments: {} }],
	});
	const result = fixture.record("run:old", "event:tool", 2, {
		role: "tool",
		toolCallId: "same",
		toolName: "read",
		text: "原文",
		isError: false,
	});
	const history = fixture.history([
		{ ...request, callBindings: [{ identity: call, side: "request", blockOrdinal: 0 }] },
		{ ...result, callBindings: [{ identity: call, side: "result", blockOrdinal: null }] },
	]);
	const candidate = await createContextAssembler(
		{ artifacts: fixture.artifacts, reader: history.reader },
		"causal-budget",
	).assemble(history.basis, new AbortController().signal);
	assert.deepEqual(decodeCandidate(encodeCandidate(candidate), candidate), candidate);
	const mapping = candidate.trace.toolCalls[0]!;
	const changed = {
		...candidate,
		trace: { ...candidate.trace, toolCalls: [{ ...mapping, resultRecordRef: mapping.requestRecordRef }] },
	};
	assert.throws(() => decodeCandidate({ schemaVersion: "ctx-candidate-1", candidate: changed }, candidate), {
		code: "SCHEMA_INVALID",
	});
});
