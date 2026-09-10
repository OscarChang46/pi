import type {
	AssemblyCandidate,
	ContextMessage,
	ExpectedChildObservation,
	SourceRecord,
} from "../contracts/control/context-engine/assembly-contract.ts";
import { encodeCandidate } from "../contracts/control/context-engine/candidate-codec.ts";
import type {
	FrozenHistorySource,
	RunSessionContext,
	RuntimeContextDependencies,
} from "../contracts/control/context-engine/runtime-preparation.ts";
import type { DelegationPort } from "../contracts/control.ts";
import { flowId } from "../contracts/flow-value.ts";
import {
	type AgentAdapter,
	type AgentEvent,
	type AgentExecutionBudget,
	type AgentRunResult,
	type JsonValue,
	type KernelAssistantMessage,
	KernelError,
	type RequestContext,
	type StartAgentRunCommand,
	type TimePort,
	type ToolDescriptor,
	type ToolInvocation,
} from "../contracts/index.ts";
import { FLOW_COMMAND_STATUS } from "../contracts/react-flow-values.ts";
import { assertRequestContext } from "../contracts/request-context-guard.ts";
import type { ToolCoordinatorPort } from "../contracts/tool-runtime.ts";
import type { ToolExecutionScope } from "../contracts/tool-scope.ts";
import type { AgentLoopLifecyclePort } from "./agent-loop.ts";
import { completedRunHistory } from "./context-engine/completed-run-history.ts";
import { createRunContextBasis, runtimeAssemblyLimits } from "./context-engine/run-context-basis.ts";
import { projectRunMessage } from "./context-engine/run-history-projection.ts";
import { createDelegationToolDescriptor } from "./delegation-tool-descriptor.ts";

/**
 * Kernel 拥有的有界 Agent Loop。
 *
 * 控制权：每一轮只让 Adapter 生成候选动作，工具政策、委派、上下文和终止条件都在 Kernel 内决定。
 * 结果语义：返回技术候选输出；调用方业务编排仍负责决定是否采纳。
 * 当前限制：事件保存在内存，持久化 Journal 与崩溃恢复由后续存储适配器提供。
 */
export class RunFlow {
	readonly #delegationToolDescriptor: ToolDescriptor;
	readonly #adapter: AgentAdapter;
	readonly #context: RuntimeContextDependencies;
	readonly #toolRuntime: ToolCoordinatorPort;
	readonly #delegationEngine: DelegationPort;
	readonly #runLimits: AgentExecutionBudget;
	readonly #timePort: TimePort;

	/** 装配稳定端口和配置化 Run 上限；所有具体实现仍由 Composition Root 创建。 */
	public constructor(
		adapter: AgentAdapter,
		context: RuntimeContextDependencies,
		toolRuntime: ToolCoordinatorPort,
		delegationEngine: DelegationPort,
		runLimits: AgentExecutionBudget,
		delegationToolMaxResultBytes: number,
		timePort: TimePort,
	) {
		this.#adapter = adapter;
		this.#context = context;
		this.#toolRuntime = toolRuntime;
		this.#delegationEngine = delegationEngine;
		this.#runLimits = runLimits;
		this.#timePort = timePort;
		this.#delegationToolDescriptor = createDelegationToolDescriptor(delegationToolMaxResultBytes);
	}

