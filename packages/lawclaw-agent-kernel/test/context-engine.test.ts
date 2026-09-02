import assert from "node:assert/strict";
import { test } from "node:test";
import { loadRuntimeSettings } from "../src/config/index.ts";
import { KernelError } from "../src/contracts/index.ts";
import { ContextEngine } from "../src/kernel/context-engine.ts";

const contextConfig = loadRuntimeSettings().config.kernel.context;

test("ContextEngine 保留必选项并按优先级裁剪可选项", () => {
	const frame = new ContextEngine(contextConfig).assemble({
		systemPrompt: "安全系统约束",
		goal: "完成验证",
		maxInputTokens: 90,
		outputReserveTokens: 20,
		items: [
			{
				itemId: "required",
				sourceRef: "policy:1",
				kind: "instruction",
				content: "必须保留的安全约束",
				priority: 100,
				required: true,
				classification: "internal",
			},
			{
				itemId: "optional-high",
				sourceRef: "doc:high",
				kind: "document",
				content: "高优先级信息".repeat(8),
				priority: 10,
				required: false,
				classification: "internal",
			},
			{
				itemId: "optional-low",
				sourceRef: "doc:low",
				kind: "document",
				content: "低优先级信息".repeat(20),
				priority: 1,
				required: false,
				classification: "internal",
			},
		],
	});

	assert.ok(frame.reductionTrace.selectedItemIds.includes("required"));
	assert.ok(frame.reductionTrace.droppedItemIds.includes("optional-low"));
	assert.ok(frame.reductionTrace.estimatedTokensAfter <= 70);
});

test("ContextEngine 拒绝内联 Secret", () => {
	assert.throws(
		() =>
			new ContextEngine(contextConfig).assemble({
				systemPrompt: "system",
				goal: "goal",
				maxInputTokens: 100,
				outputReserveTokens: 10,
				items: [
					{
						itemId: "secret",
						sourceRef: "secret:1",
						kind: "document",
						content: "不可进入上下文",
						priority: 100,
						required: true,
						classification: "secret",
					},
				],
			}),
		(error: unknown) => error instanceof KernelError && error.code === "CONTEXT_INVALID",
	);
});
