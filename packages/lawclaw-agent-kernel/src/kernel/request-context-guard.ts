import { KernelError, type RequestContext, type TimePort } from "../contracts/index.ts";

/**
 * 校验调用方提供的可信上下文是否完整且仍在有效期内。
 *
 * 注意：这里只验证 Kernel 消费条件，不解析登录凭据，也不重新计算 RBAC。
 */
export function assertRequestContext(context: RequestContext, timePort: TimePort): void {
	if (
		context.tenant.contextVersion !== "1" ||
		context.tenant.tenantId.trim() === "" ||
		context.tenant.subjectId.trim() === "" ||
		context.tenant.authorizationSnapshot.trim() === ""
	) {
		throw new KernelError("CONTEXT_INVALID", "租户上下文缺失或版本不受支持。");
	}

	const issuedAt = timePort.parseIsoUtc(context.tenant.issuedAt);
	const expiresAt = timePort.parseIsoUtc(context.tenant.expiresAt);
	const deadlineAt = timePort.parseIsoUtc(context.operation.deadlineAt);
	const requestStartedAt = timePort.parseIsoUtc(context.operation.requestStartedAt);

	if (!issuedAt || !expiresAt || !deadlineAt || !requestStartedAt) {
		throw new KernelError("CONTEXT_INVALID", "上下文时间必须是规范化 ISO-8601 UTC 时间点。");
	}
	const now = timePort.now().epochMilliseconds;
	if (issuedAt.epochMilliseconds > now || expiresAt.epochMilliseconds <= now) {
		throw new KernelError("CONTEXT_INVALID", "租户上下文尚未生效或已经过期。");
	}
	if (deadlineAt.epochMilliseconds <= now) {
		throw new KernelError("DEADLINE_EXCEEDED", "操作截止时间已经到达。");
	}
	if (
		context.time.timeZone.trim() === "" ||
		context.time.locale.trim() === "" ||
		!timePort.isTimeZoneSupported(context.time.timeZone) ||
		!timePort.isLocaleSupported(context.time.locale)
	) {
		throw new KernelError("CONTEXT_INVALID", "TimeContext 缺失或 IANA 时区/语言标签不受支持。");
	}
	if (
		context.operation.traceId.trim() === "" ||
		context.operation.spanId.trim() === "" ||
		context.operation.correlationId.trim() === ""
	) {
		throw new KernelError("CONTEXT_INVALID", "OperationContext 缺少必需标识。");
	}
}
