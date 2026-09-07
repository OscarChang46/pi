import { createHash, randomUUID } from "node:crypto";
import {
	type Api,
	type AssistantMessage,
	type AssistantMessageEventStream,
	type Context,
	type Message,
	type Model,
	type SimpleStreamOptions,
	type Tool,
	Type,
} from "@earendil-works/pi-ai";
import {
	type AgentAdapter,
	type AgentTurnRequest,
	type JsonValue,
	type KernelAssistantMessage,
	KernelError,
	type KernelMessage,
	type KernelTextBlock,
	type KernelToolCallBlock,
	type RequestContext,
	type RuntimeEventCandidate,
	type TimePort,
	type ToolDescriptor,
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

/**
 * Pi 的 embedded-loop Adapter。
 *
 * 设计选择：使用 Pi AI 的单轮流式能力，不使用 Pi Agent 自带循环；这样 Kernel 仍拥有
 * Context、Tool、Delegation 和终止决策。Pi 原生 Message 缓存在 Adapter 内，只通过
 * 不可解释的 runtimeMessageRef 与规范化消息关联，绝不越过 AgentAdapter 边界。
 */
export class PiAgentAdapter implements AgentAdapter {
	readonly #nativeMessages = new Map<string, { readonly tenantId: string; readonly message: AssistantMessage }>();
	readonly #model: Model<Api>;
	readonly #stream: (
		model: Model<Api>,
		context: Context,
		options?: SimpleStreamOptions,
	) => AssistantMessageEventStream;
	readonly #options: {
		/** Pi 私有消息引用的缓存条目上限，达到上限后淘汰最旧引用。 */
		readonly maxPrivateMessages: number;
		/** 单轮模型调用允许的底层重试次数，不用于工具副作用重试。 */
		readonly maxRetries: number;
	};
	readonly #timePort: TimePort;

	/** 创建单模型 Adapter；私有消息容量和底层重试均由装配配置注入。 */
	public constructor(
		model: Model<Api>,
		stream: (model: Model<Api>, context: Context, options?: SimpleStreamOptions) => AssistantMessageEventStream,
		options: {
			readonly maxPrivateMessages: number;
			readonly maxRetries: number;
		},
		timePort: TimePort,
	) {
		this.#model = model;
		this.#stream = stream;
		this.#options = options;
		this.#timePort = timePort;
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
			piContext = {
				systemPrompt: request.frame.systemPrompt,
				messages: request.frame.messages.map((message) => this.#toPiMessage(message, context.tenant.tenantId)),
				tools: request.tools.map((tool) => this.#toPiTool(tool)),
			};
		} catch (error) {
			if (error instanceof KernelError) throw error;
			throw new KernelError("ADAPTER_PROTOCOL_ERROR", "规范化 ContextFrame 无法映射到 Pi。", false);
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
					message: this.#normalizeAssistant(event.message, context.tenant.tenantId),
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

	#normalizeAssistant(message: AssistantMessage, tenantId: string): KernelAssistantMessage {
		const runtimeMessageRef = randomUUID();
		if (this.#nativeMessages.size >= this.#options.maxPrivateMessages) {
			const oldest = this.#nativeMessages.keys().next().value;
			if (oldest !== undefined) this.#nativeMessages.delete(oldest);
		}
		this.#nativeMessages.set(runtimeMessageRef, { tenantId, message });
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
			runtimeMessageRef,
			stopReason: normalizeStopReason(message.stopReason),
			content,
		};
	}

	#toPiMessage(message: KernelMessage, tenantId: string): Message {
		if (message.role === "user") {
			return { role: "user", content: message.text, timestamp: this.#timePort.now().epochMilliseconds };
		}
		if (message.role === "tool") {
			return {
				role: "toolResult",
				toolCallId: message.toolCallId,
				toolName: message.toolName,
				content: [{ type: "text", text: message.text }],
				details: {},
				isError: message.isError,
				timestamp: this.#timePort.now().epochMilliseconds,
			};
		}
		const native = this.#nativeMessages.get(message.runtimeMessageRef);
		if (!native) {
			throw new KernelError("ADAPTER_PROTOCOL_ERROR", "Pi 私有消息引用已失效；当前内存会话无法跨进程恢复。", false);
		}
		if (native.tenantId !== tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "Pi 私有消息引用与调用租户不匹配。", false);
		}
		return native.message;
	}

	#toPiTool(descriptor: ToolDescriptor): Tool {
		return {
			name: descriptor.name,
			description: descriptor.description,
			parameters: Type.Unsafe<Record<string, unknown>>(descriptor.inputSchema),
		};
	}
}
