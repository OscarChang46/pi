import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { flowDigest } from "../../src/contracts/flow-value.ts";
import { isAdvanceInput } from "../../src/control/react-flow/input-schema.ts";
import { ReActFlowPolicy as FlowEngine } from "../../src/control/react-flow/react-flow-policy.ts";
import { AgentRunDatabase } from "../../src/infrastructure/state-storage/adapters/run-registry/agent-run-database.ts";
import { SqliteRunRepository } from "../../src/infrastructure/state-storage/adapters/run-registry/sqlite-run-repository.ts";
import { flowInput } from "../support/flow-engine-fixtures.ts";
import { TestClock, temporaryWorkspace } from "../support/harness.ts";

test("[AK-FE-028] 命令插入故障回滚同事务的Run快照和事件回执，修复后可提交", async (t) => {
	const directory = await temporaryWorkspace(t);
	const fixture = flowInput();
	const input = { ...fixture, run: { ...fixture.run, consumedSequence: 0 }, event: { ...fixture.event, sequence: 1 } };
	const clock = new TestClock(new Date(input.operation.nowMs).toISOString());
	const engine = new FlowEngine();
	const path = join(directory, "flow.sqlite");
	const store = new SqliteRunRepository(
		path,
		"scope",
		{ advance: engine.advance.bind(engine), digest: flowDigest, isInput: isAdvanceInput },
		clock,
	);
	const injection = new AgentRunDatabase(path);
	t.after(() => {
		store.close();
		injection.close();
	});
	store.admit(input);
	const claim = store.acquire(input.run.runId, "worker", 30000);
	assert.ok(claim);
	const result = engine.advance(input);
	assert.equal(result.kind, "advance");
	injection.write(
		"CREATE TRIGGER fail_command_insert BEFORE INSERT ON flow_commands BEGIN SELECT RAISE(ABORT, 'injected command write failure'); END",
	);
	await assert.rejects(store.commit({ input, decision: result.decision, claim }), /injected command write failure/);
	assert.deepEqual(store.load(input.run.runId), input);
	assert.equal(store.commands(input.run.runId).length, 0);
	assert.deepEqual(await store.queryCommit(input.run.runId, result.decision.decisionId), { kind: "absent" });
	injection.write("DROP TRIGGER fail_command_insert");
	assert.equal((await store.commit({ input, decision: result.decision, claim })).kind, "committed");
	assert.equal(store.commands(input.run.runId).length, 1);
});

test("[AK-FE-019] SQLite提交重开可查询且双连接旧版本不能再次提交", async (t) => {
	const directory = await temporaryWorkspace(t);
	const input = flowInput();
	const initial = { ...input, run: { ...input.run, consumedSequence: 0 }, event: { ...input.event, sequence: 1 } };
	const clock = new TestClock(new Date(input.operation.nowMs).toISOString());
	const engine = new FlowEngine();
	const rules = { advance: engine.advance.bind(engine), digest: flowDigest, isInput: isAdvanceInput };
	let first = new SqliteRunRepository(join(directory, "flow.sqlite"), "scope-a", rules, clock);
	const second = new SqliteRunRepository(join(directory, "flow.sqlite"), "scope-a", rules, clock);
	const other = new SqliteRunRepository(join(directory, "flow.sqlite"), "scope-b", rules, clock);
	t.after(() => {
		first.close();
		second.close();
		other.close();
	});
	first.admit(initial);
	first.admit(initial);
	assert.equal(other.load(initial.run.runId), null);
	assert.throws(
		() => first.admit({ ...initial, operation: { ...initial.operation, requestId: "different" } }),
		/CONFLICT/,
	);
	const claim = first.acquire(initial.run.runId, "worker-a", 30000);
	assert.ok(claim);
	assert.equal(second.acquire(initial.run.runId, "worker-b", 30000), null);
	const result = engine.advance(initial);
	assert.equal(result.kind, "advance");
	const request = { input: initial, decision: result.decision, claim };
	const committed = await first.commit(request);
	assert.equal(committed.kind, "committed");
	assert.deepEqual(await second.commit(request), committed);
	assert.equal(second.commands(initial.run.runId).length, 1);
	const changed = engine.advance({
		...initial,
		operation: { ...initial.operation, nowMs: initial.operation.nowMs + 1 },
	});
	assert.equal(changed.kind, "advance");
	assert.deepEqual(await second.commit({ ...request, decision: changed.decision }), {
		kind: "conflict",
		actualVersion: initial.run.version + 1,
		reason: "version",
	});
	first.close();
	first = new SqliteRunRepository(join(directory, "flow.sqlite"), "scope-a", rules, clock);
	assert.deepEqual(await first.queryCommit(initial.run.runId, result.decision.decisionId), committed);
	assert.equal(first.load(initial.run.runId)?.run.position.kind, "AwaitingModel");
	const command = result.decision.commands[0];
	assert.deepEqual(first.claimCommand(initial.run.runId, command.commandId, claim), command);
	assert.equal(second.claimCommand(initial.run.runId, command.commandId, claim), null);
	clock.advance(30000);
	assert.equal(first.claimCommand(initial.run.runId, command.commandId, claim), null);
});

