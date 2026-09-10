import assert from "node:assert/strict";
import { test } from "node:test";
import type { AssemblyAlgorithm, SourceRecord } from "../../src/contracts/control/context-engine/assembly-contract.ts";
import { flowDigest, flowId } from "../../src/contracts/flow-value.ts";
import { ContextEngine } from "../../src/control/context-engine/context-engine.ts";
import { ContextAssemblyError, createContextAssembler } from "../../src/index.ts";
import { ScopedContextArtifactReader } from "../../src/infrastructure/adapters/context-artifact-reader.ts";
import { PiContextAdapter } from "../../src/infrastructure/adapters/pi-context/pi-context-adapter.ts";
import { contextFixture } from "../support/context-assembly.ts";

test("[AK-CTX-101] 首次组装复用真实Pi映射与SQLite来源且不查询自身历史", async (t) => {
	const f = contextFixture(t);
	let reads = 0;
	const engine = createContextAssembler(
		{
			artifacts: f.artifacts,
			reader: {
				async read() {
					reads++;
					throw new Error("unexpected");
				},
			},
		},
		"causal-budget",
	);
	const candidate = await engine.assemble(f.basis, new AbortController().signal);
	assert.equal(reads, 0);
	assert.equal(candidate.payload.task, "比较A与B\n保留否定词");
	assert.equal(candidate.payloadDigest, flowId("ctx-payload", candidate.payload));
	assert.ok(Object.isFrozen(candidate.payload.tools));
	const model = new PiContextAdapter().toModelInput(candidate.payload);
	assert.equal(model.systemPrompt, "系统规则");
	const last = model.messages[model.messages.length - 1]!;
	assert.equal(last.role, "user");
	assert.ok(Array.isArray(last.content));
	assert.equal(last.content.length, 3);
	const saved = f.store.put(candidate);
	assert.deepEqual(f.store.get(saved), candidate);
});

test("[AK-CTX-102] 必选超Pi软目标保留并标记而硬字节超限失败", async (t) => {
	const f = contextFixture(t);
	const engine = createContextAssembler(
		{
			artifacts: f.artifacts,
			reader: {
				async read() {
					return { records: [], contents: [] };
				},
			},
		},
		"causal-budget",
	);
	const basis = { ...f.basis, limits: { ...f.basis.limits, inputTokenLimit: 1 } };
	const candidate = await engine.assemble(basis, new AbortController().signal);
	assert.equal(candidate.tokenAccounting.budgetStatus, "required_over_target");
	assert.equal(candidate.payload.task, "比较A与B\n保留否定词");
	await assert.rejects(
		engine.assemble({ ...basis, limits: { ...basis.limits, maxBytes: 1 } }, new AbortController().signal),
		{ code: "CONTEXT_LIMIT" },
	);
	await assert.rejects(
		engine.assemble({ ...basis, limits: { ...basis.limits, maxCandidateBytes: 1 } }, new AbortController().signal),
		{ code: "CONTEXT_LIMIT" },
	);
});

test("[AK-CTX-103] 两个Run相同callId在乱序输入中保持独立配对", async (t) => {
	const f = contextFixture(t);
	const records: SourceRecord[] = [];
	for (const [index, originAgentRunId] of ["RA", "RB"].entries()) {
		const identity = { originAgentRunId, modelCommandId: "M1", callId: "c1" };
		const request = f.record(originAgentRunId, "request", index * 2, {
			role: "assistant",
			content: [{ type: "tool_call", toolCallId: "c1", toolName: "read", arguments: { path: originAgentRunId } }],
			stopReason: "tool_use",
		});
		const result = f.record(originAgentRunId, "result", index * 2 + 1, {
			role: "tool",
			toolCallId: "c1",
			toolName: "read",
			text: originAgentRunId,
			isError: false,
		});
		records.push(
			{ ...result, callBindings: [{ identity, side: "result", blockOrdinal: null }] },
			{ ...request, callBindings: [{ identity, side: "request", blockOrdinal: 0 }] },
		);
	}
	const source = f.history(records);
	const candidate = await createContextAssembler({ ...source, artifacts: f.artifacts }, "causal-budget").assemble(
		source.basis,
		new AbortController().signal,
	);
	assert.equal(candidate.trace.units.length, 2);
	assert.equal(candidate.trace.toolCalls.length, 2);
	assert.deepEqual(
		candidate.payload.messages
			.filter((message) => message.role === "tool")
			.map((message) => [message.text, message.toolCallId]),
		[
			["RA", "ctxcall_0"],
			["RB", "ctxcall_1"],
		],
	);
	assert.equal(records[0]!.message?.role === "tool" && records[0]!.message.toolCallId, "c1");
});

