import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const levels = ["ut", "dt", "contract", "integration", "system"];
const scripts = import.meta.dirname;
export const packageRoot = path.resolve(scripts, "..");

function demand(condition, message) {
	if (!condition) throw new Error(message);
}

export function discover(root) {
	const directory = path.join(root, "test");
	demand(fs.existsSync(directory), "测试扫描目录不存在");
	const files = [];
	function visit(current) {
		for (const entry of fs
			.readdirSync(current, { withFileTypes: true })
			.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
			demand(!entry.isSymbolicLink(), "测试目录不允许符号链接");
			const file = path.join(current, entry.name);
			if (entry.isDirectory()) visit(file);
			else if (entry.name.endsWith(".test.ts")) files.push(file);
		}
	}
	visit(directory);
	demand(files.length > 0, "测试扫描为空");
	const found = new Map();
	for (const file of files) {
		const relative = path.relative(root, file).split(path.sep).join("/");
		demand(levels.includes(relative.split("/")[1]), `未分类测试文件: ${relative}`);
		const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
		demand(source.parseDiagnostics.length === 0, `测试源码无法解析: ${relative}`);
		let count = 0;
		const registrations = new Set();
		for (const statement of source.statements) {
			if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
			const call = statement.expression;
			if (call.expression.getText(source) !== "test") continue;
			demand(
				call.arguments.length >= 2 && ts.isStringLiteral(call.arguments[0]),
				`用例名必须为静态字符串: ${relative}`,
			);
			const name = call.arguments[0].text;
			const id = name.match(/^\[(AK-[A-Z0-9]+-\d{3})\] /u)?.[1];
			demand(id, `用例缺少稳定 ID: ${relative}`);
			demand(!found.has(id), `重复用例 ID: ${id}`);
			found.set(id, { id, file: relative, level: relative.split("/")[1], name });
			registrations.add(call);
			count++;
		}
		function check(node) {
			if (ts.isIdentifier(node) && node.text === "test") {
				const parent = node.parent;
				demand(
					ts.isImportSpecifier(parent) ||
						(ts.isCallExpression(parent) && parent.expression === node && registrations.has(parent)),
					`禁止别名或非顶层 test 注册: ${relative}`,
				);
			}
			if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === "node:test") {
				const bindings = node.importClause?.namedBindings;
				demand(
					!node.importClause?.name &&
						bindings &&
						ts.isNamedImports(bindings) &&
						bindings.elements.every((e) => (e.name.text === "test" && !e.propertyName) || e.isTypeOnly),
					`只允许具名 test 注册: ${relative}`,
				);
			}
			if (ts.isCallExpression(node)) {
				const name = node.expression.getText(source);
				demand(
					!(name === "test" && !registrations.has(node)) && !/^(?:test\.|.*\.test$)/u.test(name),
					`禁止动态、嵌套或修饰用例注册: ${relative}`,
				);
			}
			ts.forEachChild(node, check);
		}
		check(source);
		demand(count > 0, `文件未发现用例: ${relative}`);
	}
	return found;
}

