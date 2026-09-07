import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	AdvanceInput,
	AdvanceResult,
	FlowPosition,
	RuntimePayload,
	TransitionPlan,
} from "../../src/contracts/flow-engine.ts";
import { DecisionFactory } from "../../src/control/flow-engine/decision-factory.ts";
import { FlowEngine } from "../../src/control/flow-engine/flow-engine.ts";
import { FLOW_TRANSITIONS } from "../../src/control/flow-engine/flow-transitions.ts";
import { InputGuard } from "../../src/control/flow-engine/input-guard.ts";
import { defineTransition } from "../../src/control/flow-engine/transition-definition.ts";
import { TransitionResolver } from "../../src/control/flow-engine/transition-resolver.ts";
import { createVariantMatcher } from "../../src/control/flow-engine/variant-matcher.ts";
import { flowInput, withEvent } from "../support/flow-engine-fixtures.ts";

const engine = new FlowEngine();
function advance(input: AdvanceInput) {
	const result = engine.advance(input);
	assert.ok(result.kind === "advance", JSON.stringify(result));
	return result.decision;
}
function model(payload: RuntimePayload): AdvanceInput {
	const base = flowInput();
	return withEvent(
		{
			...base,
			context: null,
			run: {
				...base.run,
				position: { kind: "AwaitingModel", commandId: "model-1" },
				usage: { ...base.run.usage, turnsReserved: 1 },
			},
		},
		payload,
		"model",
		"model-1",
	);
}
const artifact = flowInput().context!.promptRef;
const proposal = flowInput("V2").run.pendingActions[0];

test("[AK-FE-005] Guard拒绝未知字段作用域旧Attempt与非法事件载荷", () => {
	const base = flowInput();
	const guard = new InputGuard();
	for (const input of [
		null,
		{},
		{ ...base, secret: "hidden" },
		{ ...base, run: { ...base.run, version: -1 } },
		{ ...base, event: { ...base.event, runId: "another-run" } },
		{ ...base, event: { ...base.event, attemptId: "old" } },
		{ ...base, event: { ...base.event, payload: { kind: "Unknown" } } },
		{ ...base, contextFailure: "unavailable" },
		withEvent(
			base,
			{
				kind: "PermissionResolved",
				proposalId: "p",
				result: { kind: "allow", permitRef: "permit", expiresAtMs: 2000000 },
			},
			"recovery",
			"cmd",
		),
	]) {
		const checked = guard.check(input);
		assert.equal(checked.kind, "short_circuit");
		if (checked.kind === "short_circuit") assert.equal(checked.result.kind, "reject");
	}
});

test("[AK-FE-006] 重复终态序号缺口按优先级短路且不调用ResolverFactory", () => {
	class UnusedResolver extends TransitionResolver {
		public override resolve(): never {
			throw Error("resolver-called");
		}
	}
	class UnusedFactory extends DecisionFactory {
		public override create(): never {
			throw Error("factory-called");
		}
	}
	const guarded = new FlowEngine(new InputGuard(), new UnusedResolver(), new UnusedFactory());
	assert.equal(guarded.advance(flowInput("V3")).kind, "ignore");
	assert.equal(guarded.advance(flowInput("V8")).kind, "reject");
	const base = flowInput();
	for (const position of [
		{ kind: "Completed", outputRef: artifact },
		{ kind: "Failed", code: "FLOW_TOOL_FAILED" },
		{ kind: "Cancelled", reason: "requested" },
	] satisfies FlowPosition[])
		assert.deepEqual(guarded.advance({ ...base, run: { ...base.run, position } }), {
			kind: "ignore",
			reason: "terminal",
			existingCommitId: null,
		});
	assert.deepEqual(guarded.advance({ ...base, event: { ...base.event, sequence: 12 } }), {
		kind: "reject",
		error: { code: "FLOW_SEQUENCE_GAP", field: "event.sequence" },
	});
});

