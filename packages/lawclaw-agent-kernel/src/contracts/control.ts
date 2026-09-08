import type {
	ContextAssemblyRequest,
	ContextFrame,
	DelegationPolicy,
	DelegationRequest,
	DelegationResult,
	KernelMessage,
	RequestContext,
} from "./types.ts";
/** 上下文投影端口；只在完整轮次边界追加，不拥有长期记忆。 */
export interface ContextEnginePort {
	/** 组装首轮上下文；必要项超预算时抛出 KernelError。 */
	assemble(request: ContextAssemblyRequest): ContextFrame;
	/** 追加完整轮次并检查 Token 预算；返回新的 Frame。 */
	appendTurn(
		frame: ContextFrame,
		messages: readonly KernelMessage[],
		maxInputTokens: number,
		outputReserveTokens: number,
	): ContextFrame;
}
/** 现有单层技术委派入口；未来 Scheduler 边界尚未实现。 */
export interface DelegationPort {
	/** 检查深度与预算后执行；父取消向子调用传播，返回有界摘要。 */
	delegate(
		context: RequestContext,
		request: Omit<DelegationRequest, "delegationId">,
		policy: DelegationPolicy,
		signal: AbortSignal,
	): Promise<DelegationResult>;
}
