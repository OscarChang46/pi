import assert from "node:assert/strict";
import test from "node:test";
import { createTimingSummary, renderTimingMarkdown } from "./test-all-summary.mjs";

const report = {
	startedAt: "2026-09-08T00:00:00.000Z",
	nodeVersion: "v24.19.0",
	success: true,
	testFileCount: 3,
	problems: [],
	cases: [
		{ id: "AK-A-001", level: "ut", selected: true, result: "passed", durationMs: 10, file: "test/ut/a.test.ts" },
		{ id: "AK-A-002", level: "ut", selected: true, result: "passed", durationMs: 20, file: "test/ut/a.test.ts" },
		{ id: "AK-B-001", level: "dt", selected: true, result: "passed", durationMs: 30, file: "test/dt/b.test.ts" },
		{ id: "AK-C-001", level: "system", selected: false, result: "not_covered", durationMs: 100, file: "test/system/c.test.ts" },
	],
};

test("全量耗时汇总区分墙钟、用例和框架开销", () => {
	const summary = createTimingSummary(report, 100, "2026-09-08T00:00:00.100Z");
	assert.deepEqual(
		{ total: summary.totals.total, durationMs: summary.accumulatedCaseDurationMs, overheadMs: summary.overheadDurationMs },
		{ total: 3, durationMs: 60, overheadMs: 40 },
	);
	assert.deepEqual(
		summary.levels.map(({ level, total }) => ({ level, total })),
		[
			{ level: "ut", total: 2 },
			{ level: "dt", total: 1 },
			{ level: "contract", total: 0 },
			{ level: "integration", total: 0 },
			{ level: "system", total: 0 },
		],
	);
	assert.equal(summary.slowestCases[0].name, "AK-B-001");
	assert.equal(summary.testFileCount, 3);
	assert.match(renderTimingMarkdown(summary), /墙钟时间：100 ms/);
});

test("全量耗时汇总拒绝没有选中用例的报告", () => {
	assert.throws(
		() => createTimingSummary({ ...report, cases: [] }, 100, "2026-09-08T00:00:00.100Z"),
		/没有选中用例/,
	);
});
