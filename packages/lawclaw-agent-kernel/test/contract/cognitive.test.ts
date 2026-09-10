import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentRuntime } from "../../src/cognitive/agent-runtime.ts";
import {
	type AgentAdapter,
	type AgentTurnRequest,
	KernelError,
	type RuntimeEventCandidate,
} from "../../src/contracts/index.ts";
import { scriptedModel } from "../support/harness.ts";
import { testContext } from "../support/test-context.ts";

const request: AgentTurnRequest = {
	sessionId: "session:test",
	payload: { system: "system", task: "goal", messages: [], tools: [], materials: [], memory: [] },
	formatVersion: "ctx-input-1",
	modelAdapterVersion: "pi-context-1",
};
const completion: RuntimeEventCandidate = {
	type: "turn_completed",
	message: {
		role: "assistant",
		stopReason: "stop",
		content: [{ type: "text", text: "ok" }],
	},
};
async function collect(adapter: AgentAdapter, signal = new AbortController().signal) {
	const events: RuntimeEventCandidate[] = [];
	for await (const event of adapter.executeTurn(testContext(), request, signal)) events.push(event);
	return events;
}

test("[AK-COG-001] 单轮契约在脚本 Adapter 和真实认知组件上均返回完整候选", async () => {
	for (const wrap of [(adapter: AgentAdapter) => adapter, (adapter: AgentAdapter) => new AgentRuntime(adapter)]) {
		const model = scriptedModel([[completion]]);
		assert.deepEqual(await collect(wrap(model.adapter)), [completion]);
		assert.equal(model.calls(), 1);
	}
});

test("[AK-COG-002] 认知组件拒绝无完成帧、重复终态和失败候选", async () => {
	const sequences: RuntimeEventCandidate[][] = [
		[],
		[completion, completion],
		[{ type: "turn_failed", errorCode: "test-error", retryable: false }],
	];
	for (const sequence of sequences) {
		await assert.rejects(
			collect(new AgentRuntime(scriptedModel([sequence]).adapter)),
			(error: unknown) => error instanceof KernelError && error.code === "ADAPTER_PROTOCOL_ERROR",
		);
	}
});

test("[AK-COG-003] 已取消认知调用不进入 Adapter，缺失必需 Adapter 拒绝装配", async () => {
	const model = scriptedModel([[completion]]);
	await assert.rejects(collect(new AgentRuntime(model.adapter), AbortSignal.abort()));
	assert.equal(model.calls(), 0);
	// @ts-expect-error 故意模拟未通过类型检查的宿主装配。
	assert.throws(() => new AgentRuntime(undefined), KernelError);
});
