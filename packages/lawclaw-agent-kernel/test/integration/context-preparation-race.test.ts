import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import type { FlowCommandHandlers } from "../../src/contracts/flow-dispatch.ts";
import { flowDigest } from "../../src/contracts/flow-value.ts";
import { FlowDriver } from "../../src/control/flow-driver.ts";
import { isAdvanceInput } from "../../src/control/react-flow/input-schema.ts";
import { ReActFlowPolicy } from "../../src/control/react-flow/react-flow-policy.ts";
import { SqliteFlowArtifacts } from "../../src/infrastructure/adapters/sqlite-flow-artifacts.ts";
import { AgentRunDatabase } from "../../src/infrastructure/state-storage/adapters/run-registry/agent-run-database.ts";
import { SqliteRunRepository } from "../../src/infrastructure/state-storage/adapters/run-registry/sqlite-run-repository.ts";
import { flowInput } from "../support/flow-engine-fixtures.ts";
import { deferred, TestClock, temporaryWorkspace } from "../support/harness.ts";

test("[AK-CTX-117] 异步准备等待取消、截止和失联接管均阻断旧候选提交", async (context) => {
	for (const mode of ["cancel", "takeover", "deadline"] as const) {
		const directory = await temporaryWorkspace(context);
		const fixture = flowInput();
		const deadlineAtMs = mode === "deadline" ? fixture.operation.nowMs + 500 : fixture.run.deadlineAtMs;
		const initial = {
			...fixture,
			run: { ...fixture.run, consumedSequence: 0, deadlineAtMs },
			operation: { ...fixture.operation, deadlineAtMs },
			event: { ...fixture.event, sequence: 1 },
		};
		const time = new TestClock(new Date(initial.operation.nowMs).toISOString());
		const engine = new ReActFlowPolicy();
		const file = join(directory, "run.sqlite");
		const rules = { advance: engine.advance.bind(engine), digest: flowDigest, isInput: isAdvanceInput };
		const store = new SqliteRunRepository(file, "scope", rules, time);
		const other = new SqliteRunRepository(file, "scope", rules, time);
		const database = new AgentRunDatabase(file);
		context.after(() => {
			store.close();
			other.close();
			database.close();
		});
		store.admit(initial);
		const entered = deferred();
		const release = deferred();
		let observedSignal: AbortSignal | undefined;
		let models = 0;
		const handlers: FlowCommandHandlers = {
			InvokeModel: async () => {
				models++;
				return null;
			},
			RequestPermission: async () => null,
			DispatchTool: async () => null,
			CreateChildRun: async () => null,
			CancelOutstanding: async () => null,
			RequestReconciliation: async () => null,
		};
		const driver = new FlowDriver({
			store,
			engine,
			time,
			handlers,
			maxAdvanceSteps: 5,
			artifacts: new SqliteFlowArtifacts(database, "scope"),
			prepareContext: async (input, signal) => {
				observedSignal = signal;
				entered.resolve();
				await release.promise;
				return input;
			},
		});
		const task = driver.drive(initial.run.runId);
		await entered.promise;
		let exited = false;
		void task.then(
			() => {
				exited = true;
			},
			() => {
				exited = true;
			},
		);
		if (mode === "cancel") {
			driver.abort(initial.run.runId);
			assert.equal(observedSignal?.aborted, true);
		} else if (mode === "takeover") {
			time.advance(30001);
			assert.ok(other.acquire(initial.run.runId, "worker:B", 30000));
		} else {
			time.advance(initial.operation.deadlineAtMs - initial.operation.nowMs + 1);
		}
		await Promise.resolve();
		assert.equal(exited, false, "原reader未退出，不得提前结束并复用实例");
		release.resolve();
		if (mode === "takeover") await assert.rejects(task, /FLOW_CONTEXT_PREPARATION_CONFLICT/);
		else await task;
		assert.equal(models, 0);
		if (mode === "deadline") {
			assert.equal(store.load(initial.run.runId)?.run.position.kind, "Cancelled");
			assert.ok(
				store.commands(initial.run.runId).every((record) => record.command.payload.kind === "CancelOutstanding"),
			);
		} else assert.equal(store.commands(initial.run.runId).length, 0);
	}
});
