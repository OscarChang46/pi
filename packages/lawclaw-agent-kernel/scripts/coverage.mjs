import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCoverageConfig } from "./coverage-config.mjs";
import { createGateReport } from "./coverage-gate.mjs";
import { execute, isolatedEnvironment, packageRoot, validate } from "./verification.mjs";

const coverageTimeoutMs = 180_000;

function parseMode(argumentsToParse) {
	if (argumentsToParse.length !== 2 || argumentsToParse[0] !== "--mode") {
		throw new Error("用法: node scripts/coverage.mjs --mode report|gate");
	}
	const mode = argumentsToParse[1];
	if (mode !== "report" && mode !== "gate") throw new Error(`未知覆盖率模式: ${mode}`);
	return mode;
}

function resolveTestFiles() {
	const manifest = JSON.parse(
		fs.readFileSync(path.join(packageRoot, "docs/verification/acceptance.json"), "utf8"),
	);
	const cases = validate(packageRoot, manifest);
	return [...new Set(cases.map((testCase) => path.join(packageRoot, testCase.file)))].sort();
}

function demandSafeReportPath(reportDirectory) {
	const relativePath = path.relative(packageRoot, reportDirectory);
	let currentPath = packageRoot;
	for (const segment of relativePath.split(path.sep)) {
		currentPath = path.join(currentPath, segment);
		if (fs.existsSync(currentPath) && fs.lstatSync(currentPath).isSymbolicLink()) {
			throw new Error(`覆盖率报告路径不能经过符号链接: ${currentPath}`);
		}
	}
}

function buildC8Arguments(config) {
	const c8Arguments = [fileURLToPath(import.meta.resolve("c8/bin/c8.js"))];
	if (config.source.includeUncovered) c8Arguments.push("--all");
	for (const include of config.source.include) c8Arguments.push(`--include=${include}`);
	for (const exclude of config.source.exclude) c8Arguments.push(`--exclude=${exclude}`);
	c8Arguments.push("--exclude-after-remap", `--reports-dir=${config.reports.reportDirectory}`);
	for (const reporter of config.reports.reporters) c8Arguments.push(`--reporter=${reporter}`);
	c8Arguments.push(
		process.execPath,
		"--import",
		import.meta.resolve("tsx"),
		"--test",
		"--test-concurrency=1",
		"--test-timeout=90000",
		...resolveTestFiles(),
	);
	return c8Arguments;
}

async function runCoverage(mode) {
	const config = loadCoverageConfig();
	demandSafeReportPath(config.reports.reportDirectory);
	const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "lawclaw-coverage-"));
	try {
		const result = await execute(process.execPath, buildC8Arguments(config), {
			cwd: packageRoot,
			env: isolatedEnvironment(temporaryDirectory),
			timeout: coverageTimeoutMs,
		});
		process.stdout.write(result.stdout);
		process.stderr.write(result.stderr);
		if (result.failure) throw new Error(`覆盖率统计失败: ${result.failure}`);
		const summaryPath = path.join(config.reports.reportDirectory, "coverage-summary.json");
		const gateReport = createGateReport({
			generatedAt: new Date().toISOString(),
			mode,
			commandStatus: result.code ?? 1,
			summary: JSON.parse(fs.readFileSync(summaryPath, "utf8")),
			thresholds: config.gate,
		});
		fs.writeFileSync(path.join(config.reports.reportDirectory, "gate-report.json"), `${JSON.stringify(gateReport, null, 2)}\n`);
		console.log(
			`覆盖率门禁: 行 ${gateReport.checks.lines.actual}%/${gateReport.checks.lines.minimum}%，` +
				`分支 ${gateReport.checks.branches.actual}%/${gateReport.checks.branches.minimum}%；` +
				`${mode === "report" ? "仅报告" : gateReport.success ? "通过" : "失败"}`,
		);
		console.log(`覆盖率报告: ${config.reports.reportDirectory}`);
		return gateReport.success ? 0 : 1;
	} finally {
		fs.rmSync(temporaryDirectory, { recursive: true, force: true });
	}
}

try {
	process.exitCode = await runCoverage(parseMode(process.argv.slice(2)));
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
