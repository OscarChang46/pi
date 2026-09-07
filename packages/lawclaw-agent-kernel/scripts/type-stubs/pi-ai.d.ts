/**
 * `@earendil-works/pi-ai` 的编译期最小类型桩。
 *
 * 此文件只覆盖上层内核当前使用的 Pi AI 表面，不包含运行时实现，也不代表完整
 * 的 Pi 公共 API。真实依赖声明可用时，构建脚本不会加载本文件。
 */

declare const schemaValue: unique symbol;

/** Pi 模型所使用的 API 标识。 */
export type Api = string;

/** 携带静态值类型的最小 schema 契约。 */
export interface PiSchema<TValue> {
  /** 仅供 TypeScript 推导静态值，不存在于运行时。 */
  readonly [schemaValue]: TValue;
}

/** 从最小 schema 契约提取静态值类型。 */
export type Static<TSchema> = TSchema extends PiSchema<infer TValue>
  ? TValue
  : never;

/** 上层内核构造工具参数 schema 时使用的最小 TypeBox 表面。 */
export const Type: {
  /** 声明字符串值。 */
  String(options?: Readonly<Record<string, unknown>>): PiSchema<string>;
  /** 声明允许缺省的值。 */
  Optional<TSchema extends PiSchema<unknown>>(
    schema: TSchema,
  ): PiSchema<Static<TSchema> | undefined>;
  /** 声明由给定字段组成的对象值。 */
  Object<TProperties extends Readonly<Record<string, PiSchema<unknown>>>>(
    properties: TProperties,
    options?: Readonly<Record<string, unknown>>,
  ): PiSchema<{
    readonly [TKey in keyof TProperties]: Static<TProperties[TKey]>;
  }>;
  /** 将已有 JSON Schema 作为指定静态类型使用。 */
  Unsafe<TValue>(schema: unknown): PiSchema<TValue>;
};

/** 模型标识及其 Provider 归属。 */
export interface Model<TApi extends Api> {
  /** 模型 ID。 */
  readonly id: string;
  /** Provider ID。 */
  readonly provider: string;
  /** Provider API 标识。 */
  readonly api: TApi;
}

/** 助手返回的文本块。 */
export interface TextContent {
  /** 内容种类。 */
  readonly type: "text";
  /** 文本内容。 */
  readonly text: string;
}

/** 助手返回的思考块。 */
export interface ThinkingContent {
  /** 内容种类。 */
  readonly type: "thinking";
  /** 思考文本。 */
  readonly thinking: string;
}

/** 助手提出的工具调用。 */
export interface ToolCall {
  /** 内容种类。 */
  readonly type: "toolCall";
  /** 本次调用 ID。 */
  readonly id: string;
  /** 工具名称。 */
  readonly name: string;
  /** 已解析的工具参数。 */
  readonly arguments: Record<string, unknown>;
}

/** Pi 助手消息的最小结构。 */
export interface AssistantMessage {
  /** 消息角色。 */
  readonly role: "assistant";
  /** 文本、思考或工具调用内容。 */
  readonly content: readonly (TextContent | ThinkingContent | ToolCall)[];
  /** 产生消息的 API。 */
  readonly api: Api;
  /** 产生消息的 Provider。 */
  readonly provider: string;
  /** 产生消息的模型 ID。 */
  readonly model: string;
  /** 消息终止原因。 */
  readonly stopReason:
    | "pending"
    | "stop"
    | "length"
    | "toolUse"
    | "error"
    | "aborted"
    | "deferred";
  /** 可选错误说明。 */
  readonly errorMessage?: string;
  /** Unix 毫秒时间戳。 */
  readonly timestamp: number;
}

/** Pi 用户消息的最小结构。 */
export interface UserMessage {
  /** 消息角色。 */
  readonly role: "user";
  /** 文本或结构化内容。 */
  readonly content: string | readonly TextContent[];
  /** Unix 毫秒时间戳。 */
  readonly timestamp: number;
}

/** Pi 工具结果消息的最小结构。 */
export interface ToolResultMessage {
  /** 消息角色。 */
  readonly role: "toolResult";
  /** 对应的工具调用 ID。 */
  readonly toolCallId: string;
  /** 工具名称。 */
  readonly toolName: string;
  /** 返回给模型的文本内容。 */
  readonly content: readonly TextContent[];
  /** 供宿主使用的附加数据。 */
  readonly details: unknown;
  /** 是否为错误结果。 */
  readonly isError: boolean;
  /** Unix 毫秒时间戳。 */
  readonly timestamp: number;
}

