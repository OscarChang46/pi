import {
	type AgentAdapter,
	type AgentEvent,
	type AgentExecutionBudget,
	type AgentRunResult,
	type JsonValue,
	type KernelAssistantMessage,
	KernelError,
	type KernelMessage,
	type RequestContext,
	type StartAgentRunCommand,
	type TimePort,
	type ToolDescriptor,
	type ToolInvocation,
} from "../contracts/index.ts";
import type { ContextEngine } from "./context-engine.ts";
import type { DelegationEngine } from "./delegation-engine.ts";
import { assertRequestContext } from "./request-context-guard.ts";
import type { ToolRuntime } from "./tool-runtime.ts";

const delegationToolDescriptorBase = {
	name: "lawclaw_delegate",
	version: "1.0.0",
	description: "把单一技术分析目标委派给受限、只读、不可递归的子 Agent。",
	risk: "read_only" as const,
	inputSchema: {
		type: "object" as const,
		properties: { task: { type: "string", description: "有界的技术委派目标" } },
		required: ["task"],
		additionalProperties: false,
	},
} as const;

/**
 * Kernel 拥有的有界 Agent Loop。
 *
 * 控制权：每一轮只让 Adapter 生成候选动作，工具政策、委派、上下文和终止条件都在 Kernel 内决定。
 * 结果语义：返回技术候选输出；调用方业务编排仍负责决定是否采纳。
 * 当前限制：事件保存在内存，持久化 Journal 与崩溃恢复由后续存储适配器提供。
 */
export class AgentLoopEngine {
	readonly #delegationToolDescriptor: ToolDescriptor;
	readonly #adapter: AgentAdapter;
	readonly #contextEngine: ContextEngine;
	readonly #toolRuntime: ToolRuntime;
	readonly #delegationEngine: DelegationEngine;
	readonly #runLimits: AgentExecutionBudget;
	readonly #timePort: TimePort;

