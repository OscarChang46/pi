import { randomUUID } from "node:crypto";
import type {
	AssemblyBasis,
	ExpectedChildObservation,
	SessionAnchor,
} from "../contracts/control/context-engine/assembly-basis.ts";
import type { SessionInput } from "../contracts/control/context-engine/assembly-contract.ts";
import { decodeCandidate, encodeCandidate } from "../contracts/control/context-engine/candidate-codec.ts";
import { ContextAssemblyError } from "../contracts/control/context-engine/context-error.ts";
import { validateBasis } from "../contracts/control/context-engine/context-schema.ts";
import type {
	ContextEngineFactory,
	FrozenHistorySource,
} from "../contracts/control/context-engine/runtime-preparation.ts";
import type { AgentRunStore } from "../contracts/control/run-registry/run-storage.ts";
import type { RootSessionPreparationPort } from "../contracts/control/session-manager/session-preparation.ts";
import type { FlowArtifactStore } from "../contracts/flow-artifacts.ts";
import type {
	AdvanceInput,
	AgentRunSnapshot,
	ArtifactRef,
	FrozenBindings,
	RunBudget,
} from "../contracts/flow-engine.ts";
import { flowId } from "../contracts/flow-value.ts";
import type { ToolDescriptor } from "../contracts/index.ts";
import { REACT_FLOW_STATE } from "../contracts/react-flow-values.ts";
import type { RequestContext } from "../contracts/types.ts";
import { projectFlowHistory } from "./context-engine/flow-history-projection.ts";
import { createRunContextBasis, runtimeAssemblyLimits } from "./context-engine/run-context-basis.ts";
import { createFlowEvent } from "./flow-events.ts";
import type { DurableSessionManager } from "./session-manager/durable-session-manager.ts";

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
	/** 业务会话键；省略时使用本次 Run 独立会话。 */
	readonly sessionKey?: string;
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
	readonly #engineFactory: ContextEngineFactory;
	readonly #store: AgentRunStore;
	readonly #artifacts: FlowArtifactStore;
	readonly #config: FlowAdmissionConfig;
	readonly #sessions: DurableSessionManager;
	readonly #requestContext: () => RequestContext;
	readonly #preparation: RootSessionPreparationPort;
	/** 注入上下文引擎、持久端口与冻结配置。 */
	constructor(
		engineFactory: ContextEngineFactory,
		store: AgentRunStore,
		artifacts: FlowArtifactStore,
		config: FlowAdmissionConfig,
		sessionDependencies: {
			sessions: DurableSessionManager;
			preparation: RootSessionPreparationPort;
			requestContext: () => RequestContext;
		},
	) {
		this.#engineFactory = engineFactory;
		this.#store = store;
		this.#artifacts = artifacts;
		this.#config = config;
		this.#sessions = sessionDependencies.sessions;
		this.#preparation = sessionDependencies.preparation;
		this.#requestContext = sessionDependencies.requestContext;
	}
	/** 创建可提交首事件；本方法不写Run目录。 */
	async initial(
		request: FlowAdmissionRequest,
		signal: AbortSignal = new AbortController().signal,
	): Promise<AdvanceInput> {
		const { runId: agentRunId, goal, nowMs, deadlineAtMs, budget = this.#config.budget, depth = 0 } = request;
		const systemPrompt =
			depth > 0 ? (this.#config.childSystemPrompt ?? this.#config.systemPrompt) : this.#config.systemPrompt;
		const tools = this.#config.tools.filter((tool) => depth < budget.maxDepth || tool.name !== "lawclaw_delegate");
		const coordinator = this.#preparation;
		let basisRef: ArtifactRef | undefined;
		const prepared = await coordinator.prepare(
			this.#requestContext(),
			{
				commandId: agentRunId,
				intent: {
					logicalKey: request.sessionKey ?? agentRunId,
					agentDefinitionRef: "flow-agent",
					contextPolicyRef: this.#config.bindings.policySnapshotRef,
					parent: null,
				},
			},
			{
				assemble: async (sessionInput: SessionInput, assemblySignal: AbortSignal) => {
					const session = sessionInput.kind === "existing" ? this.#history(sessionInput.anchor.sessionId) : null;
					if (
						sessionInput.kind === "existing" &&
						session &&
						(session.anchor.version !== sessionInput.anchor.version ||
							session.anchor.headRef !== sessionInput.anchor.headRef)
					)
						throw new Error("FLOW_SESSION_VERSION_CONFLICT");
					const preparedBasis = createRunContextBasis(this.#artifacts, {
						runInput: {
							kind: "initial",
							preparationId: flowId("prepare", { runId: agentRunId }),
							plannedRunId: agentRunId,
						},
						sessionInput,
						system: systemPrompt,
						task: goal,
						tools,
						items: [],
						limits: runtimeAssemblyLimits(
							budget.maxInputTokens,
							budget.outputReserveTokens,
							budget.maxContextBytes,
						),
						configVersion: this.#config.bindings.configVersion,
						envelopeRef: this.#config.bindings.executionEnvelopeRef,
					});
					const basis = { ...preparedBasis, expectedChildObservations: session?.observations ?? [] };
					basisRef = this.#artifacts.put(basis);
					return this.#engineFactory.create(session ? [session.source] : []).assemble(basis, assemblySignal);
				},
			},
			signal,
		);
		signal.throwIfAborted();
		if (!basisRef) throw new Error("FLOW_INITIAL_CONTEXT_MISSING");
		const candidate = prepared.candidate;
		const session = { anchor: prepared.anchor };
		const bindings = {
			...this.#config.bindings,
			sessionId: prepared.anchor.sessionId,
			sessionVersion: prepared.anchor.version,
		};
		const promptRef = this.#artifacts.put(encodeCandidate(candidate));
		const payload = { kind: "AdvanceRequested" as const, basisVersion: 0 };
		const agentRun = this.#initialRun(request, budget, depth, bindings);
		const transcriptHeadRef = agentRun.transcriptHeadRef;
		return {
			protocolVersion: "1.0.0",
			run: agentRun,
			session: {
				sessionId: bindings.sessionId,
				version: session.anchor.version,
				historyHeadRef: session.anchor.headRef,
			},
			context: {
				inputBytes: candidate.tokenAccounting.inputBytes,
				frameId: candidate.inputDigest,
				basisRef,
				inputDigest: candidate.inputDigest,
				payloadDigest: candidate.payloadDigest,
				formatVersion: candidate.formatVersion,
				modelAdapterVersion: candidate.modelAdapterVersion,
				bindings,
				sourceRunVersion: 0,
				transcriptHeadRef,
				promptRef,
				inputTokens: candidate.tokenAccounting.inputTokens,
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
	#history(
		sessionId: string,
		excludingRunId?: string,
	): { anchor: SessionAnchor; source: FrozenHistorySource; observations: readonly ExpectedChildObservation[] } {
		const snapshot = this.#sessions.snapshot(sessionId);
		if (
			snapshot.intent.agentDefinitionRef !== "flow-agent" ||
			snapshot.intent.contextPolicyRef !== this.#config.bindings.policySnapshotRef
		)
			throw new Error("SESSION_BINDING_MISMATCH");
		if (snapshot.active && snapshot.active.runId !== excludingRunId) throw new Error("SESSION_RUN_ACTIVE");
		return {
			anchor: snapshot.anchor,
			source: {
				binding: { kind: "session", anchor: snapshot.anchor, recordRefs: null },
				result: { records: snapshot.records, contents: [] },
			},
			observations: snapshot.observations,
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
	async prepare(input: AdvanceInput, signal: AbortSignal): Promise<AdvanceInput> {
		if (input.run.pendingActions.length) return { ...input, context: null, contextFailure: null };
		try {
			const initial = this.#store.initial(input.run.runId);
			if (!initial?.context) throw new Error("FLOW_INITIAL_CONTEXT_MISSING");
			const original = this.#artifacts.get(initial.context.basisRef) as AssemblyBasis;
			validateBasis(original);
			decodeCandidate(this.#artifacts.get(initial.context.promptRef), initial.context);
			const history = projectFlowHistory(this.#store, this.#artifacts, input.run.runId);
			const session = this.#history(input.session.sessionId, input.run.runId);
			if (
				session.anchor.version !== input.session.version ||
				session.anchor.headRef !== input.session.historyHeadRef
			)
				throw new Error("FLOW_SESSION_VERSION_CONFLICT");
			const basis: AssemblyBasis = {
				...original,
				runInput: {
					kind: "existing",
					runId: input.run.runId,
					sourceRunVersion: input.run.version,
					transcriptHeadRef: input.run.transcriptHeadRef,
				},
				expectedChildObservations: [...session.observations, ...history.expectedChildObservations],
			};
			const basisRef = this.#artifacts.put(basis);
			const historySources = [
				...(original.sessionInput.kind === "existing" ? [session.source] : []),
				{
					binding: {
						kind: "run" as const,
						runId: input.run.runId,
						version: input.run.version,
						headRef: input.run.transcriptHeadRef,
					},
					result: { records: history.records, contents: [] },
				},
			];
			const candidate = await this.#engineFactory.create(historySources).assemble(basis, signal);
			signal.throwIfAborted();
			const current = this.#store.load(input.run.runId);
			if (
				!current ||
				current.run.version !== input.run.version ||
				current.run.attemptId !== input.run.attemptId ||
				current.run.cancelEpoch !== input.run.cancelEpoch ||
				current.run.transcriptHeadRef !== input.run.transcriptHeadRef
			)
				throw new Error("FLOW_CONTEXT_PREPARATION_CONFLICT");
			const promptRef = this.#artifacts.put(encodeCandidate(candidate));
			return {
				...input,
				contextFailure: null,
				context: {
					inputBytes: candidate.tokenAccounting.inputBytes,
					frameId: candidate.inputDigest,
					basisRef,
					inputDigest: candidate.inputDigest,
					payloadDigest: candidate.payloadDigest,
					formatVersion: candidate.formatVersion,
					modelAdapterVersion: candidate.modelAdapterVersion,
					bindings: input.run.bindings,
					sourceRunVersion: input.run.version,
					transcriptHeadRef: input.run.transcriptHeadRef,
					promptRef,
					inputTokens: candidate.tokenAccounting.inputTokens,
				},
			};
		} catch (error) {
			return {
				...input,
				context: null,
				contextFailure:
					error instanceof ContextAssemblyError && error.code === "CONTEXT_LIMIT"
						? "limit_exceeded"
						: "unavailable",
			};
		}
	}
}