export function validate(root, manifest) {
	demand(
		manifest?.schemaVersion === 1 && Array.isArray(manifest.capabilities) && Array.isArray(manifest.requirements),
		"验收清单格式错误",
	);
	const capabilities = new Map();
	for (const c of manifest.capabilities) {
		demand(
			typeof c.id === "string" &&
				c.id &&
				typeof c.title === "string" &&
				["implemented", "partial", "planned"].includes(c.status),
			"能力登记不完整",
		);
		demand(!capabilities.has(c.id), `重复能力: ${c.id}`);
		capabilities.set(c.id, c);
	}
	const found = discover(root),
		mapped = new Map(),
		requirements = new Set();
	for (const r of manifest.requirements) {
		demand(typeof r.id === "string" && r.id.length > 0 && !requirements.has(r.id), `重复或无效验收项: ${r.id}`);
		requirements.add(r.id);
		demand(
			capabilities.has(r.capability) && typeof r.title === "string" && r.title && typeof r.risk === "string" && r.risk,
			`验收项缺少能力、要求或风险: ${r.id}`,
		);
		demand(
			["implemented", "planned"].includes(r.status) &&
				Array.isArray(r.levels) &&
				r.levels.length > 0 &&
				new Set(r.levels).size === r.levels.length &&
				r.levels.every((l) => levels.includes(l)) &&
				Array.isArray(r.cases),
			`验收项状态或层级错误: ${r.id}`,
		);
		if (r.status === "planned") {
			demand(r.cases.length === 0, `计划中验收项不得登记占位用例: ${r.id}`);
			continue;
		}
		demand(capabilities.get(r.capability).status !== "planned", `计划中能力不能登记已实现验收项: ${r.id}`);
		demand(r.cases.length > 0, `已实现验收项未覆盖: ${r.id}`);
		for (const c of r.cases) {
			demand(!mapped.has(c.id), `重复用例映射: ${c.id}`);
			const actual = found.get(c.id);
			demand(
				actual && actual.file === c.file && actual.level === c.level && r.levels.includes(c.level),
				`用例缺失或文件/层级映射失效: ${c.id}`,
			);
			mapped.set(c.id, { ...actual, requirement: r.id, capability: r.capability });
		}
		demand(
			r.levels.every((l) => r.cases.some((c) => c.level === l)),
			`验收项缺少要求层级的覆盖: ${r.id}`,
		);
	}
	for (const id of found.keys()) demand(mapped.has(id), `用例未登记: ${id}`);
	for (const c of capabilities.values()) {
		const owned = manifest.requirements.filter((r) => r.capability === c.id);
		demand(owned.length > 0, `能力没有验收项: ${c.id}`);
		demand(
			c.status !== "implemented" || owned.every((r) => r.status === "implemented"),
			`能力实现状态与验收项不一致: ${c.id}`,
		);
		demand(
			c.status !== "partial" ||
				(owned.some((r) => r.status === "implemented") && owned.some((r) => r.status === "planned")),
			`部分实现能力需要拆分已实现和计划中验收项: ${c.id}`,
		);
	}
	return [...mapped.values()].sort((a, b) => a.id.localeCompare(b.id, "en"));
}

export function select(cases, { level, ids = [] }) {
	demand(!level || levels.includes(level), `未知层级: ${level}`);
	demand(new Set(ids).size === ids.length, "筛选 ID 重复");
	for (const id of ids)
		demand(
			cases.some((c) => c.id === id),
			`未知用例 ID: ${id}`,
		);
	const selected = cases.filter((c) => (!level || c.level === level) && (!ids.length || ids.includes(c.id)));
	demand(selected.length > 0, "用例选择为空");
	demand(!ids.length || selected.length === ids.length, "ID 与层级筛选冲突");
	return selected;
}

