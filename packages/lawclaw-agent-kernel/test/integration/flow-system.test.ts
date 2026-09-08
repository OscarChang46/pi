import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { FlowGraphDefinition } from "../../src/contracts/flow-graph.ts";
import type { FlowSystemAction, FlowSystemState } from "../../src/contracts/flow-system.ts";
import { resolveSystemTransition } from "../../src/contracts/flow-system-transitions.ts";
import { FLOW_SYSTEM_ACTION } from "../../src/contracts/flow-system-values.ts";
import { ActivityInterceptor } from "../../src/control/flow-system/activity-interceptor.ts";
import { FlowEngine } from "../../src/control/flow-system/flow-engine.ts";
import { TaskGraph } from "../../src/control/flow-system/task-graph.ts";
import { SqliteFlowJournal } from "../../src/infrastructure/adapters/sqlite-flow-journal.ts";
import { temporaryWorkspace } from "../support/harness.ts";

const request = { flowRunId: "system-run", workflowVersion: "v1", input: { value: 1 } };
const activity = { key: "call-1", name: "ledger", version: "v1", input: { amount: "10.00" } };

test("FlowRun命名变更保持v1身份与Completed回放，拒绝混入AgentRun字段", async (t) => {
	const path = join(await temporaryWorkspace(t), "journal.sqlite");
	const journal = new SqliteFlowJournal(path, "tenant-a");
	const sql = new DatabaseSync(path);
	t.after(() => {
		sql.close();
		journal.close();
	});
	// 固定旧协议字节独立计算期望，防止字段改名改变摘要并丢失回放。
	const identity = `sha256:${createHash("sha256").update('{"input":{"value":1},"runId":"system-run","workflowVersion":"v1"}').digest("hex")}`;
	sql.prepare("INSERT INTO system_flow_events(scope,run_id,log_sequence,kind,payload) VALUES(?,?,?,?,?)").run(
		"tenant-a",
		"system-run",
		1,
		"Run_Admitted",
		JSON.stringify({ identity, workflowVersion: "v1" }),
	);
	const flowRun = journal.transition(journal.admit(request), FLOW_SYSTEM_ACTION.START, "STARTED");
	const token = { flowRunId: flowRun.flowRunId, epoch: flowRun.epoch };
	journal.start(token, activity);
	journal.complete(token, activity, "persisted-result");
	journal.transition(journal.get(flowRun.flowRunId), FLOW_SYSTEM_ACTION.YIELD, "WAITING");
	const replayed = await new FlowEngine(journal).run(request, (context) =>
		context.activity(activity, async () => {
			throw new Error("Completed不能重复执行");
		}),
	);
	assert.equal(replayed.result, "persisted-result");
	assert.equal(replayed.flowRunId, "system-run");
	assert.ok(!("runId" in replayed));
	assert.throws(() => journal.admit({ ...request, input: { value: 2 } }), /IDENTITY_CONFLICT/);
	const ambiguousRequest = { ...request, runId: "agent-run" };
	assert.throws(() => journal.admit(ambiguousRequest), /REQUEST_INVALID/);
});

test("[AK-FS-001] 四态完整矩阵拒绝非法迁移和终态出边", () => {
	const states: FlowSystemState[] = ["Ready", "Running", "Yield", "Terminate"];
	const actions: FlowSystemAction[] = ["start", "yield", "resume", "recover", "terminate"];
	const expected: Record<string, string> = {
		"Ready:start": "Running",
		"Ready:terminate": "Terminate",
		"Running:yield": "Yield",
		"Running:recover": "Yield",
		"Running:terminate": "Terminate",
		"Yield:resume": "Ready",
		"Yield:terminate": "Terminate",
	};
	for (const state of states)
		for (const action of actions) {
			const target = expected[`${state}:${action}`];
			if (target) assert.equal(resolveSystemTransition(state, action), target);
			else assert.throws(() => resolveSystemTransition(state, action), /INVALID_TRANSITION/);
		}
});

