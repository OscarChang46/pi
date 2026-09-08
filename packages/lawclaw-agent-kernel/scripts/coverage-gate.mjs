function demandMetric(summary, metricName) {
	const metric = summary?.total?.[metricName];
	if (
		!metric ||
		![metric.total, metric.covered, metric.pct].every(Number.isFinite) ||
		metric.total < 0 ||
		metric.covered < 0 ||
		metric.covered > metric.total ||
		metric.pct < 0 ||
		metric.pct > 100
	) {
		throw new Error(`覆盖率汇总缺少有效 ${metricName} 指标`);
	}
	return { total: metric.total, covered: metric.covered, percentage: metric.pct };
}

export function createGateReport({ generatedAt, mode, commandStatus, summary, thresholds }) {
	if (mode !== "report" && mode !== "gate") throw new Error(`未知覆盖率模式: ${mode}`);
	const metrics = {
		lines: demandMetric(summary, "lines"),
		branches: demandMetric(summary, "branches"),
	};
	const checks = {
		lines: {
			actual: metrics.lines.percentage,
			minimum: thresholds.lines,
			passed: metrics.lines.percentage >= thresholds.lines,
		},
		branches: {
			actual: metrics.branches.percentage,
			minimum: thresholds.branches,
			passed: metrics.branches.percentage >= thresholds.branches,
		},
	};
	const thresholdsPassed = checks.lines.passed && checks.branches.passed;
	return {
		schemaVersion: 1,
		generatedAt,
		mode,
		success: commandStatus === 0 && (mode === "report" || thresholdsPassed),
		execution: {
			status: commandStatus === 0 ? "passed" : "failed",
			exitCode: commandStatus,
		},
		thresholdsPassed,
		metrics,
		checks,
	};
}
