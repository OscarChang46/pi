import { randomUUID } from "node:crypto";
import type { FlowArtifactStore } from "../contracts/flow-artifacts.ts";
import type { AdvanceInput, AgentRunSnapshot, FrozenBindings, RunBudget } from "../contracts/flow-engine.ts";
import type { DurableFlowStore } from "../contracts/flow-storage.ts";
import { flowId } from "../contracts/flow-value.ts";
import { type AgentTurnRequest, KernelError, type KernelMessage, type ToolDescriptor } from "../contracts/index.ts";
import { REACT_FLOW_STATE } from "../contracts/react-flow-values.ts";
import type { ContextEngine } from "./context-engine.ts";
import { createFlowEvent } from "./flow-events.ts";

/** 初始Run上下文的受信任配置，HTTP调用方只能提交目标和收窄预算。 */
export interface FlowAdmissionConfig {
	/** 系统约束。 */
	readonly systemPrompt: string;
	/** 子Run使用的受限系统约束。 */
	readonly childSystemPrompt?: string;
	/** 技术预算上限。 */
	readonly budget: RunBudget;
	/** 冻结绑定，不含会话身份。 */
	readonly bindings: Omit<FrozenBindings, "sessionId" | "sessionVersion">;
	/** 已冻结的模型可见工具。 */
	readonly tools: readonly ToolDescriptor[];
}

/** 可信受理参数；HTTP仅允许提交目标与收窄截止时间。 */
export interface FlowAdmissionRequest {
	/** 幂等Run身份。 */
	readonly runId: string;
	/** 用户目标或父Run委派目标。 */
	readonly goal: string;
	/** 可信受理时间，Unix毫秒。 */
	readonly nowMs: number;
	/** Unix毫秒截止时间。 */
	readonly deadlineAtMs: number;
	/** 仅子Run装配可提供的收窄预算。 */
	readonly budget?: RunBudget;
	/** 父子协调器提供的深度；根Run为0。 */
	readonly depth?: number;
}

/** 复用ContextEngine组装首轮，并按耐久转录重建后续完整轮次。 */
export class FlowContext {
	readonly #engine: ContextEngine;
	readonly #store: DurableFlowStore;
	readonly #artifacts: FlowArtifactStore;
	readonly #config: FlowAdmissionConfig;
	/** 注入上下文引擎、持久端口与冻结配置。 */
	constructor(
		engine: ContextEngine,
		store: DurableFlowStore,
		artifacts: FlowArtifactStore,
		config: FlowAdmissionConfig,
	) {
		this.#engine = engine;
		this.#store = store;
		this.#artifacts = artifacts;
		this.#config = config;
	}
	/** 创建可提交首事件；本方法不写Run目录。 */
	initial(request: FlowAdmissionRequest): AdvanceInput {
		const { runId: agentRunId, goal, nowMs, deadlineAtMs, budget = this.#config.budget, depth = 0 } = request;
		const systemPrompt =
			depth > 0 ? (this.#config.childSystemPrompt ?? this.#config.systemPrompt) : this.#config.systemPrompt;
		const tools = this.#config.tools.filter((tool) => depth < budget.maxDepth || tool.name !== "lawclaw_delegate");
		const bindings = {
			...this.#config.bindings,
			sessionId: flowId("session", { runId: agentRunId }),
			sessionVersion: 1,
		};
		const frame = this.#engine.assemble({
			goal,
			systemPrompt,
			items: [],
			maxInputTokens: budget.maxInputTokens,
			outputReserveTokens: budget.outputReserveTokens,
		});
		const promptRef = this.#artifacts.put({ sessionId: bindings.sessionId, frame, tools });
		const payload = { kind: "AdvanceRequested" as const, basisVersion: 0 };
		const agentRun = this.#initialRun(request, budget, depth, bindings);
		const transcriptHeadRef = agentRun.transcriptHeadRef;
		return {
			protocolVersion: "1.0.0",
			run: agentRun,
			session: {
				sessionId: bindings.sessionId,
				version: 1,
				historyHeadRef: flowId("history", { runId: agentRunId }),
			},
			context: {
				frameId: frame.frameId,
				bindings,
				sourceRunVersion: 0,
				transcriptHeadRef,
				promptRef,
				inputTokens: frame.estimatedTokens,
			},
			contextFailure: null,
			event: createFlowEvent(agentRun, payload, "scheduler", agentRunId),
			priorReceipt: null,
			operation: {
				requestId: randomUUID(),
				traceparent: `00-${randomUUID().replaceAll("-", "")}-${randomUUID().replaceAll("-", "").slice(0, 16)}-01`,
				correlationId: agentRunId,
				nowMs,
				deadlineAtMs,
			},
		};
	}
	#initialRun(
		request: FlowAdmissionRequest,
		budget: RunBudget,
		depth: number,
		bindings: FrozenBindings,
	): AgentRunSnapshot {
		const { runId: agentRunId, deadlineAtMs } = request;
		const attemptId = randomUUID();
		const transcriptHeadRef = flowId("transcript", { runId: agentRunId });
		return {
			runId: agentRunId,
			attemptId,
			version: 0,
			consumedSequence: 0,
			bindings,
			position: { kind: REACT_FLOW_STATE.READY },
			budget,
			usage: { turnsReserved: 0, toolsReserved: 0, childrenReserved: 0 },
			depth,
			deadlineAtMs,
			cancelEpoch: 0,
			cancellationRequested: false,
			pendingActions: [],
			transcriptHeadRef,
		};
	}
	/** 使用已提交转录重建；缺失Artifact失败关闭，不丢弃历史继续。 */
	prepare(input: AdvanceInput): AdvanceInput {
		if (input.run.pendingActions.length) return { ...input, context: null, contextFailure: null };
		try {
			const initial = this.#store.initial(input.run.runId);
			if (!initial?.context) throw new Error("FLOW_INITIAL_CONTEXT_MISSING");
			const request = this.#artifacts.get(initial.context.promptRef) as AgentTurnRequest;
			const messages = this.#store
				.transcript(input.run.runId)
				.map((entry) => this.#artifacts.get(entry.artifact) as KernelMessage);
			const frame = this.#engine.appendTurn(
				request.frame,
				messages,
				input.run.budget.maxInputTokens,
				input.run.budget.outputReserveTokens,
			);
			const promptRef = this.#artifacts.put({ ...request, frame });
			return {
				...input,
				contextFailure: null,
				context: {
					frameId: frame.frameId,
					bindings: input.run.bindings,
					sourceRunVersion: input.run.version,
					transcriptHeadRef: input.run.transcriptHeadRef,
					promptRef,
					inputTokens: frame.estimatedTokens,
				},
			};
		} catch (error) {
			return {
				...input,
				context: null,
				contextFailure:
					error instanceof KernelError && error.code === "CONTEXT_BUDGET_EXCEEDED"
						? "limit_exceeded"
						: "unavailable",
			};
		}
	}
}