test("[AK-FS-002] Completed持久回放及终态幂等不再调用外部实现", async (t) => {
	const directory = await temporaryWorkspace(t);
	const path = join(directory, "journal.sqlite");
	let journal = new SqliteFlowJournal(path, "tenant-a");
	let calls = 0;
	const first = await new FlowEngine(journal).run(request, async (context) => {
		await context.activity(activity, async () => {
			calls++;
			return "ledger-ok";
		});
		context.yield("WAITING");
	});
	assert.equal(first.state, "Yield");
	journal.close();
	journal = new SqliteFlowJournal(path, "tenant-a");
	t.after(() => journal.close());
	const engine = new FlowEngine(journal);
	const second = await engine.run(request, (context) =>
		context.activity(activity, async () => {
			calls++;
			return "wrong";
		}),
	);
	assert.equal(second.result, "ledger-ok");
	assert.equal(second.state, "Terminate");
	assert.equal(
		(
			await engine.run(request, async () => {
				throw new Error("must not run");
			})
		).result,
		"ledger-ok",
	);
	assert.equal(calls, 1);
	assert.deepEqual(
		journal.history(request.flowRunId).map((e) => e.sequence),
		Array.from({ length: 8 }, (_, i) => i + 1),
	);
	assert.throws(() => journal.admit({ ...request, input: 2 }), /IDENTITY_CONFLICT/);
});

test("[AK-FS-003] 双连接竞争Started唯一资格及不同租户隔离", async (t) => {
	const path = join(await temporaryWorkspace(t), "journal.sqlite");
	const first = new SqliteFlowJournal(path, "tenant-a");
	const second = new SqliteFlowJournal(path, "tenant-a");
	const other = new SqliteFlowJournal(path, "tenant-b");
	t.after(() => {
		first.close();
		second.close();
		other.close();
	});
	const running = first.transition(first.admit(request), "start", "STARTED");
	const token = { flowRunId: request.flowRunId, epoch: running.epoch };
	let calls = 0;
	let release: (value: string) => void = () => {};
	const pending = new ActivityInterceptor(first).execute(token, activity, () => {
		calls++;
		return new Promise<string>((resolve) => {
			release = resolve;
		});
	});
	await assert.rejects(
		new ActivityInterceptor(second).execute(token, activity, async () => {
			calls++;
			return "duplicate";
		}),
		/RESULT_UNKNOWN/,
	);
	release("ok");
	assert.equal(await pending, "ok");
	assert.equal(calls, 1);
	assert.throws(() => second.start(token, { ...activity, input: 2 }), /IDENTITY_CONFLICT/);
	assert.equal(other.admit(request).state, "Ready");
	assert.equal(other.history(request.flowRunId).length, 1);
});

test("[AK-FS-004] 追加日志禁止UPDATE DELETE及陈旧代次提交", async (t) => {
	const path = join(await temporaryWorkspace(t), "journal.sqlite");
	const journal = new SqliteFlowJournal(path, "tenant-a");
	const sql = new DatabaseSync(path);
	t.after(() => {
		sql.close();
		journal.close();
	});
	const running = journal.transition(journal.admit(request), "start", "STARTED");
	const token = { flowRunId: request.flowRunId, epoch: running.epoch };
	journal.start(token, activity);
	const engine = new FlowEngine(journal);
	engine.recover(request.flowRunId);
	assert.throws(() => journal.complete(token, activity, "late"), /EXECUTION_STALE/);
	assert.throws(() => sql.exec("UPDATE system_flow_events SET payload='{}'"), /APPEND_ONLY/);
	assert.throws(() => sql.exec("DELETE FROM system_flow_events"), /APPEND_ONLY/);
	assert.throws(
		() => sql.exec("INSERT OR REPLACE INTO system_flow_events SELECT * FROM system_flow_events WHERE log_sequence=1"),
		/APPEND_ONLY/,
	);
	assert.throws(
		() =>
			sql.exec(
				"INSERT OR REPLACE INTO system_flow_events SELECT scope,run_id,99,kind,activity_sequence,activity_key,payload FROM system_flow_events WHERE kind='Activity_Started'",
			),
		/APPEND_ONLY/,
	);
	assert.equal(journal.get(request.flowRunId).state, "Yield");
});

