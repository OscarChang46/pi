/** 来源及组装错误的封闭分类。 */
export type ContextErrorCode =
	| "SCHEMA_INVALID"
	| "FORMAT_UNSUPPORTED"
	| "BINDING_MISMATCH"
	| "DIGEST_MISMATCH"
	| "CONTEXT_LIMIT"
	| "NOT_FOUND"
	| "GONE"
	| "ACCESS_DENIED"
	| "ACTION_APPROVAL_REQUIRED"
	| "PERMISSION_UNAVAILABLE"
	| "DEPENDENCY_UNAVAILABLE"
	| "TRANSPORT_UNAVAILABLE"
	| "CANCELLED"
	| "DEADLINE_EXCEEDED";
/** 错误不携带正文或敏感引用，不允许失败补空。 */
export class ContextAssemblyError extends Error {
	/** 封闭错误分类，不包含正文 */
	readonly code: ContextErrorCode;
	/** 创建稳定错误，原始异常仅供受控调用方追踪。 */
	constructor(code: ContextErrorCode, cause?: unknown) {
		super(code, cause === undefined ? undefined : { cause });
		this.name = "ContextAssemblyError";
		this.code = code;
	}
}
/** 验证设计不变量，失败立即中止当前组装。 */
export function requireContext(condition: unknown, code: ContextErrorCode = "SCHEMA_INVALID"): asserts condition {
	if (!condition) throw new ContextAssemblyError(code);
}
/** 取消不等于原调用已退出，调用方仍须等待finally。 */
export function checkContextCancellation(signal: AbortSignal): void {
	if (signal.aborted)
		throw new ContextAssemblyError(
			signal.reason instanceof DOMException && signal.reason.name === "TimeoutError"
				? "DEADLINE_EXCEEDED"
				: "CANCELLED",
		);
}