test("[AK-FE-007] 模型文本工具Child迁移保留完整转录并只预留新动作用量", () => {
	const answer = advance(
		model({
			kind: "ModelCompleted",
			modelCommandId: "model-1",
			assistantTurnRef: artifact,
			output: { kind: "answer", outputRef: artifact },
		}),
	);
	assert.equal(answer.next.position.kind, "Completed");
	assert.equal(answer.next.transcriptAppend[0].kind, "assistant");
	assert.equal(answer.commands.length, 0);
	const tools = advance(
		model({
			kind: "ModelCompleted",
			modelCommandId: "model-1",
			assistantTurnRef: artifact,
			output: { kind: "tools", proposals: [proposal] },
		}),
	);
	assert.equal(tools.next.position.kind, "AwaitingPermission");
	assert.equal(tools.commands[0].payload.kind, "RequestPermission");
	assert.equal(tools.next.usage.toolsReserved, 0);
	assert.equal(tools.next.transcriptAppend.length, 1);
	const base = flowInput();
	const spec = {
		goalRef: artifact,
		envelopeSubsetRef: "subset",
		deadlineAtMs: base.run.deadlineAtMs,
		budget: { ...base.run.budget, maxTurns: 15, maxChildren: 0 },
	};
	const child = advance(
		model({
			kind: "ModelCompleted",
			modelCommandId: "model-1",
			assistantTurnRef: artifact,
			output: { kind: "child", spec },
		}),
	);
	assert.equal(child.next.position.kind, "AwaitingChild");
	assert.equal(child.next.usage.childrenReserved, 1);
	assert.equal(child.next.transcriptAppend[0].kind, "assistant");
	assert.equal(
		advance(
			model({
				kind: "ModelCompleted",
				modelCommandId: "model-1",
				assistantTurnRef: artifact,
				output: { kind: "child", spec: { ...spec, deadlineAtMs: spec.deadlineAtMs + 1 } },
			}),
		).next.position.kind,
		"Failed",
	);
});

test("[AK-FE-008] 权限允许Ask拒绝不可用过期及预算零均有封闭结果", () => {
	const base = flowInput("V2");
	const input = {
		...base,
		run: {
			...base.run,
			position: { kind: "AwaitingPermission", proposalId: proposal.proposalId, commandId: "permission-1" } as const,
		},
	};
	for (const [result, state, command] of [
		[
			{ kind: "allow", permitRef: "permit-1", expiresAtMs: input.operation.nowMs + 1 },
			"AwaitingTool",
			"DispatchTool",
		],
		[{ kind: "ask", approvalRef: "approval-1" }, "Suspended", undefined],
		[{ kind: "deny" }, "Failed", undefined],
		[{ kind: "unavailable" }, "Failed", undefined],
		[{ kind: "allow", permitRef: "permit-1", expiresAtMs: input.operation.nowMs }, "Failed", undefined],
	] as const) {
		const d = advance(
			withEvent(
				input,
				{ kind: "PermissionResolved", proposalId: proposal.proposalId, result },
				"security",
				"permission-1",
			),
		);
		assert.equal(d.next.position.kind, state);
		assert.equal(d.commands[0]?.payload.kind, command);
		assert.equal(
			d.next.usage.toolsReserved,
			command ? input.run.usage.toolsReserved + 1 : input.run.usage.toolsReserved,
		);
	}
});

test("[AK-FE-009] UNKNOWN不重试且恢复必须匹配命令incident与结果种类", () => {
	for (const effect of ["UNKNOWN", "KNOWN_APPLIED", "NONE", "KNOWN_NOT_APPLIED"] as const) {
		const d = advance(model({ kind: "ModelFailed", modelCommandId: "model-1", effect }));
		assert.equal(d.next.position.kind, effect === "UNKNOWN" || effect === "KNOWN_APPLIED" ? "Suspended" : "Failed");
		assert.ok(d.commands.every((c) => c.payload.kind !== "InvokeModel"));
	}
	const original = flowInput("V7");
	const suspended = advance(original);
	assert.ok(suspended.next.position.kind === "Suspended" && suspended.next.position.reason.kind === "tool_unknown");
	const reason = suspended.next.position.reason;
	const input = { ...original, run: { ...original.run, position: suspended.next.position } };
	const payload = {
		kind: "EffectReconciled",
		commandId: reason.toolCommandId,
		incidentRef: reason.incidentRef,
		result: "tool_completed",
		resultRef: artifact,
	} as const;
	assert.equal(advance(withEvent(input, payload, "recovery", payload.commandId)).next.position.kind, "Ready");
	for (const change of [
		{ incidentRef: "wrong" },
		{ commandId: "wrong" },
		{ result: "model_completed" as const },
		{ resultRef: null },
	])
		assert.equal(
			engine.advance(withEvent(input, { ...payload, ...change }, "recovery", payload.commandId)).kind,
			"reject",
		);
	const failed = advance(
		withEvent(input, { ...payload, result: "not_applied", resultRef: null }, "recovery", payload.commandId),
	);
	assert.deepEqual(failed.next.position, { kind: "Failed", code: "FLOW_RECONCILIATION_FAILED" });
});

