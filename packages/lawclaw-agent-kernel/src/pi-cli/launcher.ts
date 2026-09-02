import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeSettings, resolveConfiguredPath } from "../config/index.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const tsxBin = path.join(workspaceRoot, "node_modules", ".bin", "tsx");
const piCliEntry = path.join(workspaceRoot, "packages", "coding-agent", "src", "cli.ts");
const extension = path.join(projectRoot, "src", "pi-cli", "extension.ts");
const settings = loadRuntimeSettings();
const sessionDirectory = resolveConfiguredPath(settings, settings.config.cli.sessionDirectory);
const userArguments = process.argv.slice(2);

function containsOption(arguments_: readonly string[], option: string): boolean {
	return arguments_.some((argument) => argument === option || argument.startsWith(`${option}=`));
}

mkdirSync(sessionDirectory, { recursive: true });

const modelArguments: string[] = [];
const hasExplicitModelSelection =
	containsOption(userArguments, "--provider") || containsOption(userArguments, "--model");
if (settings.config.model.source === "builtin" && !hasExplicitModelSelection) {
	modelArguments.push("--provider", settings.config.model.providerId, "--model", settings.config.model.modelId);
}

const child = spawn(
	tsxBin,
	[
		piCliEntry,
		...(settings.config.cli.offline ? ["--offline"] : []),
		"--session-dir",
		sessionDirectory,
		"--no-builtin-tools",
		"--no-extensions",
		"--no-skills",
		"--no-prompt-templates",
		"--no-context-files",
		"--extension",
		extension,
		...modelArguments,
		...userArguments,
	],
	{
		cwd: projectRoot,
		stdio: "inherit",
		env: {
			...process.env,
			LAWCLAW_CONFIG_FILE: settings.configFile,
			LAWCLAW_PI_CLI_ENTRY: piCliEntry,
			LAWCLAW_PI_CLI_EXECUTABLE: tsxBin,
		},
	},
);

child.on("error", () => {
	console.error("错误：无法启动项目内 Pi CLI；未输出配置或凭据内容。");
	process.exitCode = 1;
});

child.on("close", (code, signal) => {
	if (signal) {
		process.exitCode = 130;
		return;
	}
	process.exitCode = code ?? 1;
});
