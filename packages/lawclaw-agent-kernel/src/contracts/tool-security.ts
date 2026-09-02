import type { RequestContext } from "./types.ts";

/** 沙箱可落实的文件资源授权。 */
export interface SandboxResourceGrant {
	/** 上游规范化后的不透明资源引用。 */
	readonly resourceId: string;
	/** 该资源允许的最大访问方式。 */
	readonly access: "read" | "write";
}

/** 沙箱可落实的精确网络出口授权。 */
export interface SandboxEgressGrant {
	/** 允许使用的网络协议。 */
	readonly protocol: "http" | "https" | "tcp";
	/** 不含通配符的精确目标主机。 */
	readonly host: string;
	/** 允许连接的精确目标端口。 */
	readonly port: number;
}

/** 沙箱可落实的 Secret 句柄；不包含 Secret 正文。 */
export interface SandboxSecretGrant {
	/** 由安全设施解释的 Secret 句柄标识。 */
	readonly secretId: string;
}

/** 审批预算映射到沙箱机制后的有界资源维度。 */
export interface SandboxBudget {
	/** 执行允许占用的最大墙钟毫秒数。 */
	readonly wallClockMs: number;
	/** 工具允许产生的最大输出字节数。 */
	readonly maxOutputBytes: number;
	/** 隔离执行单元允许同时打开的最大文件数。 */
	readonly maxOpenFiles: number;
	/** 隔离执行单元允许存在的最大进程数。 */
	readonly maxProcesses: number;
	/** 可写临时空间的最大字节配额；零表示禁止。 */
	readonly writableScratchQuotaBytes: number;
}

/** 交给 SandboxPort 的确定性、不可扩权执行计划。 */
export interface SandboxRequest {
	/** Composition Root 选择的已评审沙箱能力档案。 */
	readonly profileRef: string;
	/** 必须由沙箱落实的文件资源授权子集。 */
	readonly resources: readonly SandboxResourceGrant[];
	/** 必须由沙箱落实的网络出口授权子集。 */
	readonly egress: readonly SandboxEgressGrant[];
	/** 必须由沙箱安全注入的 Secret 句柄子集。 */
	readonly secrets: readonly SandboxSecretGrant[];
	/** 不得超过 PermissionGrant 的实际执行预算。 */
	readonly budget: SandboxBudget;
	/** 是否明确允许创建子进程。 */
	readonly allowChildProcesses: boolean;
	/** 工具风险是否要求真实操作系统进程隔离。 */
	readonly requiresOsProcessIsolation: boolean;
	/** 与 PermissionGrant 一致的租户标识。 */
	readonly tenantId: string;
	/** 与 PermissionGrant 一致的单次工具调用标识。 */
	readonly toolCallId: string;
	/** 被计划器消费的 PermissionGrant 内容摘要。 */
	readonly grantDigest: string;
	/** Grant 与操作截止时间收敛后的绝对期限。 */
	readonly deadlineAt: string;
	/** 覆盖全部计划字段、供 Adapter 防篡改复核的摘要。 */
	readonly planDigest: string;
}

/** Sandbox Adapter 对实际强制能力的真实声明。 */
export interface SandboxCapabilityProfile {
	/** 能力档案的稳定版本引用。 */
	readonly profileRef: string;
	/** 实际采用进程内协作限制还是操作系统进程隔离。 */
	readonly isolation: "in_process" | "os_process";
	/** 是否真实提供操作系统进程级隔离。 */
	readonly osProcessIsolation: boolean;
	/** 文件边界由 Provider 契约还是操作系统机制强制。 */
	readonly filesystemEnforcement: "provider_contract" | "os_enforced";
	/** 网络边界的实际强制机制。 */
	readonly networkEnforcement: "none" | "proxy_allowlist" | "os_enforced";
	/** 是否可以安全落实文件写入授权。 */
	readonly supportsWrite: boolean;
	/** 是否可以安全注入 Secret 句柄。 */
	readonly supportsSecrets: boolean;
	/** 是否可以受控创建子进程。 */
	readonly supportsChildProcesses: boolean;
	/** 是否可以在 Provider 不协作时强制终止执行。 */
	readonly supportsForcedTermination: boolean;
}

/** 已创建沙箱的执行句柄；Provider 只能验证绑定关系，不能把它当作授权来源。 */
export interface SandboxHandle {
	/** Adapter 创建的隔离执行单元标识。 */
	readonly sandboxId: string;
	/** 隔离执行单元唯一所属租户。 */
	readonly tenantId: string;
	/** 隔离执行单元唯一绑定的工具调用。 */
	readonly toolCallId: string;
	/** 创建沙箱时使用的 PermissionGrant 摘要。 */
	readonly grantDigest: string;
	/** 创建沙箱时使用的执行计划摘要。 */
	readonly planDigest: string;
	/** Adapter 对实际隔离能力的不可变事实声明。 */
	readonly capabilities: SandboxCapabilityProfile;
	/** 取消、超时或紧急停止时向 Provider 传播的信号。 */
	readonly executionSignal: AbortSignal;
}

/** 沙箱终止原因。 */
export type SandboxTerminationReason =
	| "completed"
	| "cancelled"
	| "deadline_exceeded"
	| "kill_switch"
	| "provider_failed";

/** terminate 的机制结果；不能强制终止时必须如实返回 false。 */
export interface SandboxTerminationResult {
	/** Adapter 是否已完成清理或终止动作。 */
	readonly terminated: boolean;
	/** 是否在 Provider 不协作时完成了强制终止。 */
	readonly forced: boolean;
	/** 本次清理或终止的稳定原因。 */
	readonly reason: SandboxTerminationReason;
}

/** Kernel 主动调用、由基础设施实现的沙箱机制端口。 */
export interface SandboxPort {
	/** 创建与 Grant 和 ToolCall 精确绑定的隔离执行单元。 */
	create(context: RequestContext, request: SandboxRequest, signal: AbortSignal): Promise<SandboxHandle>;
	/** 终止已创建的隔离执行单元。 */
	terminate(
		context: RequestContext,
		handle: SandboxHandle,
		reason: SandboxTerminationReason,
	): Promise<SandboxTerminationResult>;
}
