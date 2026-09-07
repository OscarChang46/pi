import { KernelError } from "../contracts/index.ts";

/** 技术会话档案；关联 Run 标识，但不拥有 Run 状态或执行器。 */
export class AgentSession {
	/** 关联技术会话的稳定标识；不代表 Run 状态所有权。 */
	readonly sessionId: string;
	/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
	readonly tenantId: string;
	/** Agent 的稳定技术标识；不承载业务角色解释。 */
	readonly agentId: string;
	readonly #runIds = new Set<string>();
	#activeRunId: string | undefined;

	/** 创建技术会话档案；只保存稳定引用，不绑定执行器或进程。 */
	constructor(sessionId: string, tenantId: string, agentId: string) {
		this.sessionId = sessionId;
		this.tenantId = tenantId;
		this.agentId = agentId;
	}
	/** 已关联的 Run 标识快照；状态应向 AgentSystem 查询。 */
	get runIds(): readonly string[] {
		return Object.freeze([...this.#runIds]);
	}
	/** 建立串行活动关联；同一会话存在活动 Run 时拒绝。 */
	beginRun(runId: string): void {
		if (this.#activeRunId) throw new KernelError("RUN_STATE_INVALID", "同一 Session 只允许一个活动 Run。");
		this.#runIds.add(runId);
		this.#activeRunId = runId;
	}
	/** 执行结束后释放活动关联；历史标识仍保留。 */
	finishRun(runId: string): void {
		if (this.#activeRunId === runId) this.#activeRunId = undefined;
	}
}
