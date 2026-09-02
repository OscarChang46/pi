import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(projectRoot, "..", "..");
const tsxBin = path.join(workspaceRoot, "node_modules", ".bin", "tsx");
const piCliEntry = path.join(workspaceRoot, "packages", "coding-agent", "src", "cli.ts");
const extension = path.join(projectRoot, "src", "pi-cli", "extension.ts");

function run(args, input) {
  return new Promise((resolve, reject) => {
		const child = spawn(tsxBin, [piCliEntry, ...args], {
			cwd: projectRoot,
			env: {
				...process.env,
				PI_OFFLINE: "1",
				LAWCLAW_PI_CLI_ENTRY: piCliEntry,
				LAWCLAW_PI_CLI_EXECUTABLE: tsxBin,
			},
		});
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Pi CLI 冒烟测试超时。"));
    }, 20_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 1024 * 1024) child.kill("SIGTERM");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 256 * 1024) child.kill("SIGTERM");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (input) child.stdin.end(input);
  });
}

const versionResult = await run(["--version"]);
if (versionResult.code !== 0 || versionResult.stdout.trim() !== "0.84.4") {
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
if (rpcResult.code !== 0) {
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
