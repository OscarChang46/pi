import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { parse, stringify } from "yaml";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const runtimeDirectory = path.resolve(process.env.FLOW_LOCAL_DIRECTORY ?? path.join(repositoryRoot, ".artifacts/flow-local"));
const buildDirectory = path.join(runtimeDirectory, "build");
const secretDirectory = path.join(runtimeDirectory, "secrets");
const configDirectory = path.join(runtimeDirectory, "config");
for (const directory of [runtimeDirectory, buildDirectory, secretDirectory, configDirectory, path.join(runtimeDirectory, "data")]) mkdirSync(directory, { recursive: true, mode: 0o700 });

const agentDirectory = process.env.FLOW_PI_AGENT_DIRECTORY ?? path.join(homedir(), ".pi/agent");
const selection = JSON.parse(readFileSync(path.join(agentDirectory, "settings.json"), "utf8"));
const deploymentFile = path.join(runtimeDirectory, "deployment.json");
const deployment = existsSync(deploymentFile) ? JSON.parse(readFileSync(deploymentFile, "utf8")) : {};
const providerId = process.env.FLOW_MODEL_PROVIDER ?? deployment.providerId ?? selection.defaultProvider;
const modelId = process.env.FLOW_MODEL_ID ?? deployment.modelId ?? selection.defaultModel;
const baseImage = process.env.FLOW_BASE_IMAGE ?? deployment.baseImage ?? "node:24-bookworm-slim";
const httpProxy = process.env.FLOW_HTTP_PROXY ?? deployment.httpProxy;
const models = JSON.parse(readFileSync(path.join(agentDirectory, "models.json"), "utf8"));
const provider = structuredClone(models.providers?.[providerId]);
if (!provider) throw new Error("指定Provider不在现有models.json中。");
try {
  const runtime = await ModelRuntime.create({ modelsPath: path.join(agentDirectory, "models.json"), authPath: path.join(agentDirectory, "auth.json"), modelsStorePath: path.join(runtimeDirectory, "model-catalog.json"), allowModelNetwork: false });
  const model = runtime.getModel(providerId, modelId);
  const resolved = model ? await runtime.getAuth(model) : undefined;
  if (!resolved?.auth.apiKey) throw new Error("missing");
  provider.apiKey = resolved.auth.apiKey;
  if (resolved.auth.headers) provider.headers = resolved.auth.headers;
  if (resolved.auth.baseUrl) provider.baseUrl = resolved.auth.baseUrl;
} catch { throw new Error("现有Pi认证加载器无法解析指定模型凭据；未生成部署凭据。"); }
writeFileSync(path.join(secretDirectory, "models.json"), JSON.stringify({ providers: { [providerId]: provider } }), { mode: 0o600 });
const tokenFile = path.join(secretDirectory, "http-token");
if (!existsSync(tokenFile)) writeFileSync(tokenFile, randomBytes(32).toString("hex"), { mode: 0o600 });

const config = parse(readFileSync(path.join(packageRoot, "config/agent-kernel.yaml"), "utf8"));
config.runtime.workspaceRoot = "/workspace";
config.runtime.budget.maxDurationMs = 120000;
config.runtime.budget.maxTurns = 8;
config.runtime.budget.maxToolCalls = 8;
config.runtime.requestContext.operationDeadlineMs = 120000;
writeFileSync(path.join(configDirectory, "agent-kernel.yaml"), stringify(config));
copyFileSync(path.join(packageRoot, "config/prompts.zh-CN.yaml"), path.join(configDirectory, "prompts.zh-CN.yaml"));
for (const file of ["Dockerfile", "package.json", "package-lock.json"]) copyFileSync(path.join(packageRoot, "deploy/flow-local", file), path.join(buildDirectory, file));
await build({ entryPoints: [path.join(packageRoot, "src/application/run-flow-server.ts")], outfile: path.join(buildDirectory, "flow-server.mjs"), bundle: true, platform: "node", target: "node24", format: "esm", packages: "external", external: ["@earendil-works/pi-ai", "@earendil-works/pi-ai/*", "@earendil-works/pi-coding-agent"], sourcemap: false });
for (const [source, output] of [["test/integration/flow-engine.test.ts", "flow-engine-test.mjs"], ["test/support/flow-crash-worker.ts", "flow-crash-worker.mjs"], ["scripts/flow-engine-admin.ts", "flow-engine-admin.mjs"]]) {
  await build({ entryPoints: [path.join(packageRoot, source)], outfile: path.join(buildDirectory, output), bundle: true, platform: "node", target: "node24", format: "esm", packages: "external", sourcemap: false });
}

const compose = {
  services: {
    flow: {
      build: { context: "./build", args: { BASE_IMAGE: baseImage, ...(httpProxy ? { HTTPS_PROXY: httpProxy, HTTP_PROXY: httpProxy } : {}) } },
      image: "lawclaw-flowengine:local",
      init: true,
      user: `${process.getuid()}:${process.getgid()}`,
      restart: "unless-stopped",
      read_only: true,
      cap_drop: ["ALL"],
      security_opt: ["no-new-privileges:true"],
      pids_limit: 128,
      mem_limit: "768m",
      cpus: 2,
      ports: [`127.0.0.1:${process.env.FLOW_LOCAL_PORT ?? "8787"}:8080`],
      environment: { FLOW_HOST: "0.0.0.0", FLOW_DATA_DIRECTORY: "/data", FLOW_MODELS_PATH: "/secrets/models.json", FLOW_MODEL_PROVIDER: providerId, FLOW_MODEL_ID: modelId, FLOW_TOKEN_FILE: "/secrets/http-token", LAWCLAW_CONFIG_FILE: "/config/agent-kernel.yaml", PI_OFFLINE: "1", ...(httpProxy ? { HTTPS_PROXY: httpProxy, NODE_USE_ENV_PROXY: "1", NO_PROXY: "127.0.0.1,localhost" } : {}) },
      volumes: ["./data:/data", "./secrets:/secrets:ro", "./config:/config:ro", `${path.join(packageRoot, "sample-workspace")}:/workspace:ro`],
      tmpfs: ["/tmp:size=16m,mode=1777"],
      healthcheck: { test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], interval: "5s", timeout: "3s", retries: 6 },
      stop_grace_period: "10s",
    },
  },
};
const composeFile = path.join(runtimeDirectory, "compose.yaml");
writeFileSync(composeFile, stringify(compose));
writeFileSync(deploymentFile, JSON.stringify({ providerId, modelId, baseImage, httpProxy }, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ runtimeDirectory, composeFile, providerId, modelId }));
if (process.argv.includes("--up")) {
  const result = spawnSync("docker", ["compose", "-p", "lawclaw-flow-local", "-f", composeFile, "up", "--build", "-d", "--wait"], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}