test("[AK-CTX-104] Child失败事实可组装而漏传补空及UNKNOWN不会沉默成功", async (t) => {
	const f = contextFixture(t);
	const declaration = f.record("RA", "declare", 0, {
		role: "assistant",
		content: [{ type: "child_task", childId: "child:1", childRunId: "RC", task: "检查合同" }],
		stopReason: "stop",
	});
	const observation = f.record("RA", "observe", 1, {
		role: "task_observation",
		childId: "child:1",
		childRunId: "RC",
		outcome: "FAILED",
		errorRef: "error:1",
		resultRef: null,
		text: "资料缺失，未完成检查",
	});
	const expectedChildObservations = [
		{ recordRef: observation.recordRef, childId: "child:1", childRunId: "RC", outcome: "FAILED" as const },
	];
	const source = f.history([declaration, observation]);
	const engine = createContextAssembler({ ...source, artifacts: f.artifacts }, "causal-budget");
	const result = await engine.assemble({ ...source.basis, expectedChildObservations }, new AbortController().signal);
	assert.equal(result.trace.units.length, 1);
	assert.equal(result.payload.messages[1]?.role, "task_observation");
	for (const records of [
		[declaration],
		[declaration, { ...observation, message: { ...observation.message!, text: "" } }],
		[declaration, { ...observation, message: { ...observation.message!, outcome: "UNKNOWN" } }],
	]) {
		const bad = {
			...source,
			reader: {
				async read() {
					return { records, contents: [] };
				},
			},
		};
		// 通过外部JSON边界注入坏变体，验证运行期Schema而非依赖编译器拒绝。
		const invalid = JSON.parse(JSON.stringify(records)) as SourceRecord[];
		const badEngine = createContextAssembler(
			{
				artifacts: f.artifacts,
				reader: {
					async read() {
						return { records: invalid, contents: [] };
					},
				},
			},
			"causal-budget",
		);
		await assert.rejects(
			badEngine.assemble({ ...bad.basis, expectedChildObservations }, new AbortController().signal),
			ContextAssemblyError,
		);
	}
});

test("[AK-CTX-105] 依赖缺失与环在选择前失败且Pi不作为修复回退", async (t) => {
	const f = contextFixture(t);
	const first = f.record("RA", "first", 0, { role: "user", text: "任务" });
	const second = f.record("RA", "second", 1, {
		role: "assistant",
		content: [{ type: "text", text: "回答" }],
		stopReason: "stop",
	});
	for (const dependency of ["missing", second.recordRef]) {
		const source = f.history([
			{ ...first, dependencies: [{ fromRecordRef: first.recordRef, toRecordRef: dependency, kind: "requires" }] },
			{
				...second,
				dependencies: [{ fromRecordRef: second.recordRef, toRecordRef: first.recordRef, kind: "requires" }],
			},
		]);
		await assert.rejects(
			createContextAssembler({ ...source, artifacts: f.artifacts }, "causal-budget").assemble(
				source.basis,
				new AbortController().signal,
			),
			{ code: "SCHEMA_INVALID" },
		);
	}
});