	/** 执行一次有界 Agent Run，并返回规范化事件、输出和最后一个规范候选。 */
	public async run(
		context: RequestContext,
		command: StartAgentRunCommand,
		externalSignal: AbortSignal,
		lifecycle: AgentLoopLifecyclePort,
		toolExecutionScope: ToolExecutionScope,
		sessionContext?: RunSessionContext,
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

		const records: SourceRecord[] = [];
		const expectedChildObservations: ExpectedChildObservation[] = [];
		let candidateInput: AssemblyCandidate | null = null;

		const events: AgentEvent[] = [];
		let seq = 0;
		let turns = 0;
		let toolCalls = 0;
		let streamedOutputChars = 0;
		let activeLoopOrdinal: number | undefined;

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

		const operationDeadline = this.#timePort.parseIsoUtc(context.operation.deadlineAt);
		if (!operationDeadline) {
			throw new KernelError("CONTEXT_INVALID", "OperationContext 截止时间不是规范化 UTC 时间点。");
		}
		const remainingOperationMs = operationDeadline.epochMilliseconds - this.#timePort.now().epochMilliseconds;
		const deadlineSignal = AbortSignal.timeout(
			Math.max(1, Math.min(command.budget.maxDurationMs, remainingOperationMs)),
		);
		const signal = AbortSignal.any([externalSignal, deadlineSignal]);
		const assemble = async (tools: readonly ToolDescriptor[]) => {
			const artifacts = this.#context.artifacts;
			const basis = createRunContextBasis(artifacts, {
				runInput: records.length
					? {
							kind: "existing",
							runId: command.runId,
							sourceRunVersion: records.length,
							transcriptHeadRef: flowId("transcript", records),
						}
					: {
							kind: "initial",
							preparationId: flowId("prepare", { runId: command.runId }),
							plannedRunId: command.runId,
						},
				sessionInput: {
					kind: "existing",
					anchor: sessionContext?.anchor ?? {
						sessionId: command.sessionId,
						version: 0,
						headRef: `session-head:${command.sessionId}:0`,
					},
				},
				system: command.systemPrompt,
				task: command.goal,
				tools,
				items: command.contextItems,
				limits: runtimeAssemblyLimits(command.budget.maxInputTokens, command.budget.outputReserveTokens, 1048576),
				configVersion: flowId("context-config", command.budget),
				envelopeRef: context.tenant.authorizationSnapshot,
			});
			const completeBasis = {
				...basis,
				expectedChildObservations: [
					...(sessionContext?.expectedChildObservations ?? []),
					...expectedChildObservations,
				],
			};
			const sources: FrozenHistorySource[] = [
				{
					binding: {
						kind: "session",
						anchor: sessionContext?.anchor ?? {
							sessionId: command.sessionId,
							version: 0,
							headRef: `session-head:${command.sessionId}:0`,
						},
						recordRefs: null,
					},
					result: { records: sessionContext?.records ?? [], contents: [] },
				},
			];
			const historySources = [
				...sources,
				...(basis.runInput.kind === "existing"
					? [
							{
								binding: {
									kind: "run" as const,
									runId: command.runId,
									version: records.length,
									headRef: basis.runInput.transcriptHeadRef,
								},
								result: { records, contents: [] },
							},
						]
					: []),
			];
			const candidate = await this.#context.engineFactory.create(historySources).assemble(completeBasis, signal);
			signal.throwIfAborted();
			this.#toolRuntime.assertActive(context, toolExecutionScope);
			artifacts.put(encodeCandidate(candidate));
			appendEvent("ContextAssembled", {
				inputDigest: candidate.inputDigest,
				payloadDigest: candidate.payloadDigest,
				estimatedTokens: candidate.tokenAccounting.inputTokens,
			});
			return candidate;
		};
		const allowedTools = () => [
			...this.#toolRuntime.listAllowed(context, command.toolPolicy, toolExecutionScope),
			...(command.delegationPolicy.enabled &&
			command.toolPolicy.allowedToolNames.includes(this.#delegationToolDescriptor.name) &&
			command.toolPolicy.allowedRisks.includes(this.#delegationToolDescriptor.risk)
				? [this.#delegationToolDescriptor]
				: []),
		];
		const finishActiveLoop = (
			status: "COMPLETED" | typeof FLOW_COMMAND_STATUS.FAILED | typeof FLOW_COMMAND_STATUS.CANCELLED,
		): void => {
			if (activeLoopOrdinal === undefined) return;
			lifecycle?.loopFinished(activeLoopOrdinal, status, this.#timePort.now().isoUtc);
			activeLoopOrdinal = undefined;
		};

		try {
			candidateInput = await assemble(allowedTools());
			while (true) {
				this.#toolRuntime.assertActive(context, toolExecutionScope);
				if (signal.aborted) {
					appendEvent("RunCancelled", { reason: "deadline_or_cancellation" });
					return {
						runId: command.runId,
						status: "cancelled",
						output: "",
						turns,
						toolCalls,
						events,
						lastCandidate: candidateInput,
					};
				}
				if (turns >= command.budget.maxTurns) {
					throw new KernelError("RUN_BUDGET_EXCEEDED", "Agent Loop 已达到最大轮次。", false, {
						maxTurns: command.budget.maxTurns,
					});
				}

				turns += 1;
				activeLoopOrdinal = turns;
				lifecycle?.loopStarted(turns, this.#timePort.now().isoUtc);
				let assistant: KernelAssistantMessage | undefined;

				for await (const candidate of this.#adapter.executeTurn(
					context,
					Object.freeze({
						sessionId: command.sessionId,
						payload: candidateInput.payload,
						formatVersion: candidateInput.formatVersion,
						modelAdapterVersion: candidateInput.modelAdapterVersion,
					}),
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
					const output = assistant.content
						.filter((block) => block.type === "text")
						.map((block) => block.text)
						.join("");
					if (output.length > command.budget.maxOutputChars) {
						throw new KernelError("RUN_BUDGET_EXCEEDED", "模型最终输出超过 Run 字符上限。", false, {
							maxOutputChars: command.budget.maxOutputChars,
						});
					}
					const modelCommandId = flowId("model", { runId: command.runId, turn: turns });
					records.push(
						projectRunMessage(this.#context.artifacts, {
							runId: command.runId,
							eventId: flowId("assistant", { modelCommandId }),
							sequence: records.length,
							modelCommandId,
							message: assistant,
							requires: [],
						}),
					);
					sessionContext?.commit(
						completedRunHistory(this.#context.artifacts, command.runId, command.goal, records),
						expectedChildObservations,
					);
					appendEvent("RunCompleted", { turns, toolCalls, outputChars: output.length });
					finishActiveLoop("COMPLETED");
					return {
						runId: command.runId,
						status: "completed",
						output,
						turns,
						toolCalls,
						events,
						lastCandidate: candidateInput,
					};
				}

				const toolMessages: ContextMessage[] = [];
				let projectedAssistant: ContextMessage = assistant;
				for (const toolCall of requestedTools) {
					toolCalls += 1;
					if (toolCalls > command.budget.maxToolCalls || toolCalls > command.toolPolicy.maxCalls) {
						throw new KernelError("RUN_BUDGET_EXCEEDED", "工具调用次数超过 Run 预算。", false, {
							toolCalls,
						});
					}

					appendEvent("ToolStarted", { toolCallId: toolCall.toolCallId, toolName: toolCall.toolName });
					if (toolCall.toolName === "lawclaw_delegate") {
						this.#toolRuntime.assertActive(context, toolExecutionScope);
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
						if (child.status === "cancelled")
							throw new KernelError("DELEGATION_NOT_ALLOWED", "已取消 Child 不能编造终态观察。");
						const childId = flowId("child", { runId: command.runId, turn: turns, callId: toolCall.toolCallId });
						if (projectedAssistant.role !== "assistant") throw new Error("CONTEXT_ASSISTANT_REQUIRED");
						projectedAssistant = {
							...projectedAssistant,
							content: projectedAssistant.content.map((block) =>
								block.type === "tool_call" && block.toolCallId === toolCall.toolCallId
									? { type: "child_task", childId, childRunId: child.childRunId, task }
									: block,
							),
						};
						toolMessages.push({
							role: "task_observation",
							childId,
							childRunId: child.childRunId,
							text: child.summary,
							outcome: child.status === "completed" ? FLOW_COMMAND_STATUS.SUCCEEDED : FLOW_COMMAND_STATUS.FAILED,
							resultRef: child.status === "completed" ? this.#context.artifacts.put(child.summary) : null,
							errorRef: child.status === "failed" ? flowId("child-error", { childId }) : null,
						});
					} else {
						const invocation: ToolInvocation = {
							toolCallId: toolCall.toolCallId,
							toolName: toolCall.toolName,
							arguments: toolCall.arguments,
						};
						const result = await this.#toolRuntime.execute(
							context,
							toolExecutionScope,
							invocation,
							command.toolPolicy,
							signal,
						);
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

				const modelCommandId = flowId("model", { runId: command.runId, turn: turns });
				const declaration = projectRunMessage(this.#context.artifacts, {
					runId: command.runId,
					eventId: flowId("assistant", { modelCommandId }),
					sequence: records.length,
					modelCommandId,
					message: projectedAssistant,
					requires: [],
				});
				records.push(declaration);
				for (const [index, message] of toolMessages.entries()) {
					const record = projectRunMessage(this.#context.artifacts, {
						runId: command.runId,
						eventId: flowId("observation", { modelCommandId, index }),
						sequence: records.length,
						modelCommandId,
						message,
						requires: [declaration.recordRef],
					});
					records.push(record);
					if (message.role === "task_observation")
						expectedChildObservations.push({
							recordRef: record.recordRef,
							childId: message.childId,
							childRunId: message.childRunId,
							outcome: message.outcome,
						});
				}
				candidateInput = await assemble(allowedTools());
				finishActiveLoop("COMPLETED");
			}
		} catch (error) {
			if (signal.aborted) {
				finishActiveLoop(FLOW_COMMAND_STATUS.CANCELLED);
				appendEvent("RunCancelled", { reason: "deadline_or_cancellation" });
				return {
					runId: command.runId,
					status: "cancelled",
					output: "",
					turns,
					toolCalls,
					events,
					lastCandidate: candidateInput,
				};
			}
			finishActiveLoop(FLOW_COMMAND_STATUS.FAILED);
			const normalized =
				error instanceof KernelError ? error : new KernelError("ADAPTER_PROTOCOL_ERROR", "Run 执行失败。", true);
			appendEvent("RunFailed", { errorCode: normalized.code, retryable: normalized.retryable });
			return {
				runId: command.runId,
				status: "failed",
				output: "",
				turns,
				toolCalls,
				events,
				lastCandidate: candidateInput,
			};
		}
	}
}
