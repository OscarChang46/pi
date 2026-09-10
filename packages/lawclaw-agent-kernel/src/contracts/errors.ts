/** Agent Kernel 的稳定错误码；不得把 Pi、Node.js 或文件系统原始异常直接暴露给调用方。 */
export type KernelErrorCode =
	| "CONTEXT_INVALID"
	| "CONTEXT_BUDGET_EXCEEDED"
	| "TENANT_SCOPE_VIOLATION"
	| "DEADLINE_EXCEEDED"
	| "TOOL_NOT_ALLOWED"
	| "TOOL_ARGUMENTS_TOO_LARGE"
	| "TOOL_RESULT_TOO_LARGE"
	| "TOOL_EXECUTION_FAILED"
	| "PATH_OUTSIDE_WORKSPACE"
	| "DELEGATION_NOT_ALLOWED"
	| "DELEGATION_LIMIT_EXCEEDED"
	| "ADAPTER_PROTOCOL_ERROR"
	| "RUN_BUDGET_EXCEEDED"
	| "RUN_STATE_INVALID"
	| "SESSION_NOT_FOUND"
	| "SESSION_CREATION_INVALID"
	| "SESSION_BINDING_MISMATCH"
	| "SESSION_RUN_ACTIVE"
	| "IDEMPOTENCY_CONFLICT"
	| "RUNTIME_SESSION_LIMIT_EXCEEDED";

/**
 * 带稳定错误码的 Kernel 错误。
 *
 * 边界：调用方只能依据 code 和 retryable 决策，不能依赖 message 文案。
 * 安全：details 只能保存不敏感、可安全返回的技术摘要。
 */
export class KernelError extends Error {
	/** 供调用方分支处理的稳定技术错误码。 */
	public readonly code: KernelErrorCode;
	/** 是否允许调用方在预算和幂等约束内考虑重试；不代表自动重试。 */
	public readonly retryable: boolean;
	/** 可安全返回的非敏感错误摘要；禁止凭据与原生 SDK 异常。 */
	public readonly details: Readonly<Record<string, string | number | boolean>>;

	/**
	 * 创建一个可跨 Kernel 边界识别的技术错误。
	 *
	 * @param code 稳定机器错误码，兼容版本内不得改变既有语义。
	 * @param message 面向开发者的中文安全摘要，不得包含 Secret 或底层堆栈。
	 * @param retryable 调用方是否可以在自身预算和幂等约束内重试。
	 * @param details 可观测且允许返回的非敏感结构化细节。
	 */
	public constructor(
		code: KernelErrorCode,
		message: string,
		retryable: boolean = false,
		details: Readonly<Record<string, string | number | boolean>> = {},
	) {
		super(message);
		this.name = "KernelError";
		this.code = code;
		this.retryable = retryable;
		this.details = details;
	}
}