test("[AK-CTX-106] 取消等待原reader退出且不会启动新阶段或返回候选", async (t) => {
	const f = contextFixture(t);
	const source = f.history([]);
	const controller = new AbortController();
	let entered!: () => void, release!: () => void;
	let settled = false;
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const engine = createContextAssembler(
		{
			artifacts: f.artifacts,
			reader: {
				async read(_request, signal) {
					entered();
					await gate;
					assert.equal(signal.aborted, true);
					return { records: [], contents: [] };
				},
			},
		},
		"causal-budget",
	);
	const work = engine.assemble(source.basis, controller.signal);
	const rejected = assert.rejects(work, { code: "CANCELLED" }).then(() => {
		settled = true;
	});
	await started;
	controller.abort();
	await Promise.resolve();
	assert.equal(settled, false);
	release();
	await rejected;
});

test("[AK-CTX-107] 显式Pi备选复用真实截断且版本不匹配拒绝", async (t) => {
	const f = contextFixture(t);
	const source = f.history([
		f.record("RA", "u1", 0, { role: "user", text: "过去任务" }),
		f.record("RA", "u2", 1, { role: "user", text: "最近任务" }),
	]);
	const engine = createContextAssembler({ ...source, artifacts: f.artifacts }, "pi-recent-history");
	await assert.rejects(engine.assemble(source.basis, new AbortController().signal), { code: "BINDING_MISMATCH" });
	const basis = {
		...source.basis,
		selectionVersion: flowId("ctx-alg", { algorithmId: "pi-recent-history", version: "v1" }),
	};
	const result = await engine.assemble(basis, new AbortController().signal);
	assert.equal(result.payload.messages.length, 2);
	assert.equal(result.selectionVersion, basis.selectionVersion);
});

test("[AK-CTX-108] 恶意策略漏必选被公共封装拒绝", async (t) => {
	const f = contextFixture(t);
	const record = f.record("RA", "required", 0, { role: "user", text: "必选证据" });
	const source = f.history([record]);
	const algorithm: AssemblyAlgorithm = {
		algorithmId: "malicious",
		version: "v1",
		select(input) {
			return {
				selectedUnitRefs: [],
				decisions: input.units.map((unit) => ({ unitRef: unit.unitRef, decision: "drop", reason: "budget" })),
			};
		},
	};
	const engine = new ContextEngine({
		...source,
		artifacts: f.artifacts,
		algorithm,
		estimator: new PiContextAdapter(),
	});
	await assert.rejects(
		engine.assemble(
			{
				...source.basis,
				requirements: [{ reason: "task_input", declaredByRef: "host", memberRefs: [record.recordRef] }],
				selectionVersion: flowId("ctx-alg", { algorithmId: algorithm.algorithmId, version: algorithm.version }),
			},
			new AbortController().signal,
		),
		{ code: "SCHEMA_INVALID" },
	);
});

test("[AK-CTX-109] SQLite正文损坏或读取后撤权不会交出候选", async (t) => {
	const f = contextFixture(t);
	let authorizations = 0;
	const artifacts = new ScopedContextArtifactReader(f.store, async () => {
		if (++authorizations === 2) throw new ContextAssemblyError("ACCESS_DENIED");
	});
	const reader = {
		async read() {
			return { records: [], contents: [] };
		},
	};
	await assert.rejects(
		createContextAssembler({ artifacts, reader }, "causal-budget").assemble(f.basis, new AbortController().signal),
		{ code: "ACCESS_DENIED" },
	);
	f.database.write("UPDATE flow_artifacts SET body=? WHERE id=?", "{}", f.basis.systemRef.id);
	await assert.rejects(
		createContextAssembler({ artifacts: f.artifacts, reader }, "causal-budget").assemble(
			f.basis,
			new AbortController().signal,
		),
		{ code: "DIGEST_MISMATCH" },
	);
});

