import assert from "node:assert/strict";
import test from "node:test";
import { validateCoverageConfig } from "./coverage-config.mjs";
import { createGateReport } from "./coverage-gate.mjs";

const validConfig = {
	schemaVersion: 1,
	source: { include: ["src/**/*.ts"], exclude: ["src/**/*.d.ts"], includeUncovered: true },
	reports: { directory: ".artifacts/coverage", reporters: ["json-summary"] },
	gate: { lines: 69, branches: 81 },
};

test("覆盖率配置拒绝未知字段和越界报告目录", () => {
	assert.throws(() => validateCoverageConfig({ ...validConfig, extra: true }), /未知字段/);
	assert.throws(
		() => validateCoverageConfig({ ...validConfig, reports: { ...validConfig.reports, directory: "../coverage" } }),
		/必须位于本包/,
	);
});

test("覆盖率门禁分别评估行和分支指标", () => {
	const report = createGateReport({
		generatedAt: "2026-09-07T00:00:00.000Z",
		mode: "gate",
		commandStatus: 0,
		summary: {
			total: {
				lines: { total: 100, covered: 70, pct: 70 },
				branches: { total: 100, covered: 80, pct: 80 },
			},
		},
		thresholds: { lines: 69, branches: 81 },
	});
	assert.equal(report.checks.lines.passed, true);
	assert.equal(report.checks.branches.passed, false);
	assert.equal(report.success, false);
});

test("报告模式保留门槛诊断但不因覆盖率不足失败", () => {
	const input = {
		generatedAt: "2026-09-07T00:00:00.000Z",
		mode: "report",
		commandStatus: 0,
		summary: {
			total: {
				lines: { total: 10, covered: 1, pct: 10 },
				branches: { total: 10, covered: 1, pct: 10 },
			},
		},
		thresholds: { lines: 69, branches: 81 },
	};
	const report = createGateReport(input);
	assert.equal(report.thresholdsPassed, false);
	assert.equal(report.success, true);
	const failedExecutionReport = createGateReport({ ...input, commandStatus: 1 });
	assert.deepEqual(failedExecutionReport.execution, { status: "failed", exitCode: 1 });
	assert.equal(failedExecutionReport.success, false);
});