test("[AK-FE-010] Context失败预算边界与取消超时不依赖外部服务", () => {
	const base = flowInput();
	for (const contextFailure of ["unavailable", "limit_exceeded"] as const) {
		assert.equal(advance({ ...base, context: null, contextFailure }).next.position.kind, "Failed");
	}
	assert.equal(engine.advance({ ...base, context: null }).kind, "reject");
	assert.deepEqual(
		advance({ ...base, run: { ...base.run, usage: { ...base.run.usage, turnsReserved: base.run.budget.maxTurns } } })
			.next.position,
		{ kind: "Failed", code: "FLOW_BUDGET_EXCEEDED" },
	);
	const tool = flowInput("V2");
	assert.equal(
		advance({ ...tool, run: { ...tool.run, budget: { ...tool.run.budget, maxToolCalls: 1 } } }).next.position.kind,
		"Ready",
	);
	const cancelled = advance({
		...base,
		context: null,
		contextFailure: "unavailable",
		run: { ...base.run, cancellationRequested: true, cancelEpoch: 1 },
		operation: { ...base.operation, nowMs: base.operation.deadlineAtMs },
	});
	assert.deepEqual(cancelled.next.position, { kind: "Cancelled", reason: "requested" });
	assert.equal(cancelled.commands[0].deadlineAtMs, base.operation.deadlineAtMs + 30000);
});

test("[AK-FE-011] Factory拒绝终态业务命令错配下标及用量回退", () => {
	const input = flowInput();
	const resolver = new TransitionResolver();
	const factory = new DecisionFactory();
	const plan = resolver.resolve(input);
	assert.ok(!("kind" in plan));
	const invalid: TransitionPlan[] = [
		{ ...plan, next: { ...plan.next, position: { kind: "Completed", outputRef: artifact } } },
		{ ...plan, next: { ...plan.next, position: { kind: "AwaitingModel", commandOrdinal: 1 } } },
		{ ...plan, next: { ...plan.next, usage: { ...plan.next.usage, turnsReserved: 0 } } },
		{ ...plan, commands: [] },
	];
	const unexpectedStateField = {
		...plan,
		next: { ...plan.next, position: { kind: "AwaitingModel" as const, commandOrdinal: 0, permitBypass: true } },
	};
	invalid.push(unexpectedStateField);
	const unexpectedCommandField = {
		...plan,
		commands: [{ kind: "InvokeModel" as const, promptRef: artifact, commandId: "caller-chosen" }],
	};
	invalid.push(unexpectedCommandField);
	for (const p of invalid)
		assert.deepEqual(factory.create(input, p), {
			kind: "reject",
			error: { code: "FLOW_INTERNAL_PLAN_INVALID", field: null },
		});
});

test("[AK-FE-012] 未声明状态事件组合均拒绝且错配回执不解除等待", () => {
	const input = flowInput("V2");
	assert.equal(
		engine.advance(
			withEvent(
				input,
				{ kind: "ApprovalResolved", approvalRef: "approval-1", proposalId: proposal.proposalId, approved: true },
				"security",
				"approval-1",
			),
		).kind,
		"reject",
	);
	assert.equal(
		engine.advance(
			withEvent(
				input,
				{
					kind: "ToolObserved",
					toolCommandId: "wrong",
					proposalId: proposal.proposalId,
					effect: "KNOWN_APPLIED",
					outcome: "success",
					resultRef: artifact,
				},
				"tool",
				"wrong",
			),
		).kind,
		"reject",
	);
	const result: AdvanceResult = engine.advance(flowInput("V6"));
	assert.ok(result.kind === "advance");
	assert.equal(result.decision.commands.length, 1);
	assert.equal(result.decision.commands[0].payload.kind, "RequestPermission");
});

