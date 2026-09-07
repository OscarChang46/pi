import type { EgressClaim, PermissionCeiling, ResourceClaim, SecretClaim } from "./permissions.ts";

/** ToolCoordinator 执行一次调用所需的冻结 Run 身份与权限范围。 */
export interface ToolExecutionScope {
	/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
	readonly runtimeId: string;
	/** Agent 的稳定技术标识；不承载业务角色解释。 */
	readonly agentId: string;
	/** 关联技术会话的稳定标识；不代表 Run 状态所有权。 */
	readonly sessionId: string;
	/** 独立技术 Run 的稳定标识；必须与本次执行关联一致。 */
	readonly runId: string;
	/** 已编译技术策略的稳定版本引用，必须与快照匹配。 */
	readonly policySnapshotId: string;
	/** 本地执行作用域的权限上限；下层只能进一步收窄。 */
	readonly runtimeCeiling: PermissionCeiling;
	/** 关联会话的权限上限；与其他上限取交集。 */
	readonly sessionCeiling: PermissionCeiling;
	/** 当前 Run 的权限上限；不能覆盖上游限制。 */
	readonly runCeiling: PermissionCeiling;
	/** 本次调用请求的文件资源访问集合。 */
	readonly resourceClaims: readonly ResourceClaim[];
	/** 本次调用请求的精确网络出口；默认空集合。 */
	readonly requestedEgress: readonly EgressClaim[];
	/** 本次调用请求的 Secret 句柄；不包含正文。 */
	readonly requestedSecrets: readonly SecretClaim[];
}
