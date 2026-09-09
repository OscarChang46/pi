/**
 * `@earendil-works/pi-coding-agent` 的编译期最小类型桩。
 *
 * 此文件只描述 CLI 扩展当前调用的宿主能力，不提供运行时实现。真实依赖声明
 * 可用时，构建脚本不会加载本文件。
 */

import type {
  Api,
  AssistantMessageEventStream,
  Context,
  Model,
  PiSchema,
  SimpleStreamOptions,
  Static,
} from "@earendil-works/pi-ai";

/** 创建模型运行时所需的最小配置。 */
export interface CreateModelRuntimeOptions {
  readonly authPath?: string;
  readonly modelsPath?: string | null;
  readonly modelsStorePath?: string;
  readonly allowModelNetwork?: boolean;
}

/** Flow 装配当前使用的最小模型运行时表面。 */
export class ModelRuntime {
  static create(options?: CreateModelRuntimeOptions): Promise<ModelRuntime>;
  getModel(providerId: string, modelId: string): Model<Api> | undefined;
  hasConfiguredAuth(providerId: string): boolean;
  streamSimple(
    model: Model<Api>,
    context: Context,
    options?: SimpleStreamOptions,
  ): AssistantMessageEventStream;
}

/** 扩展可读取的当前模型标识。 */
export interface ExtensionModelRef {
  /** Provider ID。 */
  readonly provider: string;
  /** 模型 ID。 */
  readonly id: string;
}

/** 扩展可调用的最小 UI 能力。 */
export interface ExtensionUI {
  /** 向当前 CLI 会话展示通知。 */
  notify(message: string, level: "info" | "warning" | "error"): void;
}

/** Pi CLI 调用扩展时提供的最小上下文。 */
export interface ExtensionContext {
  /** 当前工作目录的绝对路径。 */
  readonly cwd: string;
  /** 当前模型；尚未选择模型时为空。 */
  readonly model: ExtensionModelRef | undefined;
  /** 当前 CLI 会话的 UI 入口。 */
  readonly ui: ExtensionUI;
}

/** 模型调用开始前事件。 */
export interface BeforeAgentStartEvent {
  /** 本次调用原始系统提示词。 */
  readonly systemPrompt: string;
}

/** 工具调用进入扩展检查点时的事件。 */
export interface ToolCallEvent {
  /** 待调用的工具名称。 */
  readonly toolName: string;
}

/** 同步或异步处理结果。 */
export type MaybePromise<TResult> = TResult | Promise<TResult>;

/** Pi CLI 提供给 LawClaw 扩展的最小注册表面。 */
export interface ExtensionAPI {
  /** 注册模型调用开始前处理器。 */
  on(
    event: "before_agent_start",
    handler: (
      event: BeforeAgentStartEvent,
      context: ExtensionContext,
    ) => MaybePromise<Readonly<{ systemPrompt?: string }> | void>,
  ): void;
  /** 注册工具调用检查处理器。 */
  on(
    event: "tool_call",
    handler: (
      event: ToolCallEvent,
      context: ExtensionContext,
    ) => MaybePromise<Readonly<{ block?: boolean; reason?: string }> | void>,
  ): void;
  /** 注册 CLI 命令。 */
  registerCommand(
    name: string,
    command: Readonly<{
      description: string;
      handler: (
        args: string,
        context: ExtensionContext,
      ) => MaybePromise<void>;
    }>,
  ): void;
  /** 注册可由模型调用的 CLI 工具。 */
  registerTool<TSchema extends PiSchema<unknown>>(
    tool: Readonly<{
      name: string;
      label: string;
      description: string;
      parameters: TSchema;
      execute: (
        toolCallId: string,
        params: Static<TSchema>,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        context: ExtensionContext,
      ) => Promise<unknown>;
    }>,
  ): void;
}