test("[AK-FE-013] 状态乘事件矩阵覆盖全部等待类型和终态封闭", () => {
	const states: FlowPosition[] = [
		{ kind: "Ready" },
		{ kind: "AwaitingModel", commandId: "command" },
		{ kind: "AwaitingPermission", commandId: "command", proposalId: proposal.proposalId },
		{ kind: "AwaitingTool", commandId: "command", proposalId: proposal.proposalId },
		{ kind: "AwaitingChild", commandId: "command", childId: "child" },
		{ kind: "Suspended", reason: { kind: "approval", approvalRef: "command", proposalId: proposal.proposalId } },
		{ kind: "Suspended", reason: { kind: "tool_unknown", toolCommandId: "command", incidentRef: "incident" } },
		{ kind: "Suspended", reason: { kind: "model_unknown", modelCommandId: "command", incidentRef: "incident" } },
		{ kind: "Completed", outputRef: artifact },
		{ kind: "Failed", code: "FLOW_TOOL_FAILED" },
		{ kind: "Cancelled", reason: "requested" },
	];
	const events: { payload: RuntimePayload; source: AdvanceInput["event"]["source"]; accepted: readonly number[] }[] = [
		{ payload: { kind: "AdvanceRequested", basisVersion: 7 }, source: "scheduler", accepted: [0] },
		{
			payload: {
				kind: "ModelCompleted",
				modelCommandId: "command",
				assistantTurnRef: artifact,
				output: { kind: "answer", outputRef: artifact },
			},
			source: "model",
			accepted: [1],
		},
		{ payload: { kind: "ModelFailed", modelCommandId: "command", effect: "NONE" }, source: "model", accepted: [1] },
		{
			payload: {
				kind: "PermissionResolved",
				proposalId: proposal.proposalId,
				result: { kind: "ask", approvalRef: "command" },
			},
			source: "security",
			accepted: [2],
		},
		{
			payload: {
				kind: "ToolObserved",
				toolCommandId: "command",
				proposalId: proposal.proposalId,
				effect: "KNOWN_APPLIED",
				outcome: "success",
				resultRef: artifact,
			},
			source: "tool",
			accepted: [3],
		},
		{
			payload: { kind: "ChildCompleted", childId: "child", outcome: "completed", resultRef: artifact },
			source: "child",
			accepted: [4],
		},
		{
			payload: { kind: "ApprovalResolved", approvalRef: "command", proposalId: proposal.proposalId, approved: true },
			source: "security",
			accepted: [5],
		},
		{
			payload: {
				kind: "EffectReconciled",
				commandId: "command",
				incidentRef: "incident",
				result: "tool_completed",
				resultRef: artifact,
			},
			source: "recovery",
			accepted: [6],
		},
		{
			payload: {
				kind: "EffectReconciled",
				commandId: "command",
				incidentRef: "incident",
				result: "model_completed",
				resultRef: artifact,
			},
			source: "recovery",
			accepted: [7],
		},
		{ payload: { kind: "CancelRequested" }, source: "scheduler", accepted: [] },
		{ payload: { kind: "DeadlineReached" }, source: "scheduler", accepted: [] },
	];
	for (const [index, position] of states.entries()) {
		const base = flowInput();
		const input = {
			...base,
			run: { ...base.run, position, pendingActions: [2, 3, 5, 6].includes(index) ? [proposal] : [] },
		};
		for (const { payload, source, accepted } of events) {
			const result = engine.advance(withEvent(input, payload, source, "command"));
			assert.equal(
				result.kind,
				index >= 8 ? "ignore" : accepted.includes(index) ? "advance" : "reject",
				`${index}/${payload.kind}`,
			);
		}
		for (const cancellationRequested of [true, false]) {
			const terminating = withEvent(
				{
					...input,
					context: null,
					run: { ...input.run, cancellationRequested },
					operation: {
						...input.operation,
						nowMs: cancellationRequested ? input.operation.nowMs : input.operation.deadlineAtMs,
					},
				},
				{ kind: cancellationRequested ? "CancelRequested" : "DeadlineReached" },
				"scheduler",
				"command",
			);
			const result = engine.advance(terminating);
			if (index >= 8) assert.equal(result.kind, "ignore");
			else {
				assert.ok(result.kind === "advance");
				assert.equal(result.decision.next.position.kind, "Cancelled");
			}
		}
	}
});

