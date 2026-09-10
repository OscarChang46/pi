import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join, resolve } from "node:path";
import { type TestContext, test } from "node:test";
import { KernelHttpClient, KernelRequestError } from "../../src/clients/kernel-tui/kernel-client.ts";
import { KernelProtocolError, parseKernelJson } from "../../src/contracts/kernel-client-codec.ts";
import type { TuiStreamEvent } from "../../src/contracts/kernel-tui.ts";
import { deferred, temporaryWorkspace } from "../support/harness.ts";

const initialization = {
	hostInstanceId: "host-1",
	scopeId: "scope-1",
	connectionId: "connection-1",
	protocolVersion: "1.0",
	capabilities: ["conversation", "stream", "commandLookup"],
	limits: { maxFrameBytes: 65536, maxInflight: 8, maxEventWindow: 128 },
	defaultSelection: { agentId: "agent-1", modelId: "model-1" },
};
const conversation = {
	session: { kind: "new" as const, logicalKey: "logical-1" },
	selection: initialization.defaultSelection,
	goal: "保留原始正文",
	materialRefs: [],
};

test("[AK-TUI-016] JSON重复键、深度和字节上限失败关闭，同名跨对象字段合法", () => {
	assert.throws(() => parseKernelJson('{"state":"accepted","state":"preparing"}'), KernelProtocolError);
	assert.throws(() => parseKernelJson('{"a":1,"\\u0061":2}'), KernelProtocolError);
	assert.throws(() => parseKernelJson(`${"[".repeat(33)}0${"]".repeat(33)}`), KernelProtocolError);
	assert.throws(() => parseKernelJson('"中文"', 7), KernelProtocolError);
	assert.equal(parseKernelJson('"中文"', 8), "中文");
	assert.deepEqual(parseKernelJson('{"a":{"id":1},"b":[{"id":2},{"id":3}]}'), {
		a: { id: 1 },
		b: [{ id: 2 }, { id: 3 }],
	});
});

async function listen(t: TestContext, server: ReturnType<typeof createServer>) {
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	t.after(async () => {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	});
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	return new KernelHttpClient(`http://127.0.0.1:${address.port}`, "test-credential");
}

test("[AK-TUI-017] 验收网络守卫允许真实回环请求但拒绝外网、DNS和重定向", async (t) => {
	const directory = await temporaryWorkspace(t);
	const script = join(directory, "network-guard.mjs");
	await writeFile(
		script,
		`
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import net from 'node:net';
const server = createServer((request, response) => {
  if (request.url === '/redirect') response.writeHead(302, {location:'https://example.invalid'}).end();
  else response.end('LOCAL_ONLY');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const endpoint = 'http://127.0.0.1:' + server.address().port;
  assert.equal(await (await fetch(endpoint)).text(), 'LOCAL_ONLY');
  await assert.rejects(fetch(endpoint + '/redirect'));
  await assert.rejects(fetch('https://example.invalid'), /VERIFICATION_NETWORK_DISABLED/);
  await assert.rejects(fetch('http://localhost:80'), /VERIFICATION_NETWORK_DISABLED/);
  assert.throws(() => net.connect({host:'192.0.2.1', port:80}), /VERIFICATION_NETWORK_DISABLED/);
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
`,
	);
	const child = spawnSync(
		process.execPath,
		["--import", resolve(import.meta.dirname, "../../scripts/verification-offline.mjs"), script],
		{ encoding: "utf8", timeout: 10000 },
	);
	assert.equal(child.status, 0, child.stdout + child.stderr);
});

