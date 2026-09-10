import type { AssemblyBasis, AssemblyCandidate } from "./control/context-engine/assembly-contract.ts";
import type { DelegationPolicy, DelegationRequest, DelegationResult, RequestContext } from "./types.ts";
/** 规范异步候选计算端口，不保存或采纳结果。 */
export interface ContextEnginePort {
	/** 对完整冻结输入组装，同实例调用必须串行。 */
	assemble(basis: AssemblyBasis, signal: AbortSignal): Promise<AssemblyCandidate>;
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