test("[AK-FE-014] 已知失败审批拒绝与输出超限不产生新业务命令", () => {
	const tool = flowInput("V2");
	const failure = advance(
		withEvent(
			tool,
			{
				kind: "ToolObserved",
				toolCommandId: "cmd-old-tool",
				proposalId: proposal.proposalId,
				effect: "KNOWN_NOT_APPLIED",
				outcome: "failed",
				resultRef: null,
			},
			"tool",
			"cmd-old-tool",
		),
	);
	assert.deepEqual(failure.next.position, { kind: "Failed", code: "FLOW_TOOL_FAILED" });
	assert.equal(failure.commands.length, 0);
	const approval = flowInput("V6");
	const denied = advance(
		withEvent(
			approval,
			{ kind: "ApprovalResolved", approvalRef: "approval-1", proposalId: proposal.proposalId, approved: false },
			"security",
			"approval-1",
		),
	);
	assert.deepEqual(denied.next.position, { kind: "Failed", code: "FLOW_PERMISSION_DENIED" });
	const over = { ...artifact, bytes: tool.run.budget.maxOutputBytes + 1 };
	const output = advance(
		model({
			kind: "ModelCompleted",
			modelCommandId: "model-1",
			assistantTurnRef: artifact,
			output: { kind: "answer", outputRef: over },
		}),
	);
	assert.deepEqual(output.next.position, { kind: "Failed", code: "FLOW_CONTEXT_LIMIT_EXCEEDED" });
	const permission = {
		...tool,
		run: {
			...tool.run,
			budget: { ...tool.run.budget, maxToolCalls: 1 },
			position: { kind: "AwaitingPermission", commandId: "permission", proposalId: proposal.proposalId } as const,
		},
	};
	const exhausted = advance(
		withEvent(
			permission,
			{
				kind: "PermissionResolved",
				proposalId: proposal.proposalId,
				result: { kind: "allow", permitRef: "permit", expiresAtMs: permission.operation.nowMs + 10 },
			},
			"security",
			"permission",
		),
	);
	assert.deepEqual(exhausted.next.position, { kind: "Failed", code: "FLOW_BUDGET_EXCEEDED" });
	assert.equal(exhausted.commands.length, 0);
});

test("[AK-FE-015] 迁移表拒绝重复出边终态出边及未声明目标", () => {
	assert.throws(
		() => new TransitionResolver([...FLOW_TRANSITIONS, FLOW_TRANSITIONS[0]]),
		/FLOW_TRANSITION_DEFINITION_INVALID/,
	);
	const failedPlan: TransitionPlan = {
		next: {
			position: { kind: "Failed", code: "FLOW_MODEL_FAILED" },
			usage: flowInput().run.usage,
			pendingActions: [],
			transcriptAppend: [],
		},
		commands: [],
	};
	for (const from of ["Completed", "Failed", "Cancelled"] as const)
		assert.throws(
			() => new TransitionResolver([defineTransition(from, "AdvanceRequested", ["Failed"], () => failedPlan)]),
			/FLOW_TRANSITION_DEFINITION_INVALID/,
		);
	assert.throws(
		() => new TransitionResolver([defineTransition("Ready", "AdvanceRequested", [], () => failedPlan)]),
		/FLOW_TRANSITION_DEFINITION_INVALID/,
	);
	const wrongTarget = new TransitionResolver([
		defineTransition("Ready", "AdvanceRequested", ["AwaitingModel"], () => failedPlan),
	]);
	assert.deepEqual(wrongTarget.resolve(flowInput()), {
		kind: "reject",
		error: { code: "FLOW_INTERNAL_PLAN_INVALID", field: null },
	});
	const resolver = new TransitionResolver();
	assert.ok(Object.isFrozen(resolver.definitions));
	assert.ok(
		resolver.definitions.every((definition) => Object.isFrozen(definition) && Object.isFrozen(definition.targets)),
	);
	assert.deepEqual(
		resolver.definitions
			.filter((d) => d.from.startsWith("Suspended."))
			.map((d) => d.from)
			.sort(),
		["Suspended.approval", "Suspended.model_unknown", "Suspended.tool_unknown"],
	);
});

