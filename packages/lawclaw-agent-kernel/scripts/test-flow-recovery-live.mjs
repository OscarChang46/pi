import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(import.meta.dirname, "../../..");
const directory = path.resolve(process.env.FLOW_LOCAL_DIRECTORY ?? path.join(root, ".artifacts/flow-local"));
const composeFile = path.join(directory, "compose.yaml");
const base = process.env.FLOW_BASE_URL ?? "http://127.0.0.1:8787";
const headers = { authorization: `Bearer ${readFileSync(path.join(directory, "secrets/http-token"), "utf8").trim()}`, "content-type": "application/json" };
const evidence = { startedAt: new Date().toISOString(), cases: [] };

function compose(...args) {
  const result = spawnSync("docker", ["compose", "-p", "lawclaw-flow-local", "-f", composeFile, ...args], { encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, `Docker ${args[0]} failed`);
}

async function get(runId) {
  const response = await fetch(`${base}/runs/${runId}`, { headers, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  return response.json();
}

async function awaitState(runId, accepted, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const run = await get(runId);
    if (accepted(run)) return run;
    await delay(100);
  }
  throw new Error(`FLOW_RECOVERY_TIMEOUT:${runId}`);
}

try {
  const basic = JSON.parse(readFileSync(path.join(directory, "live-report.json"), "utf8"));
  assert.equal(basic.passed, true, "先运行真实基础场景测试");
  const completed = basic.cases.find(item => item.name === "read");
  assert.ok(completed);
  const before = await get(completed.runId);
  compose("kill", "-s", "SIGKILL", "flow");
  compose("up", "-d", "--wait", "flow");
  const after = await get(completed.runId);
  assert.deepEqual(after.position, before.position);
  assert.deepEqual(after.commands, before.commands);
  assert.equal(after.output, before.output);
  assert.deepEqual(after.flowRun, before.flowRun);
  evidence.cases.push({ name: "completed-after-sigkill", passed: true, runId: completed.runId, version: after.version });
  console.log(JSON.stringify(evidence.cases.at(-1)));

  const runId = `live-crash-${randomUUID()}`;
  const response = await fetch(`${base}/runs`, { method: "POST", headers, body: JSON.stringify({ runId, goal: "不要用工具。请仔细思考并写一份关于数据库事务隔离级别的详细比较，至少包含十个具体并发例子。", timeoutMs: 120000 }), signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 202);
  const inflight = await awaitState(runId, run => run.position.kind === "AwaitingModel" && run.commands.some(command => command.kind === "InvokeModel" && command.status === "ACCEPTED"), 10000);
  compose("kill", "-s", "SIGKILL", "flow");
  compose("run", "--rm", "--no-deps", "flow", "node", "flow-flowRun-admin.mjs", "recover", runId);
  compose("up", "-d", "--wait", "flow");
  const recovered = await awaitState(runId, run => ["Suspended", "Completed", "Failed", "Cancelled"].includes(run.position.kind) && run.flowRun?.state === "Yield");
  assert.equal(recovered.position.kind, "Suspended", "崩溃窗口未命中未知结果，不能算该用例通过");
  assert.equal(recovered.position.reason.kind, "model_unknown");
  assert.equal(recovered.flowRun.state, "Yield");
  assert.notEqual(recovered.attemptId, inflight.attemptId);
  assert.equal(recovered.commands.filter(command => command.kind === "InvokeModel").length, 1);
  assert.equal(recovered.commands.find(command => command.kind === "InvokeModel").status, "UNKNOWN");
  await delay(1500);
  const stable = await get(runId);
  assert.equal(stable.commands.filter(command => command.kind === "InvokeModel").length, 1);
  evidence.cases.push({ name: "inflight-after-sigkill", passed: true, runId, beforeAttempt: inflight.attemptId, afterAttempt: recovered.attemptId, commands: stable.commands, flowRun: stable.flowRun, position: stable.position });
  console.log(JSON.stringify(evidence.cases.at(-1)));
  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  evidence.failure = error instanceof Error ? error.message : "FLOW_RECOVERY_FAILED";
  process.exitCode = 1;
} finally {
  evidence.finishedAt = new Date().toISOString();
  const report = path.join(directory, "recovery-report.json");
  writeFileSync(report, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ passed: evidence.passed, report }));
}
