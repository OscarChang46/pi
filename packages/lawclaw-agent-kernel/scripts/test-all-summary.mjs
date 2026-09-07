import { levels } from "./verification.mjs";

function roundMilliseconds(durationMs) {
	return Number(durationMs.toFixed(3));
}

function testCaseLabel(testCase) {
	return testCase.id ?? testCase.name;
}

function summarizeCases(cases) {
	const durationMs = cases.reduce((total, testCase) => total + testCase.durationMs, 0);
	const slowest = [...cases].sort((left, right) => right.durationMs - left.durationMs)[0];
	return {
		total: cases.length,
		passed: cases.filter((testCase) => testCase.result === "passed").length,
		failed: cases.filter((testCase) => testCase.result !== "passed").length,
		durationMs: roundMilliseconds(durationMs),
		averageMs: roundMilliseconds(cases.length === 0 ? 0 : durationMs / cases.length),
		slowest: slowest ? { name: testCaseLabel(slowest), durationMs: roundMilliseconds(slowest.durationMs) } : null,
	};
}

export function createTimingSummary(report, wallClockDurationMs, finishedAt) {
	const selectedCases = report.cases.filter((testCase) => testCase.selected);
	if (selectedCases.length === 0) throw new Error("全量测试报告没有选中用例");
	const totals = summarizeCases(selectedCases);
	const roundedWallClockDurationMs = roundMilliseconds(wallClockDurationMs);
	return {
		schemaVersion: 1,
		startedAt: report.startedAt,
		finishedAt,
		nodeVersion: report.nodeVersion,
		success: report.success,
		testFileCount: report.testFileCount,
		wallClockDurationMs: roundedWallClockDurationMs,
		accumulatedCaseDurationMs: totals.durationMs,
		overheadDurationMs: roundMilliseconds(Math.max(0, roundedWallClockDurationMs - totals.durationMs)),
		totals,
		levels: levels.map((level) => ({ level, ...summarizeCases(selectedCases.filter((testCase) => testCase.level === level)) })),
		slowestCases: [...selectedCases]
			.sort((left, right) => right.durationMs - left.durationMs)
			.slice(0, 10)
			.map((testCase) => ({
				name: testCaseLabel(testCase),
				level: testCase.level,
				durationMs: roundMilliseconds(testCase.durationMs),
				file: testCase.file,
			})),
		problems: [...report.problems],
	};
}

export function renderTimingMarkdown(summary) {
	const lines = [
		"# Agent Kernel 全量测试耗时报告",
		"",
		`结果：${summary.success ? "通过" : "失败"}；测试文件：${summary.testFileCount}；用例：${summary.totals.total}；通过：${summary.totals.passed}；失败：${summary.totals.failed}`,
		`墙钟时间：${summary.wallClockDurationMs} ms；用例累计耗时：${summary.accumulatedCaseDurationMs} ms；框架及进程开销：${summary.overheadDurationMs} ms。`,
		"",
		"## 分层统计",
		"",
		"| 层级 | 用例 | 通过 | 失败 | 累计耗时(ms) | 平均耗时(ms) | 最慢用例 |",
		"|---|---:|---:|---:|---:|---:|---|",
	];
	for (const level of summary.levels) {
		lines.push(
			`| ${level.level} | ${level.total} | ${level.passed} | ${level.failed} | ${level.durationMs} | ${level.averageMs} | ${level.slowest?.name ?? "-"} |`,
		);
	}
	lines.push("", "## 最慢用例", "", "| 用例 | 层级 | 耗时(ms) | 文件 |", "|---|---|---:|---|");
	for (const testCase of summary.slowestCases) {
		lines.push(`| ${testCase.name} | ${testCase.level} | ${testCase.durationMs} | ${testCase.file} |`);
	}
	lines.push("", "## 问题", "", ...(summary.problems.length ? summary.problems.map((problem) => `- ${problem}`) : ["- 无"]), "");
	return lines.join("\n");
}
