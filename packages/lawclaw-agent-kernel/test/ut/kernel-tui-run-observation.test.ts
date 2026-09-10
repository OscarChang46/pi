import assert from "node:assert/strict";
import { test } from "node:test";
import { RunObservation, type TuiObservation } from "../../src/clients/kernel-tui/observation.ts";
import type {
	TuiObservationClient,
	TuiRunNotice,
	TuiRunSnapshot,
	TuiStreamEvent,
} from "../../src/contracts/kernel-tui.ts";

function fixture() {
	const queries: { resolve: (value: TuiRunSnapshot) => void; signal: AbortSignal }[] = [];
	const streams: { signal: AbortSignal; notify: (event: TuiStreamEvent) => void; after: number }[] = [];
	const timers: { callback: () => void; cancelled: boolean }[] = [];
	const states: TuiObservation<TuiRunSnapshot>[] = [];
	const client: TuiObservationClient<TuiRunSnapshot> = {
		getRun: (_id, signal) => new Promise((resolve) => queries.push({ resolve, signal })),
		subscribe: (_id, after, signal, notify) => {
			streams.push({ signal, after, notify });
		},
	};
	const observer = new RunObservation(
		client,
		(state) => states.push(state),
		(callback) => {
			const timer = { callback, cancelled: false };
			timers.push(timer);
			return () => {
				timer.cancelled = true;
			};
		},
	);
	return {
		queries,
		streams,
		states,
		observer,
		tick: () => {
			const timer = timers.shift();
			assert.ok(timer);
			if (!timer.cancelled) timer.callback();
		},
	};
}

function snapshot(sequence: number, outputRevision = 1): TuiRunSnapshot {
	return {
		runId: "run-a",
		version: sequence,
		eventSequence: sequence,
		outputRevision,
		attemptId: "attempt",
		state: "running",
	};
}

function notice(sequence: number): TuiRunNotice {
	return { kind: "run.updated", runId: "run-a", sequence, version: sequence };
}

test("[AK-TUI-001] 查询在途收到最后通知后仍补查终态", async (context) => {
	const f = fixture();
	context.after(() => f.observer.dispose());
	f.observer.observe("run-a");
	f.queries[0].resolve(snapshot(10));
	await Promise.resolve();
	f.streams[0].notify(notice(11));
	f.tick();
	f.streams[0].notify(notice(12));
	f.tick(); // 在途查询不能重叠；该timer不能导致最后通知丢失。
	assert.equal(f.queries.length, 2);
	f.queries[1].resolve(snapshot(11));
	await Promise.resolve();
	f.tick();
	assert.equal(f.queries.length, 3);
	f.queries[2].resolve({ ...snapshot(12), state: "completed" });
	await Promise.resolve();
	assert.equal(f.states.at(-1)?.snapshot?.state, "completed");
	assert.equal(f.streams[0].signal.aborted, true);
});

test("[AK-TUI-002] revision变化关闭旧订阅并在新cut订阅", async (context) => {
	const f = fixture();
	context.after(() => f.observer.dispose());
	f.observer.observe("run-a");
	f.queries[0].resolve(snapshot(10));
	await Promise.resolve();
	const textIdentity = { runId: "run-a", attemptId: "attempt", streamId: "text-a", blockId: "block" };
	f.streams[0].notify({ ...textIdentity, kind: "text.start", baseOutputRevision: 1, prefix: "旧" });
	assert.equal(f.states.at(-1)?.liveText?.text, "旧");
	f.streams[0].notify(notice(11));
	f.tick();
	f.queries[1].resolve(snapshot(11, 2));
	await Promise.resolve();
	assert.equal(f.streams[0].signal.aborted, true);
	assert.equal(f.streams[1].after, 11);
	assert.equal(f.states.at(-1)?.liveText, null);
	f.streams[0].notify({ ...textIdentity, kind: "text.delta", baseOutputRevision: 1, offset: 1, text: "迟到" });
	assert.equal(f.states.at(-1)?.liveText, null);
	const newIdentity = { ...textIdentity, streamId: "text-b" };
	f.streams[1].notify({ ...newIdentity, kind: "text.start", baseOutputRevision: 2, prefix: "中😀" });
	f.streams[1].notify({ ...newIdentity, kind: "text.delta", baseOutputRevision: 2, offset: 2, text: "文" });
	f.streams[1].notify({ ...newIdentity, kind: "text.delta", baseOutputRevision: 2, offset: 2, text: "文" });
	assert.equal(f.states.at(-1)?.liveText?.text, "中😀文");
	const generation = f.states.at(-1)?.generation;
	f.streams[0].notify(notice(999));
	assert.equal(f.states.at(-1)?.generation, generation);
	assert.equal(f.queries.length, 2);
});

test("[AK-TUI-003] 缺口重取且旧响应不能覆盖新前台", async (context) => {
	const f = fixture();
	context.after(() => f.observer.dispose());
	f.observer.observe("run-a");
	f.queries[0].resolve(snapshot(10));
	await Promise.resolve();
	f.streams[0].notify(notice(12));
	assert.equal(f.streams[0].signal.aborted, true);
	f.observer.observe("run-b");
	f.queries[2].resolve({ ...snapshot(20), runId: "run-b" });
	await Promise.resolve();
	f.queries[1].resolve(snapshot(30));
	await Promise.resolve();
	assert.equal(f.states.at(-1)?.snapshot?.runId, "run-b");
});

test("[AK-TUI-004] 服务持续返回落后cut时有限停止", async (context) => {
	const f = fixture();
	context.after(() => f.observer.dispose());
	f.observer.observe("run-a");
	f.queries[0].resolve(snapshot(10));
	await Promise.resolve();
	f.streams[0].notify(notice(11));
	for (let index = 1; index <= 3; index++) {
		f.tick();
		f.queries[index].resolve(snapshot(10));
		await Promise.resolve();
	}
	assert.equal(f.states.at(-1)?.phase, "stale");
	assert.equal(f.streams[0].signal.aborted, true);
});
