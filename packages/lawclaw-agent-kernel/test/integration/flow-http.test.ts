import assert from "node:assert/strict";
import { Agent, request as httpRequest } from "node:http";
import { createConnection } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { createFlowService } from "../../src/application/flow-composition.ts";
import { createFlowHttpServer } from "../../src/application/flow-http-server.ts";
import { scriptedModel, temporaryWorkspace } from "../support/harness.ts";

test("[AK-FE-025] HTTP鉴权与同Run同内容幂等，不同内容拒绝且不增加模型调用", async (t) => {
	const directory = await temporaryWorkspace(t);
	const model = scriptedModel([
		[
			{
				type: "turn_completed",
				message: {
					role: "assistant",
					runtimeMessageRef: "answer",
					stopReason: "stop",
					content: [{ type: "text", text: "OK" }],
				},
			},
		],
	]);
	const service = await createFlowService({
		dataDirectory: directory,
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelOverride: model.adapter,
	});
	const token = "test-token-with-more-than-thirty-two-characters";
	const http = createFlowHttpServer(service, token);
	const socketPath = join(directory, "http.sock");
	await new Promise<void>((resolve) => http.server.listen(socketPath, resolve));
	t.after(() => http.stop());
	const base = "";
	const agent = new Agent();
	agent.createConnection = () => createConnection({ path: socketPath });
	t.after(() => agent.destroy());
	const fetch = (route: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
		new Promise<{ status: number; json: () => Promise<unknown> }>((resolve, reject) => {
			const request = httpRequest(
				{ agent, socketPath, path: route, method: options.method, headers: options.headers },
				(response) => {
					const chunks: Buffer[] = [];
					response.on("data", (chunk: Buffer) => chunks.push(chunk));
					response.on("end", () =>
						resolve({
							status: response.statusCode ?? 0,
							json: async () => JSON.parse(Buffer.concat(chunks).toString("utf8")),
						}),
					);
				},
			);
			request.on("error", reject);
			request.end(options.body);
		});
	assert.equal((await fetch(`${base}/runs/http-run`)).status, 401);
	const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
	const payload = { runId: "http-run", goal: "hello", timeoutMs: 15000 };
	assert.equal((await fetch(`${base}/runs`, { method: "POST", headers, body: JSON.stringify(payload) })).status, 202);
	assert.equal((await fetch(`${base}/runs`, { method: "POST", headers, body: JSON.stringify(payload) })).status, 202);
	assert.equal(
		(
			await fetch(`${base}/runs`, {
				method: "POST",
				headers,
				body: JSON.stringify({ ...payload, goal: "different" }),
			})
		).status,
		409,
	);
	assert.equal(
		(
			await fetch(`${base}/runs`, {
				method: "POST",
				headers,
				body: JSON.stringify({ ...payload, extra: "ignored?" }),
			})
		).status,
		400,
	);
	const response = await fetch(`${base}/runs/http-run`, { headers });
	assert.equal(response.status, 200);
	const result: unknown = await response.json();
	assert.ok(typeof result === "object" && result !== null && "output" in result);
	assert.equal(result.output, "OK");
	assert.ok(
		"flowRun" in result && typeof result.flowRun === "object" && result.flowRun !== null && "state" in result.flowRun,
	);
	assert.equal(result.flowRun.state, "Terminate");
	assert.ok("flowRunId" in result.flowRun);
	assert.equal(result.flowRun.flowRunId, "http-run");
	assert.ok(!("runId" in result.flowRun));
	assert.equal((await fetch(`${base}/diagnostics`)).status, 401);
	const diagnostics = await fetch(`${base}/runs/http-run/diagnostics`, { headers });
	assert.equal(diagnostics.status, 200);
	const history = await diagnostics.json();
	assert.ok(typeof history === "object" && history !== null && "events" in history && Array.isArray(history.events));
	assert.equal(history.events.length, 2);
	assert.ok("flowRunEvents" in history && Array.isArray(history.flowRunEvents));
	assert.equal(
		history.flowRunEvents.filter((event: { kind: string }) => event.kind === "Activity_Completed").length,
		1,
	);
	assert.ok(!JSON.stringify(history).includes("runtimeMessageRef"));
	assert.equal((await fetch(`${base}/runs/missing/diagnostics`, { headers })).status, 404);
	assert.equal((await fetch(`${base}/runs/http-run/cancel`, { method: "POST", headers, body: "{}" })).status, 202);
	const completedAfterCancel = await (await fetch(`${base}/runs/http-run`, { headers })).json();
	assert.ok(
		typeof completedAfterCancel === "object" && completedAfterCancel !== null && "output" in completedAfterCancel,
	);
	assert.equal(completedAfterCancel.output, "OK");
	assert.equal(model.calls(), 1);
});
