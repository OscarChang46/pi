import fs from "node:fs";
import path from "node:path";
import { packageRoot } from "./verification.mjs";

const supportedReporters = new Set(["text", "html", "json-summary", "lcov"]);

function demand(condition, message) {
	if (!condition) throw new Error(message);
}

function demandRecord(value, name) {
	demand(value !== null && typeof value === "object" && !Array.isArray(value), `${name} 必须是对象`);
}

function demandOnlyKeys(value, allowedKeys, name) {
	for (const key of Object.keys(value)) demand(allowedKeys.includes(key), `${name} 包含未知字段: ${key}`);
}

function demandStringArray(value, name, allowEmpty = false) {
	demand(Array.isArray(value) && (allowEmpty || value.length > 0), `${name} 必须是${allowEmpty ? "" : "非空"}字符串数组`);
	demand(value.every((entry) => typeof entry === "string" && entry.length > 0), `${name} 包含无效值`);
	demand(new Set(value).size === value.length, `${name} 包含重复值`);
}

function demandPercentage(value, name) {
	demand(Number.isFinite(value) && value >= 0 && value <= 100, `${name} 必须是 0 到 100 之间的数字`);
}

export function validateCoverageConfig(value, root = packageRoot) {
	demandRecord(value, "覆盖率配置");
	demandOnlyKeys(value, ["schemaVersion", "source", "reports", "gate"], "覆盖率配置");
	demand(value.schemaVersion === 1, "不支持的覆盖率配置版本");

	demandRecord(value.source, "source");
	demandOnlyKeys(value.source, ["include", "exclude", "includeUncovered"], "source");
	demandStringArray(value.source.include, "source.include");
	demandStringArray(value.source.exclude, "source.exclude", true);
	demand(typeof value.source.includeUncovered === "boolean", "source.includeUncovered 必须是布尔值");

	demandRecord(value.reports, "reports");
	demandOnlyKeys(value.reports, ["directory", "reporters"], "reports");
	demand(typeof value.reports.directory === "string" && value.reports.directory.length > 0, "reports.directory 无效");
	demandStringArray(value.reports.reporters, "reports.reporters");
	demand(value.reports.reporters.every((reporter) => supportedReporters.has(reporter)), "reports.reporters 包含不支持的报告器");
	demand(value.reports.reporters.includes("json-summary"), "门禁结果要求启用 json-summary 报告器");

	demandRecord(value.gate, "gate");
	demandOnlyKeys(value.gate, ["lines", "branches"], "gate");
	demandPercentage(value.gate.lines, "gate.lines");
	demandPercentage(value.gate.branches, "gate.branches");

	const artifactsRoot = path.join(root, ".artifacts");
	const reportDirectory = path.resolve(root, value.reports.directory);
	const relativeReportPath = path.relative(artifactsRoot, reportDirectory);
	demand(
		relativeReportPath.length > 0 && !relativeReportPath.startsWith("..") && !path.isAbsolute(relativeReportPath),
		"reports.directory 必须位于本包 .artifacts 的子目录",
	);
	return {
		schemaVersion: value.schemaVersion,
		source: { ...value.source },
		reports: { ...value.reports, reportDirectory },
		gate: { ...value.gate },
	};
}

export function loadCoverageConfig(configPath = path.join(packageRoot, "coverage.config.json")) {
	return validateCoverageConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
}
