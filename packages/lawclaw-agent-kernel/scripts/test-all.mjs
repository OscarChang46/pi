import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { createTimingSummary, renderTimingMarkdown } from "./test-all-summary.mjs";
import { execute, isolatedEnvironment, levels, packageRoot } from "./verification.mjs";

const fullTestTimeoutMs = 180_000;

function discoverTestFiles() {
	const testRoot = path.join(packageRoot, "test");
	if (!fs.existsSync(testRoot)) throw new Error("测试扫描目录不存在");
	const files = [];
	function visit(directory) {
		for (const entry of fs
			.readdirSync(directory, { withFileTypes: true })
			.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
			if (entry.isSymbolicLink()) throw new Error("测试目录不允许符号链接");
			const file = path.join(directory, entry.name);
			if (entry.isDirectory()) visit(file);
			else if (entry.name.endsWith(".test.ts")) {
				const relativeFile = path.relative(packageRoot, file).split(path.sep).join("/");
				const level = relativeFile.split("/")[1];
				if (!levels.includes(level)) throw new Error(`未分类测试文件: ${relativeFile}`);
				files.push({ file, relativeFile, level });
			}
		}
	}
	visit(testRoot);
	if (files.length === 0) throw new Error("测试扫描为空");
	return files;
}

function demandSafeReportPath(reportDirectory) {
	const relativePath = path.relative(packageRoot, reportDirectory);
	let currentPath = packageRoot;
	for (const segment of relativePath.split(path.sep)) {
		currentPath = path.join(currentPath, segment);
		if (fs.existsSync(currentPath) && fs.lstatSync(currentPath).isSymbolicLink()) {
			throw new Error(`全量测试报告路径不能经过符号链接: ${currentPath}`);
		}
	}
}

function parseTestCases(output, testFiles, problems) {
	const filesByRealPath = new Map(
		testFiles.map((testFile) => [fs.realpathSync(testFile.file), testFile]),
	);
	const cases = [];
	for (const line of output.split("\n").filter(Boolean)) {
		try {
			const event = JSON.parse(line);
			if (!event.file || !fs.existsSync(event.file)) throw new Error("测试事件缺少有效文件");
			const testFile = filesByRealPath.get(fs.realpathSync(event.file));
			if (!testFile) throw new Error("测试事件来自扫描范围外");
			const passed = event.type === "test:pass" && !event.skip && !event.todo;
			cases.push({
				id: event.name.match(/^\[(AK-[A-Z0-9]+-\d{3})\] /u)?.[1] ?? null,
				name: event.name,
				file: testFile.relativeFile,
				level: testFile.level,
				selected: true,
				result: passed ? "passed" : "failed",
				durationMs: Number.isFinite(event.durationMs) ? event.durationMs : 0,
				reason: event.skip || event.todo ? "required_case_skipped" : event.errorCode,
			});
		} catch (error) {
			problems.push(error instanceof Error ? error.message : "测试结果协议无法解析");
		}
	}
	if (cases.length === 0) problems.push("测试运行未产生用例结果");
	return cases;
}

function createTestReport(execution, testFiles, startedAt, finishedAt) {
	const problems = [];
	const cases = parseTestCases(execution.stdout, testFiles, problems);
	if (execution.code !== 0 || execution.failure) problems.push(execution.failure ?? "test_process_failed");
	for (const testCase of cases.filter((testCase) => testCase.result !== "passed")) {
		problems.push(`${testCase.id ?? testCase.name}: ${testCase.result}`);
	}
	return {
		schemaVersion: 1,
		startedAt,
		finishedAt,
		nodeVersion: process.version,
		success: problems.length === 0,
		testFileCount: testFiles.length,
		problems,
		cases,
	};
}

function saveReports(reportDirectory, testReport, timingSummary) {
	fs.mkdirSync(reportDirectory, { recursive: true });
	fs.writeFileSync(path.join(reportDirectory, "test-report.json"), `${JSON.stringify(testReport, null, 2)}\n`);
	fs.writeFileSync(path.join(reportDirectory, "timing-report.json"), `${JSON.stringify(timingSummary, null, 2)}\n`);
	fs.writeFileSync(path.join(reportDirectory, "timing-report.md"), renderTimingMarkdown(timingSummary));
}

async function runAllTests() {
	const startedAt = new Date().toISOString();
	const startedAtMs = performance.now();
	const reportDirectory = path.join(packageRoot, ".artifacts/test-all");
	demandSafeReportPath(reportDirectory);
	const testFiles = discoverTestFiles();
	const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lawclaw-test-all-"));
	try {
		const execution = await execute(
			process.execPath,
			[
				"--import",
				import.meta.resolve("tsx"),
				"--test",
				"--test-concurrency=1",
				"--test-timeout=90000",
				"--test-reporter",
				pathToFileURL(path.join(import.meta.dirname, "test-all-reporter.mjs")).href,
				...testFiles.map((testFile) => testFile.file),
			],
			{
				cwd: packageRoot,
				env: isolatedEnvironment(temporaryDirectory),
				timeout: fullTestTimeoutMs,
			},
		);
		const finishedAt = new Date().toISOString();
		const testReport = createTestReport(execution, testFiles, startedAt, finishedAt);
		const wallClockDurationMs = performance.now() - startedAtMs;
		const summary = createTimingSummary(testReport, wallClockDurationMs, finishedAt);
		saveReports(reportDirectory, testReport, summary);
		if (execution.stderr) process.stderr.write(execution.stderr);
		console.log(renderTimingMarkdown(summary));
		console.log(`详细报告: ${reportDirectory}`);
		return summary.success ? 0 : 1;
	} finally {
		fs.rmSync(temporaryDirectory, { recursive: true, force: true });
	}
}

try {
	process.exitCode = await runAllTests();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
