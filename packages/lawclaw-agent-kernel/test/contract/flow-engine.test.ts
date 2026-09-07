import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalize, flowDigest } from "../../src/control/flow-engine/canonical.ts";
import { FlowEngine } from "../../src/control/flow-engine/flow-engine.ts";
import { flowExamples, flowInput } from "../support/flow-engine-fixtures.ts";

test("[AK-FE-001] FE-CON-1八个独立设计向量与实际Core完整输出一致", () => {
	const engine = new FlowEngine();
	for (const example of flowExamples.cases)
		assert.deepEqual(engine.advance(flowInput(example.id)), example.expected, example.id);
});

test("[AK-FE-002] FE-C14N-1固定字节与摘要保持跨实现一致", () => {
	for (const vector of flowExamples.canonicalVectors) {
		assert.equal(canonicalize(vector.value), vector.canonical);
		assert.equal(flowDigest(vector.value), vector.digest);
	}
	assert.equal(canonicalize(Number.MAX_SAFE_INTEGER), "9007199254740991");
	assert.equal(canonicalize(-Number.MAX_SAFE_INTEGER), "-9007199254740991");
	assert.equal(canonicalize({ "2": 2, "10": 10 }), '{"10":10,"2":2}');
});

test("[AK-FE-003] 非JSON值与超界输入不能被规范化为合法摘要", () => {
	const cycle: Record<string, unknown> = {};
	cycle.self = cycle;
	let reads = 0;
	const accessor = Object.defineProperty({}, "field", { enumerable: true, get: () => ++reads });
	for (const value of [
		undefined,
		1.5,
		-0,
		Infinity,
		NaN,
		Number.MAX_SAFE_INTEGER + 1,
		1n,
		"\ud800",
		"\udc00",
		cycle,
		accessor,
		new Date(0),
		new Array(2),
		{ x: undefined },
		"x".repeat(2097153),
	])
		assert.throws(() => canonicalize(value), TypeError);
	assert.equal(reads, 0);
});

test("[AK-FE-004] A-B-A交错推进稳定且输出不共享可变输入", () => {
	const engine = new FlowEngine();
	const input = flowInput();
	const before = structuredClone(input);
	const first = engine.advance(input);
	engine.advance(flowInput("V7"));
	assert.deepEqual(engine.advance(input), first);
	assert.deepEqual(new FlowEngine().advance(input), first);
	assert.deepEqual(input, before);
	assert.equal(Object.isFrozen(input.run), false);
	assert.ok(first.kind === "advance");
	assert.ok(Object.isFrozen(first.decision.next.usage));
	assert.ok(Object.isFrozen(first.decision.commands[0].payload));
	assert.notEqual(first.decision.next.usage, input.run.usage);
	assert.deepEqual(
		engine.advance({
			...input,
			operation: { ...input.operation, requestId: "other", correlationId: "other", traceparent: "other" },
		}),
		first,
	);
});