test("[AK-FS-005] 外部已生效后真实SIGKILL不重发，权威对账后回放", async (t) => {
	const directory = await temporaryWorkspace(t);
	const path = join(directory, "journal.sqlite");
	const worker = process.env.FLOW_CRASH_WORKER_BUNDLE;
	const child = spawnSync(
		process.execPath,
		worker ? [worker, directory] : ["--import", "tsx", "test/support/flow-crash-worker.ts", directory],
		{
			timeout: 15000,
			encoding: "utf8",
		},
	);
	assert.equal(child.signal, "SIGKILL", child.stderr);
	const journal = new SqliteFlowJournal(path, "tenant-a");
	t.after(() => journal.close());
	const engine = new FlowEngine(journal);
	assert.equal(journal.get(request.flowRunId).state, "Running");
	engine.recover(request.flowRunId);
	let extraCalls = 0;
	const workflow = (context: Parameters<Parameters<FlowEngine["run"]>[1]>[0]) =>
		context.activity(activity, async () => {
			extraCalls++;
			return "duplicate";
		});
	assert.equal((await engine.run(request, workflow)).state, "Yield");
	assert.equal(extraCalls, 0);
	assert.equal(readFileSync(join(directory, "ledger.txt"), "utf8"), "1");
	journal.reconcile(request.flowRunId, activity, "ledger-ok", "synthetic-ledger/receipt-1");
	assert.equal((await engine.run(request, workflow)).result, "ledger-ok");
	assert.equal(extraCalls, 0);
});

test("[AK-FS-008] 自环正常退出、未声明路径拒绝、定义漂移拒绝回放", async (t) => {
	const journal = new SqliteFlowJournal(join(await temporaryWorkspace(t), "journal.sqlite"), "tenant-a");
	t.after(() => journal.close());
	const definition: FlowGraphDefinition = {
		id: "self",
		version: "v1",
		entry: "n",
		maxVisits: 3,
		nodes: [
			{
				id: "n",
				version: "v1",
				next: ["n"],
				canExit: true,
				maxVisits: 3,
				execute: async (_context, value) =>
					Number(value) === 2
						? { kind: "exit", result: value }
						: { kind: "next", target: "n", data: Number(value) + 1 },
			},
		],
	};
	const engine = new FlowEngine(journal);
	await engine.run(request, async (context) => {
		assert.equal(await new TaskGraph(definition).execute(context, 0), 2);
		context.yield("WAITING");
	});
	const changed = new TaskGraph({ ...definition, version: "v2" });
	assert.equal(
		(await engine.run(request, (context) => changed.execute(context, 0))).reason,
		"FLOW_GRAPH_DEFINITION_CONFLICT",
	);
	const invalid = new TaskGraph({
		...definition,
		nodes: definition.nodes.map((node) => ({
			...node,
			execute: async () => ({ kind: "next" as const, target: "missing", data: 0 }),
		})),
	});
	const other = { ...request, flowRunId: "invalid-route" };
	assert.equal((await engine.run(other, (context) => invalid.execute(context, 0))).reason, "FLOW_GRAPH_ROUTE_INVALID");
	assert.equal(journal.checkpoint(other.flowRunId, "graph/1/n/result"), undefined);
});

test("[AK-FS-009] 吞掉未知Activity或主动Yield仍不能继续派发或报告成功", async (t) => {
	const journal = new SqliteFlowJournal(join(await temporaryWorkspace(t), "journal.sqlite"), "tenant-a");
	t.after(() => journal.close());
	let calls = 0;
	const result = await new FlowEngine(journal).run(request, async (context) => {
		await assert.rejects(
			context.activity(activity, async () => {
				calls++;
				throw new Error("provider secret");
			}),
		);
		await assert.rejects(
			context.activity({ ...activity, key: "next" }, async () => {
				calls++;
				return "bad";
			}),
		);
		return "false success";
	});
	assert.equal(result.state, "Yield");
	assert.equal(result.reason, "ACTIVITY_RESULT_UNKNOWN");
	assert.equal(calls, 1);
	assert.ok(!JSON.stringify(journal.history(request.flowRunId)).includes("provider secret"));
	const waiting = await new FlowEngine(journal).run({ ...request, flowRunId: "swallowed-yield" }, async (context) => {
		assert.throws(() => context.yield("WAITING"));
		return "false success";
	});
	assert.equal(waiting.state, "Yield");
});

