import { randomUUID } from "node:crypto";
import {
	type ContextAssemblyRequest,
	type ContextFrame,
	type ContextItem,
	type ContextReductionTrace,
	KernelError,
	type KernelMessage,
} from "../contracts/index.ts";

/** ContextEngine 的可调估算参数；调用方必须从已验证配置注入。 */
export interface ContextEngineOptions {
	/** 一个 Token 对应的保守估算字符数。 */
	readonly estimatedCharactersPerToken: number;
	/** 系统提示词和目标之外的固定协议开销。 */
	readonly fixedPromptOverheadTokens: number;
	/** 每条工具消息或调用块的协议开销。 */
	readonly messageOverheadTokens: number;
	/** 每个上下文项的来源和包装开销。 */
	readonly contextItemOverheadTokens: number;
}

function estimateTokens(text: string, options: ContextEngineOptions): number {
	return Math.max(1, Math.ceil(text.length / options.estimatedCharactersPerToken));
}

function estimateMessage(message: KernelMessage, options: ContextEngineOptions): number {
	if (message.role === "user") return estimateTokens(message.text, options);
	if (message.role === "tool") return estimateTokens(message.text, options) + options.messageOverheadTokens;
	return message.content.reduce((total, block) => {
		if (block.type === "text") return total + estimateTokens(block.text, options);
		return (
			total +
			estimateTokens(JSON.stringify(block.arguments), options) +
			estimateTokens(block.toolName, options) +
			options.messageOverheadTokens
		);
	}, 0);
}

function renderInitialMessage(goal: string, selectedItems: readonly ContextItem[]): string {
	const sections = selectedItems.map(
		(item) => `\n[上下文:${item.kind}; source=${item.sourceRef}; id=${item.itemId}]\n${item.content}`,
	);
	return `目标：\n${goal}${sections.join("\n")}`;
}

/**
 * Kernel 的规范化上下文引擎。
 *
 * 所有权：只拥有一次技术 Run 的 ContextFrame 和裁剪轨迹，不拥有业务 Conversation。
 * 安全：Secret 不能以内联正文进入；必选项放不下时失败，不静默删除。
 * 确定性：相同输入和预算产生相同选择顺序，便于质量回归。
 */
export class ContextEngine {
	readonly #options: ContextEngineOptions;

	/** 创建只消费已验证估算参数的 ContextEngine；它本身不读取配置文件。 */
	public constructor(options: ContextEngineOptions) {
		this.#options = options;
	}

	/** 按“必选、优先级、稳定标识”选择上下文并生成首轮不可变 Frame。 */
	public assemble(request: ContextAssemblyRequest): ContextFrame {
		if (request.maxInputTokens <= 0 || request.outputReserveTokens < 0) {
			throw new KernelError("CONTEXT_INVALID", "上下文预算必须为正数。");
		}
		if (request.maxInputTokens <= request.outputReserveTokens) {
			throw new KernelError("CONTEXT_BUDGET_EXCEEDED", "输出安全余量占满了整个上下文预算。");
		}
		if (request.items.some((item) => item.classification === "secret")) {
			throw new KernelError("CONTEXT_INVALID", "Secret 不得以内联上下文正文进入 Agent Kernel。");
		}

		const available = request.maxInputTokens - request.outputReserveTokens;
		const fixedTokens =
			estimateTokens(request.systemPrompt, this.#options) +
			estimateTokens(request.goal, this.#options) +
			this.#options.fixedPromptOverheadTokens;
		if (fixedTokens > available) {
			throw new KernelError("CONTEXT_BUDGET_EXCEEDED", "系统约束和当前目标无法放入上下文预算。", false, {
				requiredTokens: fixedTokens,
				availableTokens: available,
			});
		}

		const ordered = [...request.items].sort((left, right) => {
			if (left.required !== right.required) return left.required ? -1 : 1;
			if (left.priority !== right.priority) return right.priority - left.priority;
			return left.itemId.localeCompare(right.itemId);
		});

		const selected: ContextItem[] = [];
		const dropped: ContextItem[] = [];
		let used = fixedTokens;
		for (const item of ordered) {
			const itemTokens =
				estimateTokens(item.content, this.#options) +
				estimateTokens(item.sourceRef, this.#options) +
				this.#options.contextItemOverheadTokens;
			if (used + itemTokens <= available) {
				selected.push(item);
				used += itemTokens;
			} else if (item.required) {
				throw new KernelError("CONTEXT_BUDGET_EXCEEDED", "必选上下文项无法放入预算。", false, {
					requiredTokens: used + itemTokens,
					availableTokens: available,
				});
			} else {
				dropped.push(item);
			}
		}

		const message = renderInitialMessage(request.goal, selected);
		const estimatedTokens =
			estimateTokens(request.systemPrompt, this.#options) + estimateTokens(message, this.#options);
		const reductionTrace: ContextReductionTrace = {
			droppedItemIds: dropped.map((item) => item.itemId),
			selectedItemIds: selected.map((item) => item.itemId),
			reasonCodes: dropped.length > 0 ? ["LOW_PRIORITY", "BUDGET_FIT"] : [],
			estimatedTokensBefore:
				fixedTokens +
				request.items.reduce(
					(total, item) =>
						total + estimateTokens(item.content, this.#options) + this.#options.contextItemOverheadTokens,
					0,
				),
			estimatedTokensAfter: estimatedTokens,
		};

		return Object.freeze({
			frameId: randomUUID(),
			systemPrompt: request.systemPrompt,
			messages: Object.freeze([{ role: "user" as const, text: message }]),
			estimatedTokens,
			reductionTrace: Object.freeze(reductionTrace),
		});
	}

	/**
	 * 在完整 Turn 边界追加规范化消息并生成下一轮 Frame。
	 *
	 * 首版不做有损会话摘要；达到上限时显式失败，避免破坏 assistant/tool 配对或安全指令。
	 */
	public appendTurn(
		frame: ContextFrame,
		appendedMessages: readonly KernelMessage[],
		maxInputTokens: number,
		outputReserveTokens: number,
	): ContextFrame {
		const messages = [...frame.messages, ...appendedMessages];
		const estimatedTokens =
			estimateTokens(frame.systemPrompt, this.#options) +
			messages.reduce((total, item) => total + estimateMessage(item, this.#options), 0);
		const available = maxInputTokens - outputReserveTokens;
		if (estimatedTokens > available) {
			throw new KernelError(
				"CONTEXT_BUDGET_EXCEEDED",
				"完整 Turn 无法安全装入下一轮上下文；当前版本不执行有损摘要。",
				false,
				{
					requiredTokens: estimatedTokens,
					availableTokens: available,
				},
			);
		}

		return Object.freeze({
			frameId: randomUUID(),
			systemPrompt: frame.systemPrompt,
			messages: Object.freeze(messages),
			estimatedTokens,
			reductionTrace: Object.freeze({
				droppedItemIds: [],
				selectedItemIds: frame.reductionTrace.selectedItemIds,
				reasonCodes: [],
				estimatedTokensBefore: estimatedTokens,
				estimatedTokensAfter: estimatedTokens,
			}),
		});
	}
}
