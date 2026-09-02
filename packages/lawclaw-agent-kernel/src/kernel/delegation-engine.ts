import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import {
	type DelegationPolicy,
	type DelegationProviderPort,
	type DelegationRequest,
	type DelegationResult,
	KernelError,
	type RequestContext,
	type TimePort,
} from "../contracts/index.ts";
import { assertRequestContext } from "./request-context-guard.ts";

/**
 * 受限技术委派协调器。
 *
 * 语义：子 Agent 是新的技术 Run，不是 WorkflowStep；结果只是父 Run 的候选上下文。
 * 限制：最大深度为 1、每个父 Run 数量有界、任务和结果有界、父取消向下传播。
 */
export class DelegationEngine {
	readonly #childrenByParent = new Map<string, number>();
	readonly #provider: DelegationProviderPort;
	readonly #maxTrackedParents: number;
	readonly #timePort: TimePort;

	/** 创建有界委派协调器；父 Run 跟踪容量由 Composition Root 注入。 */
	public constructor(provider: DelegationProviderPort, maxTrackedParents: number, timePort: TimePort) {
		this.#provider = provider;
		this.#maxTrackedParents = maxTrackedParents;
		this.#timePort = timePort;
	}

	/** 校验委派政策并通过端口执行一个子 Run；禁止子 Run 再次委派。 */
	public async delegate(
		context: RequestContext,
		request: Omit<DelegationRequest, "delegationId">,
		policy: DelegationPolicy,
		signal: AbortSignal,
	): Promise<DelegationResult> {
		assertRequestContext(context, this.#timePort);
		signal.throwIfAborted();
		if (!policy.enabled || request.depth >= policy.maxDepth) {
			throw new KernelError("DELEGATION_NOT_ALLOWED", "当前 Run 不允许继续创建子 Agent。", false, {
				depth: request.depth,
				maxDepth: policy.maxDepth,
			});
		}
		if (request.task.length === 0 || request.task.length > policy.maxTaskChars) {
			throw new KernelError("DELEGATION_LIMIT_EXCEEDED", "子 Agent 任务为空或超过字符上限。", false, {
				taskChars: request.task.length,
				maxTaskChars: policy.maxTaskChars,
			});
		}

		const parentScope = `${context.tenant.tenantId}\u0000${request.parentRunId}`;
		const currentChildren = this.#childrenByParent.get(parentScope) ?? 0;
		if (currentChildren >= policy.maxChildren) {
			throw new KernelError("DELEGATION_LIMIT_EXCEEDED", "父 Run 的子 Agent 数量已达到上限。", false, {
				maxChildren: policy.maxChildren,
			});
		}
		if (!this.#childrenByParent.has(parentScope) && this.#childrenByParent.size >= this.#maxTrackedParents) {
			const oldest = this.#childrenByParent.keys().next().value;
			if (oldest !== undefined) this.#childrenByParent.delete(oldest);
		}
		this.#childrenByParent.set(parentScope, currentChildren + 1);

		const combinedSignal = AbortSignal.any([signal, AbortSignal.timeout(policy.timeoutMs)]);
		let result: DelegationResult;
		try {
			result = await this.#provider.executeChild(
				context,
				{ ...request, delegationId: randomUUID() },
				combinedSignal,
			);
		} catch (error) {
			if (error instanceof KernelError) throw error;
			throw new KernelError("DELEGATION_LIMIT_EXCEEDED", "子 Agent 执行失败或超时。", true);
		}

		const resultBytes = Buffer.byteLength(result.summary, "utf8");
		if (resultBytes > policy.maxResultBytes) {
			throw new KernelError("DELEGATION_LIMIT_EXCEEDED", "子 Agent 结果超过允许上限。", false, {
				resultBytes,
				maxResultBytes: policy.maxResultBytes,
			});
		}
		return result;
	}
}
