import { randomUUID } from "node:crypto";
import type {
	DelegationProviderPort,
	DelegationRequest,
	DelegationResult,
	RequestContext,
} from "../../contracts/index.ts";

/** 确定性测试使用的子 Agent Provider；不调用模型、不访问网络、不创建业务状态。 */
export class FakeDelegationProvider implements DelegationProviderPort {
	readonly #summaryPrefix: string;

	/** 注入确定性摘要前缀；仅供本地 Faux 场景和测试使用。 */
	public constructor(summaryPrefix: string) {
		this.#summaryPrefix = summaryPrefix;
	}

	/** 返回有界的确定性摘要，用来验证父子 Run 控制流。 */
	public async executeChild(
		_context: RequestContext,
		request: DelegationRequest,
		signal: AbortSignal,
	): Promise<DelegationResult> {
		signal.throwIfAborted();
		return {
			childRunId: randomUUID(),
			summary: `${this.#summaryPrefix}：${request.task}`,
			status: "completed",
		};
	}
}