test("[AK-FE-016] 新增迁移仅扩展定义且无法绕过公共取消优先级", () => {
	const input = withEvent(flowInput(), { kind: "DeadlineReached" }, "scheduler", "scheduler");
	assert.equal("kind" in new TransitionResolver().resolve(input), true);
	let calls = 0;
	// 合成扩展验证分派机制；首版生产表不允许提前Deadline事件推进。
	const extension = defineTransition("Ready", "DeadlineReached", ["Failed"], (eventInput) => {
		calls++;
		assert.equal(eventInput.run.position.kind, "Ready");
		assert.equal(eventInput.event.payload.kind, "DeadlineReached");
		return {
			next: {
				position: { kind: "Failed", code: "FLOW_MODEL_FAILED" },
				usage: eventInput.run.usage,
				pendingActions: [],
				transcriptAppend: [],
			},
			commands: [],
		};
	});
	const definitions = [...FLOW_TRANSITIONS, extension];
	const resolver = new TransitionResolver(definitions);
	definitions.pop();
	const extended = resolver.resolve(input);
	assert.ok(!("kind" in extended));
	assert.equal(extended.next.position.kind, "Failed");
	assert.equal(calls, 1);
	const cancelled = resolver.resolve({ ...input, run: { ...input.run, cancellationRequested: true } });
	assert.ok(!("kind" in cancelled));
	assert.deepEqual(cancelled.next.position, { kind: "Cancelled", reason: "requested" });
	assert.equal(calls, 1);
});

test("[AK-FE-017] 结果策略表穷尽类型并拒绝未知变体", () => {
	type Variant = { kind: "answer"; text: string } | { kind: "tools"; count: number };
	const handlers = {
		answer: (value: Variant & { kind: "answer" }) => value.text.length,
		tools: (value: Variant & { kind: "tools" }) => value.count,
	};
	const dispatch = createVariantMatcher<Variant, undefined, number>(handlers);
	assert.equal(dispatch({ kind: "answer", text: "hello" }, undefined), 5);
	assert.equal(dispatch({ kind: "tools", count: 2 }, undefined), 2);
	handlers.answer = () => 100;
	assert.equal(dispatch({ kind: "answer", text: "hello" }, undefined), 5);
	// @ts-expect-error 新增或遗漏联合变体时必须补齐策略表。
	createVariantMatcher<Variant, undefined, number>({ answer: () => 0 });
	assert.throws(() => {
		// @ts-expect-error 未通过边界校验的未知值也不能命中原型属性。
		dispatch({ kind: "toString" }, undefined);
	}, /FLOW_VARIANT_UNHANDLED/);
});

test("[AK-FE-018] 计划状态策略拒绝错绑ProposalChild与转录角色", () => {
	const input = flowInput();
	const factory = new DecisionFactory();
	const base: TransitionPlan = {
		next: { position: { kind: "Ready" }, usage: input.run.usage, pendingActions: [], transcriptAppend: [] },
		commands: [],
	};
	const plans: TransitionPlan[] = [
		{
			...base,
			next: {
				...base.next,
				position: { kind: "AwaitingPermission", proposalId: "wrong", commandOrdinal: 0 },
				pendingActions: [proposal],
			},
			commands: [{ kind: "RequestPermission", proposal }],
		},
		{
			...base,
			next: {
				...base.next,
				position: { kind: "AwaitingChild", childId: "wrong", commandOrdinal: 0 },
				usage: { ...input.run.usage, childrenReserved: 1 },
			},
			commands: [
				{
					kind: "CreateChildRun",
					childId: "child",
					spec: {
						goalRef: artifact,
						envelopeSubsetRef: "subset",
						budget: input.run.budget,
						deadlineAtMs: input.run.deadlineAtMs,
					},
				},
			],
		},
		{
			...base,
			next: {
				...base.next,
				transcriptAppend: [
					{
						kind: "assistant",
						artifact,
						eventId: input.event.eventId,
						commandId: input.event.causationId,
						proposalId: proposal.proposalId,
						childId: null,
					},
				],
			},
		},
		{
			...base,
			next: {
				...base.next,
				position: {
					kind: "Suspended",
					reason: { kind: "model_unknown", modelCommandId: "model", incidentRef: "incident" },
				},
			},
			commands: [{ kind: "RequestReconciliation", targetCommandId: "wrong", incidentRef: "incident" }],
		},
	];
	for (const plan of plans)
		assert.deepEqual(factory.create(input, plan), {
			kind: "reject",
			error: { code: "FLOW_INTERNAL_PLAN_INVALID", field: null },
		});
});