test("[AK-TUI-013] HTTP受理后丢回执只查询原命令，传输请求身份更新且写入只发生一次", async (t) => {
	let writes = 0;
	const requestIds = new Set<string>();
	const receipt = {
		commandId: "command-1",
		state: "accepted",
		sessionId: "session-1",
		runId: "run-1",
		anchor: { sessionId: "session-1", version: 0, headRef: "head-0" },
		frozenSelection: initialization.defaultSelection,
	};
	const server = createServer(async (request, response) => {
		assert.equal(request.headers.authorization, "Bearer test-credential");
		response.setHeader("Content-Type", "application/json");
		if (request.url === "/v1/commands/command-1") {
			assert.equal(request.headers["x-lawclaw-connection"], "connection-1");
			const meta = JSON.parse(String(request.headers["x-lawclaw-request-meta"]));
			assert.ok(!requestIds.has(meta.requestId));
			response.end(JSON.stringify({ operation: "submit", commandId: "command-1", state: "accepted", receipt }));
			return;
		}
		let body = "";
		for await (const chunk of request) body += chunk;
		const envelope = JSON.parse(body);
		requestIds.add(envelope.meta.requestId);
		if (request.url === "/v1/initialize") {
			response.end(JSON.stringify(initialization));
			return;
		}
		assert.equal(envelope.meta.commandId, "command-1");
		assert.equal(envelope.meta.idempotencyKey, "command-1");
		assert.deepEqual(envelope.input, conversation);
		writes++;
		request.socket.destroy();
	});
	const client = await listen(t, server);
	await client.initialize(new AbortController().signal);
	await assert.rejects(client.submit("command-1", conversation, new AbortController().signal));
	const result = await client.getCommand("command-1", new AbortController().signal);
	assert.equal(result.state, "accepted");
	assert.equal(writes, 1);
});

test("[AK-TUI-014] 真实SSE增量与耐久通知分开消费，批量ACK确认后关闭流报告失联", async (t) => {
	const acked = deferred();
	let acknowledgments = 0;
	const server = createServer(async (request, response) => {
		if (request.url === "/v1/runs/run-1/stream?after=0") {
			response.writeHead(200, { "Content-Type": "text/event-stream" });
			response.write(
				`data: ${JSON.stringify({ kind: "subscription.ready", subscriptionId: "subscription-1", hostInstanceId: "host-1" })}\n\n`,
			);
			response.write(
				`data: ${JSON.stringify({ kind: "text.start", runId: "run-1", attemptId: "attempt-1", streamId: "stream-1", blockId: "block-1", baseOutputRevision: 0, prefix: "中文" })}\n\n`,
			);
			for (let sequence = 1; sequence <= 32; sequence++)
				response.write(
					`data: ${JSON.stringify({ kind: "run.updated", runId: "run-1", sequence, version: sequence })}\n\n`,
				);
			await acked.promise;
			response.end();
			return;
		}
		response.setHeader("Content-Type", "application/json");
		if (request.url === "/v1/initialize") {
			response.end(JSON.stringify(initialization));
			return;
		}
		assert.equal(request.url, "/v1/subscriptions/subscription-1/ack");
		let body = "";
		for await (const chunk of request) body += chunk;
		assert.equal(JSON.parse(body).input.sequence, 32);
		acknowledgments++;
		response.end(JSON.stringify({ acknowledgedSequence: 32 }));
		acked.resolve();
	});
	const client = await listen(t, server);
	await client.initialize(new AbortController().signal);
	const events: TuiStreamEvent[] = [];
	const failure = await new Promise<unknown>((resolve) =>
		client.subscribe("run-1", 0, AbortSignal.timeout(5000), (event) => events.push(event), resolve),
	);
	assert.match(String(failure), /TUI_STREAM_CLOSED/);
	assert.equal(events.length, 33);
	assert.equal(events[0]?.kind, "text.start");
	assert.equal(acknowledgments, 1);
});

test("[AK-TUI-015] 明确拒绝与错误身份的回执分别报告，客户端不把协议错误当受理", async (t) => {
	let reject = true;
	const server = createServer((request, response) => {
		response.setHeader("Content-Type", "application/json");
		if (request.url === "/v1/initialize") {
			response.end(JSON.stringify(initialization));
			return;
		}
		if (reject) {
			response.writeHead(409);
			response.end(
				JSON.stringify({ error: { code: "SESSION_RUN_ACTIVE", message: "会话仍在执行", retryable: false } }),
			);
			return;
		}
		response.end(JSON.stringify({ commandId: "other-command", state: "preparing", sessionId: null, runId: null }));
	});
	const client = await listen(t, server);
	await client.initialize(new AbortController().signal);
	await assert.rejects(client.submit("command-1", conversation, new AbortController().signal), KernelRequestError);
	reject = false;
	await assert.rejects(client.submit("command-1", conversation, new AbortController().signal), KernelProtocolError);
});