/** 上层内核会传递给 Pi 的消息集合。 */
export type Message = UserMessage | AssistantMessage | ToolResultMessage;

/** Pi 工具声明的最小结构。 */
export interface Tool {
  /** 工具名称。 */
  readonly name: string;
  /** 给模型阅读的工具说明。 */
  readonly description: string;
  /** 工具参数 schema。 */
  readonly parameters: PiSchema<unknown>;
}

/** 单次模型调用的冻结上下文。 */
export interface Context {
  /** 可选系统提示词。 */
  readonly systemPrompt?: string;
  /** 按时间顺序排列的消息。 */
  readonly messages: readonly Message[];
  /** 本次调用可见的工具快照。 */
  readonly tools?: readonly Tool[];
}

/** 简化流式调用使用的控制参数。 */
export interface SimpleStreamOptions {
  /** 取消信号；触发后 Provider 应停止继续产出。 */
  readonly signal?: AbortSignal;
  /** 可选会话 ID。 */
  readonly sessionId?: string;
  /** 可选最大重试次数。 */
  readonly maxRetries?: number;
}

/** 上层内核消费的模型流事件。 */
export type AssistantMessageEvent =
  | { readonly type: "start"; readonly partial: AssistantMessage }
  | {
      readonly type:
        | "text_start"
        | "text_end"
        | "thinking_start"
        | "thinking_end"
        | "toolcall_start";
      readonly contentIndex: number;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "text_delta" | "thinking_delta" | "toolcall_delta";
      readonly contentIndex: number;
      readonly delta: string;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "toolcall_end";
      readonly contentIndex: number;
      readonly toolCall: ToolCall;
      readonly partial: AssistantMessage;
    }
  | {
      readonly type: "done";
      readonly reason: "stop" | "length" | "toolUse" | "deferred";
      readonly message: AssistantMessage;
    }
  | {
      readonly type: "error";
      readonly reason: "aborted" | "error";
      readonly error: AssistantMessage;
    };

/** 可异步迭代的助手消息事件流。 */
export interface AssistantMessageEventStream
  extends AsyncIterable<AssistantMessageEvent> {}

/** 可注册进模型目录的 Provider。 */
export interface Provider {
  /** Provider ID。 */
  readonly id: string;
}

/** Pi 模型目录中被上层内核使用的最小能力。 */
export interface MutableModels {
  /** 注册或替换 Provider。 */
  setProvider(provider: Provider): void;
  /** 按 Provider 与模型 ID 查找模型。 */
  getModel(provider: string, modelId: string): Model<Api> | undefined;
  /** 使用简化流式协议执行模型调用。 */
  streamSimple(
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream;
}

/** 创建空的可变模型目录。 */
export function createModels(): MutableModels;

/** 创建测试 Provider 返回的文本块。 */
export function fauxText(text: string): TextContent;

/** 创建测试 Provider 返回的工具调用块。 */
export function fauxToolCall(
  name: string,
  args: Record<string, unknown>,
  options?: Readonly<{ id?: string }>,
): ToolCall;

/** 创建测试 Provider 返回的助手消息。 */
export function fauxAssistantMessage(
  content:
    | string
    | TextContent
    | ThinkingContent
    | ToolCall
    | readonly (TextContent | ThinkingContent | ToolCall)[],
  options?: Readonly<{
    api?: Api;
    provider?: string;
    model?: string;
    stopReason?: AssistantMessage["stopReason"];
    errorMessage?: string;
    timestamp?: number;
  }>,
): AssistantMessage;

/** 测试 Provider 的配置。 */
export interface FauxProviderOptions {
  /** Provider API 标识。 */
  readonly api?: Api;
  /** Provider ID。 */
  readonly provider?: string;
  /** Provider 暴露的模型列表。 */
  readonly models?: readonly Readonly<{ id: string }>[];
  /** 生成文本时每个 token 的字符数范围。 */
  readonly tokenSize?: Readonly<{ min: number; max: number }>;
}

/** 测试 Provider 的控制句柄。 */
export interface FauxProviderHandle {
  /** 可注册进模型目录的 Provider。 */
  readonly provider: Provider;
  /** 替换后续调用会依次消费的响应。 */
  setResponses(responses: readonly AssistantMessage[]): void;
  /** 返回该 Provider 的默认模型。 */
  getModel(): Model<Api>;
}

/** 创建由调用方显式注入响应的测试 Provider。 */
export function fauxProvider(options?: FauxProviderOptions): FauxProviderHandle;
