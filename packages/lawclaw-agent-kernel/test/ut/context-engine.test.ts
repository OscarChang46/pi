import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryContextDependencies } from "../../src/application/context-assembly-composition.ts";
import type { ContextItem } from "../../src/contracts/index.ts";
import { createRunContextBasis, runtimeAssemblyLimits } from "../../src/control/context-engine/run-context-basis.ts";

function fixture(items: readonly ContextItem[] = []) {
	const dependencies = createInMemoryContextDependencies();
	const basis = createRunContextBasis(dependencies.artifacts, {
		runInput: { kind: "initial", preparationId: "prepare:test", plannedRunId: "run:test" },
		sessionInput: {
			kind: "create",
			intent: {
				logicalKey: "session:test",
				agentDefinitionRef: "agent:test",
				contextPolicyRef: "policy:test",
				parent: null,
			},
		},
		system: "system",
		task: "task",
		tools: [],
		items,
		limits: runtimeAssemblyLimits(100, 10, 100000),
		configVersion: "config:test",
		envelopeRef: "envelope:test",
	});
	return { ...dependencies, basis, signal: new AbortController().signal };
}

test("[AK-CTX-003] 必选超 Token 软目标仍保留，字节超限明确失败", async () => {
	const f = fixture([
		{
			itemId: "required",
			sourceRef: "policy:required",
			kind: "instruction",
			content: "constraint".repeat(1000),
			priority: 1,
			required: true,
			classification: "internal",
		},
	]);
	const candidate = await f.engineFactory.create([]).assemble(f.basis, f.signal);
	assert.equal(candidate.tokenAccounting.budgetStatus, "required_over_target");
	assert.equal(candidate.payload.materials.length, 1);
	await assert.rejects(
		f.engineFactory.create([]).assemble({ ...f.basis, limits: { ...f.basis.limits, maxBytes: 100 } }, f.signal),
	);
});

test("[AK-CTX-004] 重组失败不会修改已冻结的原候选", async () => {
	const f = fixture();
	const candidate = await f.engineFactory.create([]).assemble(f.basis, f.signal);
	const before = JSON.stringify(candidate);
	await assert.rejects(
		f.engineFactory.create([]).assemble(
			{
				...f.basis,
				runInput: { kind: "existing", runId: "run:test", sourceRunVersion: 1, transcriptHeadRef: "head:missing" },
			},
			f.signal,
		),
	);
	assert.equal(JSON.stringify(candidate), before);
	assert.ok(Object.isFrozen(candidate.payload.messages));
});

test("[AK-CTX-001] 新 CE 保留必选资料并停止加入超过软目标的可选资料", async () => {
	const f = fixture([
		{
			itemId: "required",
			sourceRef: "policy:1",
			kind: "instruction",
			content: "required",
			priority: 100,
			required: true,
			classification: "internal",
		},
		{
			itemId: "optional-low",
			sourceRef: "doc:low",
			kind: "document",
			content: "optional".repeat(1000),
			priority: 1,
			required: false,
			classification: "internal",
		},
	]);
	const candidate = await f.engineFactory.create([]).assemble(f.basis, f.signal);
	assert.deepEqual(
		candidate.payload.materials.map((item) => item.sourceRef),
		["required"],
	);
	assert.equal(candidate.trace.records.length, 2);
});

test("[AK-CTX-002] 来源准备拒绝将 Secret 内联到 CE", () => {
	assert.throws(
		() =>
			fixture([
				{
					itemId: "secret",
					sourceRef: "secret:1",
					kind: "document",
					content: "secret",
					priority: 1,
					required: true,
					classification: "secret",
				},
			]),
		/Secret/,
	);
});
