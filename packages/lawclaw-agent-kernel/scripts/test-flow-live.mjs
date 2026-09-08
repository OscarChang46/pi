import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const runtimeDirectory = path.resolve(process.env.FLOW_LOCAL_DIRECTORY ?? path.join(repositoryRoot, ".artifacts/flow-local"));
const base = process.env.FLOW_BASE_URL ?? "http://127.0.0.1:8787";
const token = readFileSync(path.join(runtimeDirectory, "secrets/http-token"), "utf8").trim();
const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const evidence = { startedAt: new Date().toISOString(), base, cases: [] };

async function request(route, body) {
  const response = await fetch(`${base}${route}`, { method: body === undefined ? "GET" : "POST", headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
  return { status: response.status, body: await response.json() };
}

async function waitFor(runId) {
  const until = Date.now() + 150000;
  while (Date.now() < until) {
    const response = await request(`/runs/${runId}`);
    assert.equal(response.status, 200);
    if (["Completed", "Failed", "Cancelled", "Suspended"].includes(response.body.position.kind) && ["Terminate", "Yield"].includes(response.body.flowRun?.state)) return response.body;
    await delay(300);
  }
  throw new Error(`FLOW_LIVE_TIMEOUT:${runId}`);
}

async function scenario(name, goal, check, timeoutMs = 120000) {
  const runId = `live-${name}-${randomUUID()}`;
  const started = Date.now();
  const item = { name, runId, passed: false };
  evidence.cases.push(item);
  const body = { runId, goal, timeoutMs };
  assert.equal((await request("/runs", body)).status, 202);
  const result = await waitFor(runId);
  assert.equal(result.flowRun.state, "Terminate");
  const history = (await request(`/runs/${runId}/diagnostics`)).body.flowRunEvents;
  assert.ok(Array.isArray(history));
  assert.equal(history.filter(event => event.kind === "Activity_Started").length, history.filter(event => event.kind === "Activity_Completed").length);
  await check(result);
  assert.equal((await request("/runs", body)).status, 202);
  const duplicate = (await request(`/runs/${runId}`)).body;
  assert.equal(duplicate.commands.length, result.commands.length);
  Object.assign(item, { passed: true, durationMs: Date.now() - started, flowRun: result.flowRun, flowRunEvents: history, position: result.position.kind, usage: result.usage, commands: result.commands });
  console.log(JSON.stringify({ name, runId, passed: true, position: result.position.kind }));
}

try {
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/runs/not-authorized`)).status, 401);
  const diagnostics = await request("/diagnostics");
  assert.equal(diagnostics.status, 200);
  evidence.runtime = diagnostics.body;
  await scenario("answer", "不要使用工具，只回答 FLOW_LIVE_OK。", result => {
    assert.equal(result.position.kind, "Completed");
    assert.ok(typeof result.output === "string" && result.output.includes("FLOW_LIVE_OK"));
    assert.equal(result.commands.filter(command => command.kind === "InvokeModel").length, 1);
  });
  const firstLine = readFileSync(path.resolve(import.meta.dirname, "../sample-workspace/input.txt"), "utf8").split("\n")[0];
  await scenario("read", "必须使用 lawclaw_read_text 读取 input.txt，然后原样返回文件第一行。不要调用其他工具，不要凭空猜测。", result => {
    assert.equal(result.position.kind, "Completed");
    assert.ok(typeof result.output === "string" && result.output.includes(firstLine));
    assert.ok(result.commands.some(command => command.kind === "DispatchTool" && command.status === "SUCCEEDED"));
    assert.ok(result.commands.some(command => command.kind === "RequestPermission" && command.status === "SUCCEEDED"));
  });
  await scenario("deadline", "只回答OK", result => {
    assert.equal(result.position.kind, "Cancelled");
  }, 1);
  await scenario("child", "必须调用一次 lawclaw_delegate，task为：不要使用任何工具，只回答 FLOW_CHILD_OK。收到子Agent结果后，只回答 FLOW_PARENT_OK。", async result => {
    assert.equal(result.position.kind, "Completed");
    assert.ok(result.output.includes("FLOW_PARENT_OK"));
    const command = result.commands.find(command => command.kind === "CreateChildRun");
    assert.ok(command?.childId);
    const child = await request(`/runs/${command.childId}`);
    assert.equal(child.body.position.kind, "Completed");
    assert.ok(child.body.output.includes("FLOW_CHILD_OK"));
    assert.equal(child.body.commands.filter(command => command.kind === "CreateChildRun").length, 0);
  });
  const runId = `live-cancel-${randomUUID()}`;
  assert.equal((await request("/runs", { runId, goal: "只回答 FLOW_CANCEL_TEST", timeoutMs: 120000 })).status, 202);
  assert.equal((await request(`/runs/${runId}/cancel`, {})).status, 202);
  assert.equal((await request(`/runs/${runId}/cancel`, {})).status, 202);
  const cancelled = await waitFor(runId);
  assert.equal(cancelled.position.kind, "Cancelled");
  assert.equal(cancelled.cancelEpoch, 1);
  evidence.cases.push({ name: "cancel", runId, passed: true, position: cancelled.position.kind, commands: cancelled.commands });
  console.log(JSON.stringify({ name: "cancel", runId, passed: true }));
  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  evidence.failure = error instanceof Error ? error.message : "FLOW_LIVE_FAILED";
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  const report = path.join(runtimeDirectory, "live-report.json");
  writeFileSync(report, JSON.stringify(evidence, null, 2));
  const reportDirectory = path.join(runtimeDirectory, "reports");
  mkdirSync(reportDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(reportDirectory, `${evidence.startedAt.replaceAll(":", "-")}-live.json`), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: evidence.passed, report }));
}