test("[AK-CTX-110] 真实资料及单Memory视图解析完整交付且排名稳定", async (t) => {
	const f = contextFixture(t);
	const material = {
		sourceRef: "material:1",
		version: 1,
		contentRef: f.store.put({ schemaVersion: "ctx-text-1", text: "不得披露\n原文" }),
		priority: 1,
		requirement: null,
	};
	const query = { query: "合同" };
	const queryRef = f.store.put(query);
	const entry = (entryId: string) => ({
		entryId,
		version: 1,
		contentRef: f.store.put({ schemaVersion: "ctx-text-1", text: entryId }),
		sourceRef: "source:1",
		sensitivity: "scoped",
		supersedes: null,
	});
	const viewRef = f.store.put({
		viewId: "view:1",
		spaceId: "space:1",
		version: 1,
		epoch: 0,
		indexVersion: "index:1",
		algorithmVersion: "search:1",
		queryDigest: flowDigest(query),
		rankedEntries: [
			{ entry: entry("B"), scoreRank: 0 },
			{ entry: entry("A"), scoreRank: 0 },
		],
	});
	const memory = {
		source: {
			spaceId: "space:1",
			spaceVersion: 1,
			epoch: 0,
			indexVersion: "index:1",
			algorithmVersion: "search:1",
			queryRef,
			required: true,
		},
		viewRef,
	};
	const engine = createContextAssembler(
		{
			artifacts: f.artifacts,
			reader: {
				async read() {
					throw new Error("history not expected");
				},
			},
		},
		"causal-budget",
	);
	const candidate = await engine.assemble(
		{ ...f.basis, materials: [material], memory: [memory] },
		new AbortController().signal,
	);
	assert.deepEqual(
		candidate.payload.memory.map((item) => item.entryId),
		["A", "B"],
	);
	assert.equal(candidate.payload.materials[0]?.text, "不得披露\n原文");
	assert.equal(candidate.trace.records.length, 3);
	await assert.rejects(engine.assemble({ ...f.basis, memory: [memory, memory] }, new AbortController().signal), {
		code: "SCHEMA_INVALID",
	});
	await assert.rejects(
		engine.assemble(
			{ ...f.basis, memory: [{ ...memory, source: { ...memory.source, spaceVersion: 2 } }] },
			new AbortController().signal,
		),
		{ code: "BINDING_MISMATCH" },
	);
});

test("[AK-CTX-111] 必需Memory成功空视图合法但缺必选记录失败", async (t) => {
	const f = contextFixture(t);
	const query = { query: "missing" };
	const source = {
		spaceId: "space:1",
		spaceVersion: 1,
		queryRef: f.store.put(query),
		indexVersion: "index:1",
		algorithmVersion: "search:1",
		epoch: 0,
		required: true,
	};
	const viewRef = f.store.put({
		viewId: "view:empty",
		spaceId: source.spaceId,
		version: 1,
		epoch: 0,
		indexVersion: source.indexVersion,
		algorithmVersion: source.algorithmVersion,
		queryDigest: flowDigest(query),
		rankedEntries: [],
	});
	const engine = createContextAssembler(
		{
			artifacts: f.artifacts,
			reader: {
				async read() {
					return { records: [], contents: [] };
				},
			},
		},
		"causal-budget",
	);
	const basis = { ...f.basis, memory: [{ source, viewRef }] };
	assert.deepEqual((await engine.assemble(basis, new AbortController().signal)).payload.memory, []);
	await assert.rejects(
		engine.assemble(
			{ ...basis, requirements: [{ reason: "task_input", declaredByRef: "host", memberRefs: ["missing"] }] },
			new AbortController().signal,
		),
		{ code: "SCHEMA_INVALID" },
	);
});

