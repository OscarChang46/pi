import fs from "node:fs";
import os from "node:os";
import { execute, isolatedEnvironment } from "./verification.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const tsxBin = path.join(workspaceRoot, "node_modules", ".bin", "tsx");
const piCliEntry = path.join(workspaceRoot, "packages", "coding-agent", "src", "cli.ts");
const extension = path.join(projectRoot, "src", "pi-cli", "extension.ts");

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lawclaw-cli-check-"));
async function run(args, input) {
	return execute(process.execPath, ["--import", import.meta.resolve("tsx"), piCliEntry, ...args], {
		cwd: projectRoot,
		env: { ...isolatedEnvironment(temporary), LAWCLAW_PI_CLI_ENTRY: piCliEntry, LAWCLAW_PI_CLI_EXECUTABLE: tsxBin },
		input,
		timeout: 20_000,
	});
}

try {
	const versionResult = await run(["--version"]);
	if (versionResult.failure || versionResult.code !== 0 || versionResult.stdout.trim() !== "0.84.4") {
		throw new Error(`项目内 Pi CLI 版本不符合固定基线：${versionResult.stdout.trim()}`);
	}

	const rpcResult = await run(
		[
			"--offline",
			"--mode",
			"rpc",
			"--no-session",
			"--no-builtin-tools",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-context-files",
			"--extension",
			extension,
		],
		`${JSON.stringify({ id: "smoke-1", type: "get_commands" })}\n`,
	);
	if (rpcResult.failure || rpcResult.code !== 0) {
		throw new Error("Pi CLI RPC 启动失败；为避免泄漏配置，未回显 stderr。 ");
	}
	const frames = rpcResult.stdout
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));
	const response = frames.find((frame) => frame.id === "smoke-1" && frame.type === "response");
	const commands = response?.data?.commands ?? [];
	if (!response?.success || !commands.some((command) => command.name === "lawclaw-status")) {
		throw new Error("Pi CLI 已启动，但 LawClaw 扩展命令未成功加载。 ");
	}

	console.log("Pi CLI 0.84.4 与 LawClaw 扩展 RPC 冒烟通过。 ");
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}
