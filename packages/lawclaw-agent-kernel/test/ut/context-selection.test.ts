import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssemblyAlgorithmInput } from "../../src/contracts/control/context-engine/assembly-contract.ts";
import { CausalBudgetAssemblyAlgorithm } from "../../src/control/context-engine/algorithms/causal-budget-assembly-algorithm.ts";
import { PiRecentHistoryAssemblyAlgorithm } from "../../src/control/context-engine/algorithms/pi-recent-history-assembly-algorithm.ts";

function input(): AssemblyAlgorithmInput {
	const costs: Readonly<Record<string, number>> = { required: 60, H2: 25, H1: 30, M1: 10 };
	return {
		units: Object.keys(costs).map((id) => ({ unitRef: id, memberRefs: [`record:${id}`] })),
		dependencies: [],
		requiredRecordRefs: ["record:required"],
		optionalUnitOrder: ["H2", "H1", "M1"],
		historyRecords: [],
		limits: {
			inputTokenLimit: 100,
			modelWindowTokens: 1000,
			outputReserveTokens: 100,
			estimatorMarginTokens: 0,
			maxBytes: 1000,
			maxWorkingBytes: 1000,
			maxCandidateBytes: 1000,
			maxSources: 10,
			maxRecords: 10,
			maxEdges: 10,
		},
		estimateSelection: (refs) => ({
			inputTokens: refs.reduce((sum, id) => sum + costs[id]!, 0),
			inputBytes: refs.length * 10,
			inheritedTokens: 0,
			inheritedTargetTokens: 0,
		}),
	};
}

test("[AK-CTX-201] 固定估算表选择95且拒绝试选不会污染已选集合", () => {
	const selection = new CausalBudgetAssemblyAlgorithm().select(input());
	assert.deepEqual(selection.selectedUnitRefs, ["required", "H2", "M1"]);
	assert.deepEqual(
		selection.decisions.find((item) => item.unitRef === "H1"),
		{ unitRef: "H1", decision: "drop", reason: "budget" },
	);
	const base = input();
	let estimates = 0;
	const over = new CausalBudgetAssemblyAlgorithm().select({
		...base,
		estimateSelection: (refs) => {
			estimates++;
			return { ...base.estimateSelection(refs), inputTokens: 101 };
		},
	});
	assert.deepEqual(over.selectedUnitRefs, ["required"]);
	assert.equal(estimates, 1);
});

test("[AK-CTX-202] 可选闭包不能只保留依赖方而丢前驱", () => {
	const base = input();
	const selection = new CausalBudgetAssemblyAlgorithm().select({
		...base,
		dependencies: [{ fromRecordRef: "record:H2", toRecordRef: "record:H1", kind: "requires" }],
	});
	assert.deepEqual(selection.selectedUnitRefs, ["required", "H1", "M1"]);
	assert.equal(selection.decisions.find((item) => item.unitRef === "H2")?.decision, "drop");
});

test("[AK-CTX-203] Pi未知后缀拒绝且空后缀不等于首条", () => {
	const base = input();
	const historyRecords = [
		{ recordRef: "record:H2", message: { role: "user" as const, text: "H2" } },
		{ recordRef: "record:H1", message: { role: "user" as const, text: "H1" } },
	];
	const invalid = new PiRecentHistoryAssemblyAlgorithm({ selectCut: () => ({ firstKeptRecordRef: "unknown" }) });
	assert.throws(() => invalid.select({ ...base, historyRecords }), { code: "SCHEMA_INVALID" });
	const empty = new PiRecentHistoryAssemblyAlgorithm({ selectCut: () => ({ firstKeptRecordRef: null }) });
	assert.deepEqual(empty.select({ ...base, historyRecords }).selectedUnitRefs, ["required", "M1"]);
});