test("[AK-CTX-112] 父读取范围必须完整且必选父内容超软目标保留", async (t) => {
	const f = contextFixture(t);
	const record = f.record("RA", "parent", 0, { role: "user", text: "父任务原文" });
	const anchor = { sessionId: "parent:1", version: 7, headRef: "head:7" };
	const basis = {
		...f.basis,
		sessionInput: { kind: "read_only" as const, source: anchor },
		parentContext: {
			parent: anchor,
			selectorRef: "selector:1",
			selectorVersion: "v1",
			candidateRefs: [record.recordRef],
			requiredRefs: [record.recordRef],
			maxInheritedTokens: 0,
		},
	};
	let reads = 0;
	const engine = createContextAssembler(
		{
			artifacts: f.artifacts,
			reader: {
				async read(request) {
					reads++;
					assert.equal(request.binding.kind, "session");
					assert.deepEqual(request.binding.kind === "session" && request.binding.recordRefs, [record.recordRef]);
					return { records: [record], contents: [] };
				},
			},
		},
		"causal-budget",
	);
	const candidate = await engine.assemble(basis, new AbortController().signal);
	assert.equal(reads, 1);
	assert.equal(candidate.payload.messages.length, 1);
	assert.equal(candidate.tokenAccounting.budgetStatus, "required_over_target");
	const missing = createContextAssembler(
		{
			artifacts: f.artifacts,
			reader: {
				async read() {
					return { records: [], contents: [] };
				},
			},
		},
		"causal-budget",
	);
	await assert.rejects(missing.assemble(basis, new AbortController().signal), { code: "BINDING_MISMATCH" });
});

test("[AK-CTX-113] 多工具结果按助手块顺序输出而非到达序", async (t) => {
	const f = contextFixture(t);
	const request = f.record("RA", "request", 0, {
		role: "assistant",
		content: ["A", "B"].map((name) => ({ type: "tool_call", toolCallId: name, toolName: "read", arguments: {} })),
		stopReason: "tool_use",
	});
	const identity = (callId: string) => ({ originAgentRunId: "RA", modelCommandId: "M", callId });
	const results = ["B", "A"].map((name, index) => ({
		...f.record("RA", name, index + 1, {
			role: "tool",
			toolCallId: name,
			toolName: "read",
			text: name,
			isError: false,
		}),
		callBindings: [{ identity: identity(name), side: "result" as const, blockOrdinal: null }],
	}));
	const source = f.history([
		{
			...request,
			callBindings: ["A", "B"].map((name, index) => ({
				identity: identity(name),
				side: "request" as const,
				blockOrdinal: index,
			})),
		},
		...results,
	]);
	const candidate = await createContextAssembler({ ...source, artifacts: f.artifacts }, "causal-budget").assemble(
		source.basis,
		new AbortController().signal,
	);
	assert.deepEqual(
		candidate.payload.messages.filter((message) => message.role === "tool").map((message) => message.text),
		["A", "B"],
	);
});

test("[AK-CTX-114] 可选来源只降级可用性错误且无内部重试", async (t) => {
	const f = contextFixture(t);
	const contentRef = f.store.put({ schemaVersion: "ctx-text-1", text: "optional" });
	const basis = {
		...f.basis,
		materials: [{ sourceRef: "optional:1", version: 1, contentRef, priority: 0, requirement: null }],
	};
	let attempts = 0;
	const artifacts = {
		async read(ref: typeof contentRef, signal: AbortSignal) {
			if (ref.id === contentRef.id) {
				attempts++;
				throw new ContextAssemblyError("TRANSPORT_UNAVAILABLE");
			}
			return f.artifacts.read(ref, signal);
		},
	};
	const reader = {
		async read() {
			return { records: [], contents: [] };
		},
	};
	const candidate = await createContextAssembler({ artifacts, reader }, "causal-budget").assemble(
		basis,
		new AbortController().signal,
	);
	assert.equal(attempts, 1);
	assert.deepEqual(candidate.trace.degradedSources, ["optional:1"]);
	const denied = {
		async read(ref: typeof contentRef, signal: AbortSignal) {
			if (ref.id === contentRef.id) throw new ContextAssemblyError("ACCESS_DENIED");
			return f.artifacts.read(ref, signal);
		},
	};
	await assert.rejects(
		createContextAssembler({ artifacts: denied, reader }, "causal-budget").assemble(
			basis,
			new AbortController().signal,
		),
		{ code: "ACCESS_DENIED" },
	);
});