test("[AK-FE-020] SQLite拒绝伪造计划并在取消栅栏后阻断业务命令", async (t) => {
	const directory = await temporaryWorkspace(t);
	const input = flowInput();
	const initial = { ...input, run: { ...input.run, consumedSequence: 0 }, event: { ...input.event, sequence: 1 } };
	const clock = new TestClock(new Date(input.operation.nowMs).toISOString());
	const engine = new FlowEngine();
	const store = new SqliteRunRepository(
		join(directory, "flow.sqlite"),
		"scope",
		{ advance: engine.advance.bind(engine), digest: flowDigest, isInput: isAdvanceInput },
		clock,
	);
	t.after(() => store.close());
	store.admit(initial);
	const claim = store.acquire(initial.run.runId, "worker", 30000);
	assert.ok(claim);
	const result = engine.advance(initial);
	assert.equal(result.kind, "advance");
	const forged = {
		...result.decision,
		next: { ...result.decision.next, usage: { ...result.decision.next.usage, turnsReserved: 0 } },
	};
	assert.deepEqual(await store.commit({ input: initial, decision: forged, claim }), {
		kind: "rejected",
		code: "INVALID_DECISION",
	});
	assert.equal(store.load(initial.run.runId)?.run.version, initial.run.version);
	assert.equal(store.commands(initial.run.runId).length, 0);
	assert.equal((await store.commit({ input: initial, decision: result.decision, claim })).kind, "committed");
	assert.deepEqual(await store.commit({ input: initial, decision: forged, claim }), {
		kind: "rejected",
		code: "IDEMPOTENCY_CONFLICT",
	});
	store.cancel(initial.run.runId);
	store.cancel(initial.run.runId);
	assert.equal(store.load(initial.run.runId)?.run.cancelEpoch, initial.run.cancelEpoch + 1);
	assert.equal(store.claimCommand(initial.run.runId, result.decision.commands[0].commandId, claim), null);
});

test("[AK-FE-026] 租约到期以新Attempt接管待消费事件，旧持有者无法提交", async (t) => {
	const directory = await temporaryWorkspace(t);
	const input = flowInput();
	const initial = { ...input, run: { ...input.run, consumedSequence: 0 }, event: { ...input.event, sequence: 1 } };
	const clock = new TestClock(new Date(input.operation.nowMs).toISOString());
	const engine = new FlowEngine();
	const store = new SqliteRunRepository(
		join(directory, "flow.sqlite"),
		"scope",
		{ advance: engine.advance.bind(engine), digest: flowDigest, isInput: isAdvanceInput },
		clock,
	);
	t.after(() => store.close());
	store.admit(initial);
	const old = store.acquire(initial.run.runId, "old", 1000);
	assert.ok(old);
	clock.advance(1000);
	const claim = store.acquire(initial.run.runId, "new", 30000);
	assert.ok(claim);
	assert.notEqual(claim.attemptId, old.attemptId);
	assert.equal(claim.fence, old.fence + 1);
	const recovered = store.load(initial.run.runId);
	assert.ok(recovered && initial.context);
	const resumed = {
		...recovered,
		context: { ...initial.context, sourceRunVersion: recovered.run.version },
		operation: { ...recovered.operation, nowMs: clock.now().epochMilliseconds },
	};
	const result = engine.advance(resumed);
	assert.equal(result.kind, "advance");
	assert.deepEqual(await store.commit({ input: resumed, decision: result.decision, claim: old }), {
		kind: "conflict",
		reason: "claim",
		actualVersion: recovered.run.version,
	});
	assert.equal((await store.commit({ input: resumed, decision: result.decision, claim })).kind, "committed");
	assert.equal(store.commands(initial.run.runId).length, 1);
	assert.deepEqual(store.initial(initial.run.runId), initial);
});
