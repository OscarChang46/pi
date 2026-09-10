/**
 * 局部验收夹具：真实PTY → 编译后的EditorAdapter/RunObservation → HTTP/SSE → 当前AgentSystem。
 * /validation端点不是TUI-CON-001宿主；不证明耐久受理、历史采纳、模型文本流或Host重启。
 */
import assert from "node:assert/strict";
import { appendFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";
import { Editor, ProcessTerminal, Text, TuiMainScreen } from "../../tui/dist/index.js";
import { createAgentKernel, createRequestContext, createRootSessionCommand, createRunCommand } from "../dist/application/composition-root.js";
import { EditorAdapter } from "../dist/clients/kernel-tui/editor-adapter.js";
import { RunObservation } from "../dist/clients/kernel-tui/observation.js";
import { parseTuiInput } from "../dist/clients/kernel-tui/terminal-input.js";
import { loadRuntimeSettings } from "../dist/config/index.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const evidence = process.env.LAWCLAW_CHAIN_EVIDENCE;
const token = process.env.LAWCLAW_CHAIN_TOKEN;
assert.ok(evidence && token, "验收器必须提供独立证据目录与随机凭据");
function record(value) {
	appendFileSync(path.join(evidence, `${process.argv[2]}.jsonl`), `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

if (process.argv[2] === "service") await serve();
else if (process.argv[2] === "terminal") await terminal();
else throw new Error("用法：kernel-tui-local-chain.mjs service|terminal");

async function serve() {
	const settings = loadRuntimeSettings();
	assert.equal(settings.config.model.source, "faux", "局部验收禁止使用真实付费模型");
	const workspace = path.join(packageRoot, "sample-workspace");
	const kernel = await createAgentKernel(workspace, settings);
	const sessions = new Set();
	const runs = new Map();
	const server = createServer((request, response) => {
		void route(request, response).catch((error) => {
			record({ type: "serviceError", message: error.message });
			if (!response.headersSent) response.writeHead(500);
			response.end();
		});
	});

	async function route(request, response) {
		if (request.headers.authorization !== `Bearer ${token}`) {
			response.writeHead(401).end();
			return;
		}
		const url = new URL(request.url, "http://127.0.0.1");
		if (request.method === "POST" && url.pathname === "/validation/run") {
			let body = "";
			for await (const chunk of request) {
				body += chunk;
				assert.ok(Buffer.byteLength(body) < 32768);
			}
			const input = JSON.parse(body);
			assert.equal(typeof input.text, "string");
			assert.ok(input.text.trim());
			const context = createRequestContext(settings);
			const sessionCommand = createRootSessionCommand({
				logicalKey: `validation:${crypto.randomUUID()}`,
				agentDefinitionRef: kernel.agentId,
				contextPolicyRef: context.tenant.authorizationSnapshot,
			});
			const { anchor: { sessionId } } = kernel.ensure(context, sessionCommand);
			sessions.add(sessionId);
			const command = { ...createRunCommand({ sessionId, workspaceRoot: workspace }, settings), goal: input.text };
			const snapshot = { runId: command.runId, version: 1, eventSequence: 1, outputRevision: 0,
				attemptId: "local-attempt", state: "queued", output: "" };
			const run = { snapshot, context, command, subscribers: new Set(), started: false };
			runs.set(command.runId, run);
			record({ type: "submitted", goal: input.text, runId: command.runId, sessionId });
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify({ runId: command.runId }));
			return;
		}
		const match = url.pathname.match(/^\/validation\/runs\/([^/]+)(\/stream)?$/u);
		const run = match && runs.get(match[1]);
		if (!run) { response.writeHead(404).end(); return; }
		if (!match[2]) {
			response.setHeader("Content-Type", "application/json");
			response.end(JSON.stringify(run.snapshot));
			return;
		}
		response.writeHead(200, { "Content-Type": "text/event-stream" });
		response.write(": connected\n\n");
		run.subscribers.add(response);
		response.on("close", () => run.subscribers.delete(response));
		// 明确的测试屏障：订阅建立后才启动真实执行，不以sleep猜测速度。
		if (!run.started) {
			run.started = true;
			void execute(run).catch((error) => { record({ type: "executeError", message: error.message }); });
		}
	}

	async function execute(run) {
		const execution = kernel.run(run.context, run.command);
		assert.equal(kernel.getRun(run.command.runId)?.status, "RUNNING");
		publish(run, "running");
		const result = await execution;
		assert.equal(result.status, "completed");
		assert.equal(result.turns, 3);
		assert.equal(result.toolCalls, 2);
		assert.ok(result.events.some((event) => event.type === "ChildRunCompleted"));
		const session = kernel.sessions.find((item) => item.sessionId === run.command.sessionId);
		assert.ok(session, "执行完成的 Session 必须存在");
		assert.equal(session.activeRunBinding, undefined);
		run.snapshot.output = result.output;
		run.snapshot.outputRevision++;
		publish(run, result.status);
		record({ type: "kernelCompleted", runId: result.runId, status: kernel.getRun(result.runId).status,
			turns: result.turns, toolCalls: result.toolCalls, events: result.events.map((event) => event.type),
			output: result.output, sessionCount: sessions.size });
	}

	function publish(run, state) {
		run.snapshot.state = state;
		run.snapshot.version++;
		run.snapshot.eventSequence++;
		const notice = { kind: "run.updated", runId: run.snapshot.runId,
			sequence: run.snapshot.eventSequence, version: run.snapshot.version };
		for (const subscriber of run.subscribers) subscriber.write(`data: ${JSON.stringify(notice)}\n\n`);
	}
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert.ok(address && typeof address === "object");
	writeFileSync(path.join(evidence, "endpoint.json"), JSON.stringify({ endpoint: `http://127.0.0.1:${address.port}` }), { mode: 0o600 });
	record({ type: "ready", pid: process.pid });
	process.on("SIGTERM", () => { server.closeAllConnections(); server.close(() => process.exit(0)); });
}

async function terminal() {
	const endpoint = process.env.LAWCLAW_CHAIN_ENDPOINT;
	assert.ok(endpoint);
	const terminalDevice = new ProcessTerminal();
	const screen = new TuiMainScreen(terminalDevice);
	const label = new Text("局部链路就绪：输入中文；/quit退出", 0, 0);
	const plain = (text) => text;
	const editor = new Editor(screen, { borderColor: plain, selectList: {
		selectedPrefix: plain, selectedText: plain, description: plain, scrollInfo: plain, noMatch: plain } });
	let active = false;
	const headers = { Authorization: `Bearer ${token}` };
	const observation = new RunObservation({
		getRun: async (id, signal) => {
			const response = await fetch(`${endpoint}/validation/runs/${id}`, { headers, signal });
			assert.equal(response.status, 200);
			return response.json();
		},
		subscribe: (id, _after, signal, notice, failure) => {
			void readEvents(id, signal, notice).catch((error) => { if (!signal.aborted) failure(error); });
		},
	}, (state) => {
		if (state.phase === "stale") { label.setText("链路失败"); record({ type: "failed" }); }
		else if (state.snapshot?.state === "completed") {
			active = false;
			label.setText(stripVTControlCharacters(state.snapshot.output));
			record({ type: "displayed", runId: state.snapshot.runId, output: state.snapshot.output });
		}
		screen.requestRender();
	});
	const adapter = new EditorAdapter(editor, (draft) => {
		void submit(draft).catch((error) => { record({ type: "terminalError", message: error.message }); close(1); });
	}, (draft) => { record({ type: "draftEdited", text: draft.text }); screen.requestRender(); });
	const focused = { render: (width) => editor.render(width), invalidate: () => editor.invalidate(),
		handleInput: (input) => adapter.handleInput(input),
		get focused() { return editor.focused; }, set focused(value) { editor.focused = value; } };
	screen.addChild(label);
	screen.addChild(focused);
	screen.setFocus(focused);
	screen.start();
	record({ type: "terminalReady", raw: process.stdin.isRaw });
	process.on("SIGTERM", () => close(1));

	async function readEvents(id, signal, notice) {
		const response = await fetch(`${endpoint}/validation/runs/${id}/stream`, { headers, signal });
		assert.equal(response.status, 200);
		let buffer = "";
		const decoder = new TextDecoder();
		for await (const chunk of response.body) {
			buffer += decoder.decode(chunk, { stream: true });
			assert.ok(buffer.length < 65536);
			let end;
			while ((end = buffer.indexOf("\n\n")) !== -1) {
				const frame = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);
				if (frame.startsWith("data: ")) { notice(JSON.parse(frame.slice(6))); record({ type: "sseReceived" }); }
			}
		}
	}
	async function submit(draft) {
		const input = parseTuiInput(draft.text, terminalDevice.columns);
		record({ type: "input", kind: input.kind, columns: terminalDevice.columns });
		if (input.kind === "command" && input.name === "quit") { close(0); return; }
		if (input.kind !== "conversation" || active) return;
		active = true;
		const response = await fetch(`${endpoint}/validation/run`, { method: "POST", headers: {
			...headers, "Content-Type": "application/json" }, body: JSON.stringify({ text: input.text }) });
		assert.equal(response.status, 200);
		const receipt = await response.json();
		adapter.clearAccepted(draft);
		observation.observe(receipt.runId);
	}
	function close(code) {
		observation.dispose();
		adapter.dispose();
		screen.stop();
		record({ type: "closed", raw: process.stdin.isRaw, code });
		process.exit(code);
	}
}
