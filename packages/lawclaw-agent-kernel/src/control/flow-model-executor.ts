import { decodeCandidate } from "../contracts/control/context-engine/candidate-codec.ts";
import type {
	ModelObservationIdentity,
	ModelObservationPort,
} from "../contracts/control/run-registry/model-observation.ts";
import type { AgentRunStore } from "../contracts/control/run-registry/run-storage.ts";
import type { FlowArtifactStore } from "../contracts/flow-artifacts.ts";
import type { FlowCommandHandler } from "../contracts/flow-dispatch.ts";
import type { ActionProposal, AdvanceInput, EngineCommand, ModelOutput } from "../contracts/flow-engine.ts";
import { flowDigest, flowId } from "../contracts/flow-value.ts";
import type {
	AgentAdapter,
	AgentTurnRequest,
	KernelAssistantMessage,
	KernelToolCallBlock,
	RequestContext,
	ToolDescriptor,
} from "../contracts/index.ts";

/** 单轮模型处理器只编排输入读取、候选收集与结果归一化。 */
export function createFlowModelHandler(
	model: AgentAdapter,
	artifacts: FlowArtifactStore,
	requestContext: () => RequestContext,
	store: AgentRunStore,
	observation?: ModelObservationPort,
): FlowCommandHandler<"InvokeModel"> {
	return async (input, command, signal) => {
		const binding = store.adoptedContext(command);
		if (
			binding.bindings.sessionId !== input.run.bindings.sessionId ||
			binding.bindings.executionEnvelopeRef !== command.executionEnvelopeRef
		)
			throw new Error("FLOW_CONTEXT_BINDING_MISMATCH");
		const candidate = decodeCandidate(artifacts.get(command.payload.promptRef), binding);
		if (
			flowId("ctx-input", artifacts.get(binding.basisRef)) !== candidate.inputDigest ||
			binding.inputBytes !== candidate.tokenAccounting.inputBytes
		)
			throw new Error("FLOW_CONTEXT_BINDING_MISMATCH");
		const request: AgentTurnRequest = {
			sessionId: binding.bindings.sessionId,
			payload: candidate.payload,
			formatVersion: candidate.formatVersion,
			modelAdapterVersion: candidate.modelAdapterVersion,
		};
		const assistant = await collectAssistant(model, requestContext(), request, signal, {
			maxOutputBytes: input.run.budget.maxOutputBytes,
			identity: { runId: input.run.runId, attemptId: input.run.attemptId, commandId: command.commandId },
			observation,
		});
		return {
			source: "model",
			payload: {
				kind: "ModelCompleted",
				modelCommandId: command.commandId,
				assistantTurnRef: artifacts.put(assistant),
				output: normalizeOutput({ input, command, assistant, artifacts, descriptors: candidate.payload.tools }),
			},
		};
	};
}

async function collectAssistant(
	model: AgentAdapter,
	context: RequestContext,
	request: AgentTurnRequest,
	signal: AbortSignal,
	options: {
		readonly maxOutputBytes: number;
		readonly identity: ModelObservationIdentity;
		readonly observation: ModelObservationPort | undefined;
	},
): Promise<KernelAssistantMessage> {
	let assistant: KernelAssistantMessage | undefined;
	let outputBytes = 0;
	let offset = 0;
	options.observation?.publish({ ...options.identity, kind: "start" });
	try {
		for await (const candidate of model.executeTurn(context, request, signal)) {
			signal.throwIfAborted();
			if (candidate.type === "text_delta") {
				outputBytes += Buffer.byteLength(candidate.text);
				if (outputBytes > options.maxOutputBytes) throw new Error("FLOW_MODEL_OUTPUT_LIMIT");
				options.observation?.publish({ ...options.identity, kind: "delta", offset, text: candidate.text });
				offset += Array.from(candidate.text).length;
			}
			if (candidate.type === "turn_completed") assistant = candidate.message;
		}
		if (!assistant) throw new Error("FLOW_MODEL_INCOMPLETE");
		return assistant;
	} finally {
		options.observation?.publish({ ...options.identity, kind: "end" });
	}
}

interface ModelOutputContext {
	readonly input: AdvanceInput;
	readonly command: EngineCommand;
	readonly assistant: KernelAssistantMessage;
	readonly artifacts: FlowArtifactStore;
	readonly descriptors: readonly ToolDescriptor[];
}

function normalizeOutput(context: ModelOutputContext): ModelOutput {
	const { assistant, input, command, artifacts, descriptors } = context;
	const calls = assistant.content.filter((block) => block.type === "tool_call");
	const delegated = calls.find((call) => call.toolName === "lawclaw_delegate");
	if (delegated) return proposeChild(input, command, delegated, calls.length, artifacts);
	if (calls.length)
		return { kind: "tools", proposals: proposeTools(calls, command.commandId, artifacts, descriptors) };
	const text = assistant.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
	return { kind: "answer", outputRef: artifacts.put(text) };
}

function proposeChild(
	input: AdvanceInput,
	command: EngineCommand,
	call: KernelToolCallBlock,
	callCount: number,
	artifacts: FlowArtifactStore,
): ModelOutput {
	if (
		callCount !== 1 ||
		typeof call.arguments.task !== "string" ||
		!call.arguments.task.trim() ||
		call.arguments.task.length > 4000
	)
		throw new Error("FLOW_CHILD_PROPOSAL_INVALID");
	return {
		kind: "child",
		spec: {
			goalRef: artifacts.put(call),
			envelopeSubsetRef: input.run.bindings.executionEnvelopeRef,
			budget: {
				...input.run.budget,
				maxTurns: Math.max(1, Math.min(2, input.run.budget.maxTurns - input.run.usage.turnsReserved - 1)),
				maxToolCalls: Math.min(2, input.run.budget.maxToolCalls - input.run.usage.toolsReserved),
				maxChildren: 0,
			},
			deadlineAtMs: Math.min(input.run.deadlineAtMs, command.deadlineAtMs),
		},
	};
}

function proposeTools(
	calls: readonly KernelToolCallBlock[],
	commandId: string,
	artifacts: FlowArtifactStore,
	descriptors: readonly ToolDescriptor[],
): ActionProposal[] {
	return calls.map((call) => {
		const descriptor = descriptors.find((item) => item.name === call.toolName);
		if (!descriptor) throw new Error("FLOW_MODEL_UNKNOWN_TOOL");
		const identity = {
			proposalId: flowId("proposal", { commandId, toolCallId: call.toolCallId }),
			toolDescriptorRef: descriptor.name,
			toolDescriptorDigest: flowDigest(descriptor),
			argumentsRef: artifacts.put(call),
		};
		return { ...identity, actionDigest: flowDigest(identity) };
	});
}