export function isolatedEnvironment(directory) {
	const env = {};
	for (const key of ["PATH", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TMPDIR", "TEMP", "TMP"])
		if (process.env[key]) env[key] = process.env[key];
	env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${env.PATH ?? ""}`;
	Object.assign(env, {
		PI_OFFLINE: "1",
		PI_CODING_AGENT_DIR: path.join(directory, "pi"),
		XDG_CONFIG_HOME: path.join(directory, "config"),
		XDG_CACHE_HOME: path.join(directory, "cache"),
		LAWCLAW_CONFIG_FILE: path.join(packageRoot, "config/agent-kernel.yaml"),
		NODE_OPTIONS: `--import=${pathToFileURL(path.join(scripts, "verification-offline.mjs")).href}`,
		TZ: "UTC",
		LANG: "C.UTF-8",
		NO_COLOR: "1",
	});
	return env;
}

// Bounded process groups: also reap descendants left behind after an otherwise successful exit.
export function execute(command, args, { cwd, env, timeout = 120000, input } = {}) {
	return new Promise((resolve) => {
		let stdout = "",
			stderr = "",
			failure;
		const child = spawn(command, args, {
			cwd,
			env,
			detached: process.platform !== "win32",
			stdio: ["pipe", "pipe", "pipe"],
		});
		child.stdin.on("error", () => {});
		child.stdin.end(input);
		function kill() {
			if (!child.pid) return;
			try {
				if (process.platform === "win32") child.kill("SIGKILL");
				else process.kill(-child.pid, "SIGKILL");
			} catch (error) {
				if (error.code !== "ESRCH") failure = "process_cleanup_failed";
			}
		}
		const timer = setTimeout(() => {
			failure = "process_timeout";
			kill();
		}, timeout);
		for (const [stream, key] of [
			[child.stdout, "stdout"],
			[child.stderr, "stderr"],
		])
			stream.on("data", (chunk) => {
				if (key === "stdout") stdout += chunk;
				else stderr += chunk;
				if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > 4 * 1024 * 1024) {
					failure = "output_limit";
					kill();
				}
			});
		child.on("error", (error) => {
			failure = error.code === "ENOENT" ? "environment_missing" : "process_start_failed";
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			kill();
			resolve({ code, stdout, stderr, failure });
		});
	});
}

export async function verify(options = {}) {
	const root = path.resolve(options.root ?? packageRoot);
	const reportDirectory = path.resolve(options.reportDirectory ?? path.join(root, ".artifacts/verification"));
	const report = {
		schemaVersion: 1,
		startedAt: new Date().toISOString(),
		nodeVersion: process.version,
		scope: options.level || options.ids?.length ? "selection" : "all",
		success: false,
		problems: [],
		checks: [],
		cases: [],
		requirements: [],
		capabilities: [],
	};
	let manifest, index, selected;
	try {
		manifest = JSON.parse(
			fs.readFileSync(options.manifestPath ?? path.join(root, "docs/verification/acceptance.json"), "utf8"),
		);
		report.manifestDigest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
		report.capabilities = manifest.capabilities ?? [];
		index = validate(root, manifest);
		selected = select(index, options);
		if (options.list) return { success: true, cases: selected };
	} catch (error) {
		report.problems.push(error.message);
		report.requirements = (Array.isArray(manifest?.requirements) ? manifest.requirements : [])
			.filter((r) => r && typeof r.title === "string")
			.map((r) => ({
				id: r.id,
				title: r.title,
				capability: r.capability,
				implementation: r.status,
				result: "not_covered",
			}));
		saveReport(reportDirectory, report);
		return report;
	}
	const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lawclaw-verification-"));
	try {
		const env = isolatedEnvironment(temporary);
		const files = [...new Set(selected.map((c) => path.join(root, c.file)))].sort();
		const pattern = `^\\[(?:${selected.map((c) => c.id).join("|")})\\] `;
		const result = await execute(
			process.execPath,
			[
				"--import",
				import.meta.resolve("tsx"),
				"--test",
				"--test-concurrency=1",
				"--test-timeout=90000",
				"--test-reporter",
				path.join(scripts, "verification-reporter.mjs"),
				"--test-name-pattern",
				pattern,
				...files,
			],
			{ cwd: root, env },
		);
		const observations = new Map();
		for (const line of result.stdout.split("\n").filter(Boolean)) {
			try {
				const event = JSON.parse(line);
				if (event.id && selected.some((c) => c.id === event.id)) {
					const expected = selected.find((c) => c.id === event.id);
					if (
						!event.file ||
						!fs.existsSync(event.file) ||
						fs.realpathSync(event.file) !== fs.realpathSync(path.join(root, expected.file))
					)
						report.problems.push(`运行用例文件不符: ${event.id}`);
					if (observations.has(event.id)) report.problems.push(`运行用例重复: ${event.id}`);
					observations.set(event.id, event);
				} else if (event.id && !index.some((c) => c.id === event.id))
					report.problems.push(`运行了未登记用例: ${event.id}`);
				else if (event.type === "test:fail") report.problems.push("测试文件或未登记测试失败");
			} catch {
				report.problems.push("测试结果协议无法解析");
			}
		}
		if (result.code !== 0 || result.failure) report.problems.push(result.failure ?? "test_process_failed");
		report.cases = index.map((c) => {
			const event = observations.get(c.id),
				isSelected = selected.some((s) => s.id === c.id);
			return {
				...c,
				sourceDigest: createHash("sha256")
					.update(fs.readFileSync(path.join(root, c.file)))
					.digest("hex"),
				selected: isSelected,
				result: !isSelected
					? "not_covered"
					: result.failure === "environment_missing"
						? "environment_missing"
						: !event
							? "not_covered"
							: event.type === "test:fail" || event.skip || event.todo
								? "failed"
								: "passed",
				durationMs: event?.durationMs ?? 0,
				reason: event?.skip || event?.todo ? "required_case_skipped" : event?.errorCode,
			};
		});
		for (const c of report.cases.filter((c) => c.selected && c.result !== "passed"))
			report.problems.push(`${c.id}: ${c.result}`);
		report.requirements = manifest.requirements.map((r) => {
			const cases = report.cases.filter((c) => c.requirement === r.id);
			const result = cases.some((c) => c.result === "failed")
				? "failed"
				: cases.some((c) => c.result === "environment_missing")
					? "environment_missing"
					: cases.length && cases.every((c) => c.result === "passed")
						? "passed"
						: "not_covered";
			return { id: r.id, title: r.title, capability: r.capability, implementation: r.status, result };
		});
		if (options.checks) {
			demand(root === packageRoot, "静态门禁只对本包运行");
			for (const name of ["typecheck", "check:boundaries", "check:comments", "check:docs"]) {
				const checked = await execute(process.platform === "win32" ? "npm.cmd" : "npm", ["run", name], {
					cwd: root,
					env,
				});
				const passed = checked.code === 0 && !checked.failure;
				report.checks.push({
					name,
					result: passed ? "passed" : checked.failure === "environment_missing" ? "environment_missing" : "failed",
				});
				if (!passed) {
					report.problems.push(`门禁失败: ${name}`);
					process.stderr.write(checked.stdout + checked.stderr);
				}
			}
			const pty = await execute("python3", [path.join(scripts, "verify-kernel-tui-pty.py")], {
				cwd: root, env, timeout: 180000,
			});
			const passed = pty.code === 0 && !pty.failure;
			report.checks.push({ name: "kernel-tui-pty", result: passed ? "passed" : "failed" });
			if (!passed) {
				report.problems.push("门禁失败: kernel-tui-pty");
				process.stderr.write(pty.stdout + pty.stderr);
			}
		}
	} catch (error) {
		report.problems.push(error.message);
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
	report.success = report.problems.length === 0;
	saveReport(reportDirectory, report);
	return report;
}

function saveReport(directory, report) {
	report.finishedAt = new Date().toISOString();
	fs.mkdirSync(directory, { recursive: true });
	fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify(report, null, 2) + "\n");
	const labels = { passed: "通过", failed: "失败", not_covered: "未覆盖", environment_missing: "环境缺失" };
	const selected = report.cases.filter((c) => c.selected);
	const lines = [
		"# Agent OS 验收报告",
		"",
		`范围：${report.scope === "all" ? "全部当前用例" : "筛选用例；不能作为全系统验收"}；结果：${report.success ? "通过" : "失败"}`,
		`已选用例：${selected.length}；通过：${selected.filter((c) => c.result === "passed").length}。计划中能力不计入当前通过数。`,
		"",
		"| 验收项 | 能力 | 实现状态 | 验证结果 |",
		"|---|---|---|---|",
	];
	for (const r of report.requirements)
		lines.push(
			`| ${r.id}: ${r.title.replaceAll("|", "/").replaceAll("\n", " ")} | ${r.capability} | ${r.implementation} | ${labels[r.result]} |`,
		);
	lines.push("", "## 用例证据", "", "| 用例 | 层级 | 结果 | 文件 |", "|---|---|---|---|");
	for (const c of report.cases) lines.push(`| ${c.id} | ${c.level} | ${labels[c.result]} | ${c.file} |`);
	lines.push(
		"",
		"## 门禁",
		"",
		...report.checks.map((c) => `- ${c.name}: ${labels[c.result]}`),
		"",
		"## 问题",
		"",
		...report.problems.map((p) => `- ${p}`),
		"",
	);
	fs.writeFileSync(path.join(directory, "report.md"), lines.join("\n"));
}
