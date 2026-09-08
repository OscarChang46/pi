import {
	type AgentAdapter,
	type AgentTurnRequest,
	KernelError,
	type RequestContext,
	type RuntimeEventCandidate,
} from "../contracts/index.ts";

/** 可重建的单轮认知执行器；不持有 Run/Session 目录，不执行工具或创建 Child Run。 */
export class AgentRuntime implements AgentAdapter {
	readonly #adapter: AgentAdapter;
	/** 注入规范化模型端口；具体 Pi 实例由 Composition Root 装配。 */
	constructor(adapter: AgentAdapter) {
		if (!adapter) throw new KernelError("CONTEXT_INVALID", "认知执行器缺少 AgentAdapter。");
		this.#adapter = adapter;
	}
	/**
	 * 执行控制层交付的一轮快照，原样返回动作候选，完成后交还控制权。
	 * 取消向 Adapter 传播；无完整消息、重复终态或失败输出映射为稳定协议错误。
	 * 再次调用即使用控制层附带工具结果的新 Frame 继续，不维护私有恢复状态。
	 */
	async *executeTurn(
		context: RequestContext,
		request: AgentTurnRequest,
		signal: AbortSignal,
	): AsyncIterable<RuntimeEventCandidate> {
		signal.throwIfAborted();
		let completed = false;
		for await (const candidate of this.#adapter.executeTurn(context, request, signal)) {
			signal.throwIfAborted();
			if (completed) throw new KernelError("ADAPTER_PROTOCOL_ERROR", "模型在终态后继续产生候选。");
			if (candidate.type === "turn_failed")
				throw new KernelError("ADAPTER_PROTOCOL_ERROR", "模型调用失败。", candidate.retryable, {
					adapterErrorCode: candidate.errorCode,
				});
			if (candidate.type === "turn_completed") {
				if (candidate.message.stopReason === "error" || candidate.message.stopReason === "aborted")
					throw new KernelError("ADAPTER_PROTOCOL_ERROR", "模型未正常完成单轮执行。", true);
				completed = true;
			}
			yield candidate;
		}
		if (!completed) throw new KernelError("ADAPTER_PROTOCOL_ERROR", "模型未返回完整单轮结果。", true);
	}
}
