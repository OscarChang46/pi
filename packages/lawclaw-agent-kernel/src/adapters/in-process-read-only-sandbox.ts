import { randomUUID } from "node:crypto";
import {
	KernelError,
	type RequestContext,
	type SandboxCapabilityProfile,
	type SandboxHandle,
	type SandboxPort,
	type SandboxRequest,
	type SandboxTerminationReason,
	type SandboxTerminationResult,
	type TimePort,
} from "../contracts/index.ts";
import { assertRequestContext } from "../kernel/request-context-guard.ts";
import { calculateSandboxPlanDigest } from "../kernel/sandbox-planner.ts";

/**
 * 首版进程内只读能力档案。
 *
 * 这不是 OS 沙箱：文件边界依赖只读 Provider 自身的路径校验；没有网络、Secret、写入、
 * 子进程或强制终止能力。要求更强隔离的工具必须使用其他 SandboxPort 实现。
 */
export const IN_PROCESS_READ_ONLY_CAPABILITIES: SandboxCapabilityProfile = Object.freeze({
	profileRef: "in-process-read-only/v1",
	isolation: "in_process",
	osProcessIsolation: false,
	filesystemEnforcement: "provider_contract",
	networkEnforcement: "none",
	supportsWrite: false,
	supportsSecrets: false,
	supportsChildProcesses: false,
	supportsForcedTermination: false,
});

/**
 * 仅供经过评审的进程内只读 Provider 使用的 SandboxPort。
 *
 * Adapter 会再次验证计划而非信任 Planner；能力不匹配时失败关闭，绝不退回无沙箱执行。
 */
export class InProcessReadOnlySandbox implements SandboxPort {
	readonly #timePort: TimePort;
	readonly #controllers = new Map<string, AbortController>();

	public constructor(timePort: TimePort) {
		this.#timePort = timePort;
	}

	public async create(context: RequestContext, request: SandboxRequest, signal: AbortSignal): Promise<SandboxHandle> {
		assertRequestContext(context, this.#timePort);
		signal.throwIfAborted();
		if (request.tenantId !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "沙箱计划与请求租户不一致。");
		}
		const { planDigest: suppliedDigest, ...requestWithoutDigest } = request;
		if (calculateSandboxPlanDigest(requestWithoutDigest) !== suppliedDigest) {
			throw new KernelError("TOOL_EXECUTION_FAILED", "沙箱计划摘要不匹配，拒绝执行被改写的计划。");
		}
		const deadline = this.#timePort.parseIsoUtc(request.deadlineAt);
		if (!deadline || deadline.epochMilliseconds <= this.#timePort.now().epochMilliseconds) {
			throw new KernelError("DEADLINE_EXCEEDED", "沙箱计划已经过期。");
		}
		if (
			request.profileRef !== IN_PROCESS_READ_ONLY_CAPABILITIES.profileRef ||
			request.requiresOsProcessIsolation ||
			request.resources.some((resource) => resource.access !== "read") ||
			request.egress.length > 0 ||
			request.secrets.length > 0 ||
			request.budget.writableScratchQuotaBytes !== 0 ||
			request.budget.maxProcesses !== 1 ||
			request.allowChildProcesses
		) {
			throw new KernelError("TOOL_EXECUTION_FAILED", "进程内只读沙箱无法完整落实请求的隔离能力。", false, {
				profileRef: request.profileRef,
			});
		}

		const sandboxId = randomUUID();
		const controller = new AbortController();
		const abort = (): void => controller.abort(signal.reason);
		if (signal.aborted) abort();
		else signal.addEventListener("abort", abort, { once: true, signal: controller.signal });
		this.#controllers.set(sandboxId, controller);
		return Object.freeze({
			sandboxId,
			tenantId: request.tenantId,
			toolCallId: request.toolCallId,
			grantDigest: request.grantDigest,
			planDigest: request.planDigest,
			capabilities: IN_PROCESS_READ_ONLY_CAPABILITIES,
			executionSignal: controller.signal,
		});
	}

	public async terminate(
		context: RequestContext,
		handle: SandboxHandle,
		reason: SandboxTerminationReason,
	): Promise<SandboxTerminationResult> {
		assertRequestContext(context, this.#timePort);
		if (handle.tenantId !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "不能终止其他租户的沙箱。");
		}
		const controller = this.#controllers.get(handle.sandboxId);
		if (!controller || handle.capabilities.profileRef !== IN_PROCESS_READ_ONLY_CAPABILITIES.profileRef) {
			throw new KernelError("TOOL_EXECUTION_FAILED", "沙箱句柄未知或不属于该适配器。");
		}
		controller.abort(reason);
		this.#controllers.delete(handle.sandboxId);
		return Object.freeze({ terminated: true, forced: false, reason });
	}
}