	/** 装配稳定端口和配置化 Run 上限；所有具体实现仍由 Composition Root 创建。 */
	public constructor(
		adapter: AgentAdapter,
		contextEngine: ContextEngine,
		toolRuntime: ToolRuntime,
		delegationEngine: DelegationEngine,
		runLimits: AgentExecutionBudget,
		delegationToolMaxResultBytes: number,
		timePort: TimePort,
	) {
		this.#adapter = adapter;
		this.#contextEngine = contextEngine;
		this.#toolRuntime = toolRuntime;
		this.#delegationEngine = delegationEngine;
		this.#runLimits = runLimits;
		this.#timePort = timePort;
		this.#delegationToolDescriptor = Object.freeze({
			...delegationToolDescriptorBase,
			maxResultBytes: delegationToolMaxResultBytes,
		});
	}

	/** 执行一次有界 Agent Run，并返回规范化事件、输出和最后一个 ContextFrame。 */
	public async run(
		context: RequestContext,
		command: StartAgentRunCommand,
		externalSignal: AbortSignal = new AbortController().signal,
	): Promise<AgentRunResult> {
		assertRequestContext(context, this.#timePort);
		if (
			command.budget.maxTurns <= 0 ||
			command.budget.maxToolCalls <= 0 ||
			command.budget.maxDurationMs <= 0 ||
			command.budget.maxInputTokens <= 0 ||
			command.budget.outputReserveTokens < 0 ||
			command.budget.maxOutputChars <= 0 ||
			command.budget.maxTurns > this.#runLimits.maxTurns ||
			command.budget.maxToolCalls > this.#runLimits.maxToolCalls ||
			command.budget.maxDurationMs > this.#runLimits.maxDurationMs ||
			command.budget.maxInputTokens > this.#runLimits.maxInputTokens ||
			command.budget.outputReserveTokens > this.#runLimits.outputReserveTokens ||
			command.budget.maxOutputChars > this.#runLimits.maxOutputChars
		) {
			throw new KernelError("RUN_BUDGET_EXCEEDED", "Run 预算缺失、无效或超过 Kernel 配置上限。");
		}
		await this.#toolRuntime.initialize(context);

		let frame = this.#contextEngine.assemble({
			systemPrompt: command.systemPrompt,
			goal: command.goal,
			items: command.contextItems,
			maxInputTokens: command.budget.maxInputTokens,
			outputReserveTokens: command.budget.outputReserveTokens,
		});
		const events: AgentEvent[] = [];
		let seq = 0;
		let turns = 0;
		let toolCalls = 0;
		let streamedOutputChars = 0;

		const appendEvent = (type: AgentEvent["type"], data: Readonly<Record<string, JsonValue>> = {}): void => {
			events.push({
				runId: command.runId,
				seq: ++seq,
				type,
				occurredAt: this.#timePort.now().isoUtc,
				data,
			});
		};

		appendEvent("RunStarted", { sessionId: command.sessionId });
		appendEvent("ContextAssembled", {
			frameId: frame.frameId,
			estimatedTokens: frame.estimatedTokens,
			selectedItemIds: [...frame.reductionTrace.selectedItemIds],
			droppedItemIds: [...frame.reductionTrace.droppedItemIds],
		});

		const operationDeadline = this.#timePort.parseIsoUtc(context.operation.deadlineAt);
		if (!operationDeadline) {
			throw new KernelError("CONTEXT_INVALID", "OperationContext 截止时间不是规范化 UTC 时间点。");
		}
		const remainingOperationMs = operationDeadline.epochMilliseconds - this.#timePort.now().epochMilliseconds;
		const deadlineSignal = AbortSignal.timeout(
			Math.max(1, Math.min(command.budget.maxDurationMs, remainingOperationMs)),
		);
		const signal = AbortSignal.any([externalSignal, deadlineSignal]);

		try {
			while (true) {
				if (signal.aborted) {
					appendEvent("RunCancelled", { reason: "deadline_or_cancellation" });
					return {
						runId: command.runId,
						status: "cancelled",
						output: "",
						turns,
						toolCalls,
						events,
						lastFrame: frame,
					};
				}
				if (turns >= command.budget.maxTurns) {
					throw new KernelError("RUN_BUDGET_EXCEEDED", "Agent Loop 已达到最大轮次。", false, {
						maxTurns: command.budget.maxTurns,
					});
				}

				turns += 1;
				let assistant: KernelAssistantMessage | undefined;
				const availableTools = [
					...this.#toolRuntime.listAllowed(command.toolPolicy),
					...(command.delegationPolicy.enabled &&
					command.toolPolicy.allowedToolNames.includes(this.#delegationToolDescriptor.name) &&
					command.toolPolicy.allowedRisks.includes(this.#delegationToolDescriptor.risk)
						? [this.#delegationToolDescriptor]
						: []),
				];
				for await (const candidate of this.#adapter.executeTurn(
					context,
					{ sessionId: command.sessionId, frame, tools: availableTools },
					signal,
				)) {
					if (candidate.type === "text_delta") {
						streamedOutputChars += candidate.text.length;
						if (streamedOutputChars > command.budget.maxOutputChars) {
							throw new KernelError("RUN_BUDGET_EXCEEDED", "模型流式输出超过 Run 字符上限。", false, {
								maxOutputChars: command.budget.maxOutputChars,
							});
						}
						appendEvent("OutputDelta", { chars: candidate.text.length });
					} else if (candidate.type === "turn_completed") {
						assistant = candidate.message;
					} else {
						throw new KernelError("ADAPTER_PROTOCOL_ERROR", "Agent Adapter 返回失败事件。", candidate.retryable, {
							adapterErrorCode: candidate.errorCode,
						});
					}
				}

				if (!assistant) {
					throw new KernelError("ADAPTER_PROTOCOL_ERROR", "Agent Adapter 未返回完整 Turn。", true);
				}
				if (assistant.stopReason === "error" || assistant.stopReason === "aborted") {
					throw new KernelError("ADAPTER_PROTOCOL_ERROR", "Agent Runtime 未正常完成 Turn。", true);
				}

				const requestedTools = assistant.content.filter((block) => block.type === "tool_call");
				if (requestedTools.length === 0) {
					frame = this.#contextEngine.appendTurn(
						frame,
						[assistant],
						command.budget.maxInputTokens,
						command.budget.outputReserveTokens,
					);
					const output = assistant.content
						.filter((block) => block.type === "text")
						.map((block) => block.text)
						.join("");
					if (output.length > command.budget.maxOutputChars) {
						throw new KernelError("RUN_BUDGET_EXCEEDED", "模型最终输出超过 Run 字符上限。", false, {
							maxOutputChars: command.budget.maxOutputChars,
						});
					}
					appendEvent("RunCompleted", { turns, toolCalls, outputChars: output.length });
					return { runId: command.runId, status: "completed", output, turns, toolCalls, events, lastFrame: frame };
				}

				const toolMessages: KernelMessage[] = [];
				for (const toolCall of requestedTools) {
					toolCalls += 1;
					if (toolCalls > command.budget.maxToolCalls || toolCalls > command.toolPolicy.maxCalls) {
						throw new KernelError("RUN_BUDGET_EXCEEDED", "工具调用次数超过 Run 预算。", false, {
							toolCalls,
						});
					}

					appendEvent("ToolStarted", { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName });
					if (toolCall.toolName === "lawclaw_delegate") {
						const task = toolCall.arguments.task;
						if (typeof task !== "string") {
							throw new KernelError("DELEGATION_NOT_ALLOWED", "委派任务参数必须为字符串。");
						}
						appendEvent("ChildRunStarted", { parentRunId: command.runId });
						const child = await this.#delegationEngine.delegate(
							context,
							{
								parentRunId: command.runId,
								depth: 0,
								task,
								workspaceRoot: command.workspaceRoot,
							},
							command.delegationPolicy,
							signal,
						);
						appendEvent("ChildRunCompleted", { childRunId: child.childRunId, status: child.status });
						toolMessages.push({
							role: "tool",
							toolCallId: toolCall.toolCallId,
							toolName: toolCall.toolName,
							text: child.summary,
							isError: child.status !== "completed",
						});
					} else {
						const invocation: ToolInvocation = {
							toolCallId: toolCall.toolCallId,
							toolName: toolCall.toolName,
							arguments: toolCall.arguments,
						};
						const result = await this.#toolRuntime.execute(context, invocation, command.toolPolicy, signal);
						toolMessages.push({
							role: "tool",
							toolCallId: invocation.toolCallId,
							toolName: invocation.toolName,
							text: result.text,
							isError: result.isError,
						});
					}
					appendEvent("ToolCompleted", { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName });
				}

				frame = this.#contextEngine.appendTurn(
					frame,
					[assistant, ...toolMessages],
					command.budget.maxInputTokens,
					command.budget.outputReserveTokens,
				);
				appendEvent("ContextAssembled", { frameId: frame.frameId, estimatedTokens: frame.estimatedTokens });
			}
		} catch (error) {
			const normalized =
				error instanceof KernelError ? error : new KernelError("ADAPTER_PROTOCOL_ERROR", "Run 执行失败。", true);
			appendEvent("RunFailed", { errorCode: normalized.code, retryable: normalized.retryable });
			return { runId: command.runId, status: "failed", output: "", turns, toolCalls, events, lastFrame: frame };
		}
	}
}