test("[AK-FS-010] Started提交确认丢失不调用外部实现；取消隔离延迟回调", async (t) => {
	const path = join(await temporaryWorkspace(t), "journal.sqlite");
	class LostAcknowledgment extends SqliteFlowJournal {
		override start(...args: Parameters<SqliteFlowJournal["start"]>): ReturnType<SqliteFlowJournal["start"]> {
			super.start(...args);
			throw new Error("lost acknowledgment");
		}
	}
	const journal = new LostAcknowledgment(path, "tenant-a");
	t.after(() => journal.close());
	let calls = 0;
	assert.equal(
		(
			await new FlowEngine(journal).run(request, (context) =>
				context.activity(activity, async () => {
					calls++;
					return "bad";
				}),
			)
		).state,
		"Yield",
	);
	assert.equal(calls, 0);
	const normal = new SqliteFlowJournal(path, "tenant-b");
	t.after(() => normal.close());
	const engine = new FlowEngine(normal);
	let release: () => void = () => {};
	const pending = engine.run(request, (context) =>
		context.activity(
			activity,
			() =>
				new Promise((resolve) => {
					release = () => resolve("late");
				}),
		),
	);
	assert.equal(engine.terminate(request.flowRunId, "CANCELLED").state, "Terminate");
	release();
	await assert.rejects(pending, /EXECUTION_STALE/);
	assert.equal(normal.readActivity(request.flowRunId, activity)?.completed, false);
});

function graphDefinition(effect: () => void, endless = false): FlowGraphDefinition {
	return {
		id: "counter",
		version: "v1",
		entry: "a",
		maxVisits: 10,
		nodes: [
			{
				id: "a",
				version: "v1",
				next: ["b"],
				canExit: true,
				maxVisits: 4,
				execute: async (context, input) => {
					const value = Number(input);
					await context.activity({ ...activity, input: value }, async () => {
						effect();
						return value;
					});
					return !endless && value === 3
						? { kind: "exit", result: value }
						: { kind: "next", target: "b", data: value };
				},
			},
			{
				id: "b",
				version: "v1",
				next: ["a"],
				canExit: false,
				maxVisits: 4,
				execute: async (_context, input) => ({ kind: "next", target: "a", data: Number(input) + 1 }),
			},
		],
	};
}

test("[AK-FS-006] 有向环多次访问不误用前轮结果，重放检查点不重复调用", async (t) => {
	const journal = new SqliteFlowJournal(join(await temporaryWorkspace(t), "journal.sqlite"), "tenant-a");
	t.after(() => journal.close());
	let calls = 0;
	const graph = new TaskGraph(graphDefinition(() => calls++));
	const engine = new FlowEngine(journal);
	await engine.run(request, async (context) => {
		assert.equal(await graph.execute(context, 1), 3);
		context.yield("WAITING");
	});
	assert.equal((await engine.run(request, (context) => graph.execute(context, 1))).result, 3);
	assert.equal(calls, 3);
	const started = journal.history(request.flowRunId).filter((event) => event.kind === "Activity_Started");
	assert.deepEqual(
		started.map((event) => (event.payload as { sequence: number }).sequence),
		[1, 2, 3],
	);
});

test("[AK-FS-007] 环退出不可达拒绝，条件永不成立触发访问上限", async (t) => {
	const definition = graphDefinition(() => {}, true);
	assert.throws(
		() => new TaskGraph({ ...definition, nodes: definition.nodes.map((node) => ({ ...node, canExit: false })) }),
		/EXIT_UNREACHABLE/,
	);
	const journal = new SqliteFlowJournal(join(await temporaryWorkspace(t), "journal.sqlite"), "tenant-a");
	t.after(() => journal.close());
	const graph = new TaskGraph(definition);
	const result = await new FlowEngine(journal).run(request, (context) => graph.execute(context, 1));
	assert.equal(result.state, "Terminate");
	assert.equal(result.reason, "FLOW_GRAPH_VISIT_LIMIT");
	assert.equal(journal.history(request.flowRunId).filter((event) => event.kind === "Activity_Started").length, 4);
});
