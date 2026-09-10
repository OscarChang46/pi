import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import type { AgentAdapter, AgentTurnRequest, RuntimeEventCandidate, TimePoint } from "../../src/contracts/index.ts";
import { SystemTimeAdapter } from "../../src/infrastructure/adapters/system-time-adapter.ts";

/** 可推进的墙上时钟与独立单调时间；时间解析继续使用真实 Adapter。 */
export class TestClock extends SystemTimeAdapter {
	#epoch: number;
	#monotonic = 0;
	constructor(isoUtc = "2026-09-03T00:00:00.000Z") {
		super();
		const point = this.parseIsoUtc(isoUtc);
		assert.ok(point);
		this.#epoch = point.epochMilliseconds;
	}
	advance(milliseconds: number): void {
		assert.ok(Number.isSafeInteger(milliseconds) && milliseconds >= 0);
		this.#epoch += milliseconds;
		this.#monotonic += milliseconds;
	}
	override now(): TimePoint {
		return { epochMilliseconds: this.#epoch, isoUtc: new Date(this.#epoch).toISOString() };
	}
	override monotonicMilliseconds(): number {
		return this.#monotonic;
	}
}

/** 显式信号屏障，不以 sleep 猜测异步执行进度。 */
export function deferred<T = void>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}

/** 创建后立即登记清理，断言失败也回收临时工作区。 */
export async function temporaryWorkspace(context: TestContext): Promise<string> {
	const directory = await mkdtemp(path.join(os.tmpdir(), "lawclaw-case-"));
	context.after(() => rm(directory, { recursive: true, force: true }));
	return directory;
}

/** 按轮输出规范化候选，并暴露调用计数供独立断言。 */
export function scriptedModel(turns: readonly (readonly RuntimeEventCandidate[])[]) {
	let calls = 0;
	const requests: AgentTurnRequest[] = [];
	const adapter: AgentAdapter = {
		async *executeTurn(_context, request, signal) {
			signal.throwIfAborted();
			assert.deepEqual(Object.keys(request).sort(), [
				"formatVersion",
				"modelAdapterVersion",
				"payload",
				"sessionId",
			]);
			assert.equal(request.formatVersion, "ctx-input-1");
			assert.equal(request.modelAdapterVersion, "pi-context-1");
			requests.push(structuredClone(request));
			const turn = turns[calls++];
			assert.ok(turn, "模型调用超过测试脚本");
			for (const event of turn) yield event;
		},
	};
	return { adapter, requests, calls: () => calls };
}

/** 验证当前内存事件序列；不声称具备 Journal 持久化。 */
export function assertEventSequence(events: readonly { seq: number }[]): void {
	assert.deepEqual(
		events.map((event) => event.seq),
		events.map((_, index) => index + 1),
	);
}
