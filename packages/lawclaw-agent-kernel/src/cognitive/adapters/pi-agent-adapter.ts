import { createHash } from "node:crypto";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	Model,
	SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { ContextPayload } from "../../contracts/control/context-engine/assembly-candidate.ts";
import {
	type AgentAdapter,
	type AgentTurnRequest,
	type JsonValue,
	type KernelAssistantMessage,
	KernelError,
	type KernelTextBlock,
	type KernelToolCallBlock,
	type RequestContext,
	type RuntimeEventCandidate,
	type TimePort,
} from "../../contracts/index.ts";
import { assertRequestContext } from "../../contracts/request-context-guard.ts";

/** 把 Pi 的停止原因收敛为 Kernel 稳定枚举。 */
function normalizeStopReason(reason: AssistantMessage["stopReason"]): KernelAssistantMessage["stopReason"] {
	switch (reason) {
		case "toolUse":
			return "tool_use";
		case "pending":
		case "deferred":
			return "error";
		default:
			return reason;
	}
}

/** 只接受 JSON 对象参数；非对象参数在 Adapter 边界默认拒绝。 */
function normalizeArguments(value: unknown): Readonly<Record<string, JsonValue>> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new KernelError("ADAPTER_PROTOCOL_ERROR", "Pi 工具调用参数不是 JSON 对象。");
	}
	return value as Readonly<Record<string, JsonValue>>;
}

/** 单轮 Pi 模型执行；估算与派发使用同一规范载荷转换，无原生消息恢复旁路。 */
export class PiAgentAdapter implements AgentAdapter {
	readonly #model: Model<Api>;
	readonly #stream: (
		model: Model<Api>,
		context: Context,
		options?: SimpleStreamOptions,
	) => AssistantMessageEventStream;
	readonly #options: {
		/** 单轮模型调用允许的底层重试次数，不用于工具副作用重试。 */
		readonly maxRetries: number;
	};
	readonly #timePort: TimePort;
	readonly #toModelInput: (payload: ContextPayload) => Context;

	/** 创建单模型 Adapter；转换器与底层重试由组合根注入。 */
	public constructor(
		model: Model<Api>,
		stream: (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream,
		options: {
			readonly maxRetries: number;
		},
		timePort: TimePort,
		toModelInput: (payload: ContextPayload) => Context,
	) {
		this.#model = model;
		this.#stream = stream;
		this.#options = options;
		this.#timePort = timePort;
		this.#toModelInput = toModelInput;
	}

	/** 执行一个 Pi 模型 Turn，流式输出规范化候选事件；不在 Adapter 内执行工具。 */
	public async *executeTurn(
		context: RequestContext,
		request: AgentTurnRequest,
		signal: AbortSignal,
	): AsyncIterable<RuntimeEventCandidate> {
		assertRequestContext(context, this.#timePort);
		let piContext: Context;
		try {
			if (request.formatVersion !== "ctx-input-1" || request.modelAdapterVersion !== "pi-context-1")
				throw new KernelError("ADAPTER_PROTOCOL_ERROR", "不支持的上下文格式或转换版本。");
			piContext = this.#toModelInput(request.payload);
		} catch (error) {
			if (error instanceof KernelError) throw error;
			throw new KernelError("ADAPTER_PROTOCOL_ERROR", "规范化候选无法映射到 Pi。", false);
		}

		const stream = this.#stream(this.#model, piContext, {
			signal,
			sessionId: createHash("sha256")
				.update(context.tenant.tenantId)
				.update("\u0000")
				.update(request.sessionId)
				.digest("hex"),
			maxRetries: this.#options.maxRetries,
		});
		for await (const event of stream) {
			if (event.type === "text_delta") {
				yield { type: "text_delta", text: event.delta };
			} else if (event.type === "done") {
				yield {
					type: "turn_completed",
					message: this.#normalizeAssistant(event.message),
				};
			} else if (event.type === "error") {
				yield {
					type: "turn_failed",
					errorCode: event.reason === "aborted" ? "PI_ABORTED" : "PI_PROVIDER_ERROR",
					retryable: event.reason !== "aborted",
				};
			}
		}
	}

	#normalizeAssistant(message: AssistantMessage): KernelAssistantMessage {
		const content: Array<KernelTextBlock | KernelToolCallBlock> = [];
		for (const block of message.content) {
			if (block.type === "text") {
				content.push({ type: "text", text: block.text });
			} else if (block.type === "toolCall") {
				content.push({
					type: "tool_call",
					toolCallId: block.id,
					toolName: block.name,
					arguments: normalizeArguments(block.arguments),
				});
			}
		}
		return {
			role: "assistant",
			stopReason: normalizeStopReason(message.stopReason),
			content,
		};
	}
}
