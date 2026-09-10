import assert from "node:assert/strict";
import { test } from "node:test";
import { createFlowService } from "../../src/application/flow-composition.ts";
import type { ModelObservation } from "../../src/contracts/control/run-registry/model-observation.ts";
import { deferred, temporaryWorkspace } from "../support/harness.ts";

test("[AK-TUI-011] 真实持久Kernel在模型完成前公开原始增量，按码点定位且重驱动不重放", async (t) => {
	const firstDelta = deferred();
	const finish = deferred();
	const events: ModelObservation[] = [];
	let calls = 0;
	const service = await createFlowService({
		dataDirectory: await temporaryWorkspace(t),
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelObservation: {
			publish(event) {
				events.push(event);
				if (event.kind === "delta") firstDelta.resolve();
			},
		},
		modelOverride: {
			async *executeTurn() {
				calls++;
				yield { type: "text_delta", text: "中😀" };
				await finish.promise;
				yield { type: "text_delta", text: "文" };
				yield {
					type: "turn_completed",
					message: { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "中😀文" }] },
				};
			},
		},
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	service.sessions.admit(
		await service.frames.initial({ runId: "observed-run", goal: "中文", nowMs: now, deadlineAtMs: now + 15000 }),
	);
	const execution = service.driver.drive("observed-run");
	try {
		await firstDelta.promise;
		assert.notEqual(service.store.load("observed-run")?.run.position.kind, "Completed");
		assert.deepEqual(
			events.map((event) => event.kind),
			["start", "delta"],
		);
		assert.equal(events[1]?.kind === "delta" ? events[1].text : null, "中😀");
	} finally {
		finish.resolve();
	}
	await execution;
	assert.deepEqual(
		events.filter((event) => event.kind === "delta").map((event) => event.offset),
		[0, 2],
	);
	assert.deepEqual(
		events.map((event) => event.kind),
		["start", "delta", "delta", "end"],
	);
	assert.ok(events.every((event) => event.runId === "observed-run" && event.commandId === events[0]?.commandId));
	const position = service.store.load("observed-run")?.run.position;
	assert.equal(position?.kind, "Completed");
	assert.equal(service.artifacts.get(position.outputRef), "中😀文");
	await service.driver.drive("observed-run");
	assert.equal(calls, 1);
	assert.equal(events.length, 4);
});

test("[AK-TUI-012] 模型流失败关闭临时观察，不把已显示文字确认成成功结果", async (t) => {
	const events: ModelObservation[] = [];
	const service = await createFlowService({
		dataDirectory: await temporaryWorkspace(t),
		modelsPath: "unused",
		providerId: "test",
		modelId: "test",
		modelObservation: {
			publish(event) {
				events.push(event);
			},
		},
		modelOverride: {
			async *executeTurn() {
				yield { type: "text_delta", text: "未完成" };
				throw new Error("synthetic model failure");
			},
		},
	});
	t.after(() => service.close());
	const now = service.time.now().epochMilliseconds;
	service.sessions.admit(
		await service.frames.initial({ runId: "failed-stream", goal: "失败窗口", nowMs: now, deadlineAtMs: now + 15000 }),
	);
	await service.driver.drive("failed-stream");
	assert.deepEqual(
		events.map((event) => event.kind),
		["start", "delta", "end"],
	);
	assert.notEqual(service.store.load("failed-stream")?.run.position.kind, "Completed");
	assert.equal(service.store.transcript("failed-stream").filter((entry) => entry.kind === "assistant").length, 0);
});
