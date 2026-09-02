import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
	KernelError,
	type RequestContext,
	type SandboxHandle,
	type SandboxPort,
	type TimePort,
	type ToolDescriptor,
	type ToolInvocation,
	type ToolPolicy,
	type ToolProviderPort,
	type ToolResult,
} from "../contracts/index.ts";
import type { InMemoryKillSwitch, KillSwitchTarget } from "./kill-switch.ts";
import {
	computeArgumentsDigest,
	computeToolDescriptorDigest,
	type EgressClaim,
	type PermissionApprovalPort,
	type PermissionCeiling,
	type ResourceClaim,
	type SecretClaim,
} from "./permission-approval.ts";
import { assertRequestContext } from "./request-context-guard.ts";
import type { SandboxPlanner } from "./sandbox-planner.ts";

interface RegisteredTool {
	readonly descriptor: ToolDescriptor;
	readonly provider: ToolProviderPort;
}

/** ToolRuntime 执行一次调用所需的冻结 Run 身份与权限范围。 */
export interface ToolExecutionScope {
	readonly runtimeId: string;
	readonly agentId: string;
	readonly sessionId: string;
	readonly runId: string;
	readonly policySnapshotId: string;
	readonly runtimeCeiling: PermissionCeiling;
	readonly sessionCeiling: PermissionCeiling;
	readonly runCeiling: PermissionCeiling;
	readonly resourceClaims: readonly ResourceClaim[];
	readonly requestedEgress: readonly EgressClaim[];
	readonly requestedSecrets: readonly SecretClaim[];
}

/** ToolRuntime 的安全控制面与执行强制平面依赖。 */
export interface ToolRuntimeSecurity {
	readonly permissionApproval: PermissionApprovalPort;
	readonly killSwitch: InMemoryKillSwitch;
	readonly sandboxPlanner: SandboxPlanner;
	readonly sandboxPort: SandboxPort;
}

/** 从当前只读工具政策构造不可扩权的权限上限。 */
export function createReadOnlyPermissionCeiling(
	policy: ToolPolicy,
	workspaceResourceId: string,
	maxResultBytes: number,
): PermissionCeiling {
	return Object.freeze({
		toolPolicy: policy,
		resources: Object.freeze([{ resourceId: workspaceResourceId, access: "read" as const }]),
		egress: Object.freeze([]),
		secrets: Object.freeze([]),
		budget: Object.freeze({ timeoutMs: policy.perCallTimeoutMs, maxResultBytes }),
	});
}

/** 把工作区路径转换为不泄漏裸路径的稳定资源引用。 */
export function computeWorkspaceResourceId(workspaceRoot: string): string {
	return `workspace:sha256:${createHash("sha256").update(workspaceRoot).digest("hex")}`;
}

/**
 * Kernel 的工具政策与执行安全协调器。
 *
 * 调用链固定为目录/参数校验、内部权限审批、Grant 再校验、Kill Switch、
 * Sandbox 计划与创建，最后才把绑定沙箱的请求交给 Provider。
 */
export class ToolRuntime {
	readonly #providers: readonly ToolProviderPort[];
	readonly #tools = new Map<string, RegisteredTool>();
	readonly #maxRegisteredTools: number;
	readonly #timePort: TimePort;
	readonly #security: ToolRuntimeSecurity;
	#initialized = false;
	#tenantId: string | undefined;

	/** 创建具有固定 Provider 列表和显式安全依赖的 Runtime。 */
	public constructor(
		providers: readonly ToolProviderPort[],
		maxRegisteredTools: number,
		timePort: TimePort,
		security: ToolRuntimeSecurity,
	) {
		this.#providers = providers;
		this.#maxRegisteredTools = maxRegisteredTools;
		this.#timePort = timePort;
		this.#security = security;
	}

	/** 读取 Provider 描述并建立不可歧义的工具目录；同名工具直接失败。 */
	public async initialize(context: RequestContext): Promise<void> {
		assertRequestContext(context, this.#timePort);
		if (this.#initialized) {
			if (this.#tenantId !== context.tenant.tenantId) {
				throw new KernelError("TENANT_SCOPE_VIOLATION", "工具目录不能跨租户复用。");
			}
			return;
		}
		this.#tenantId = context.tenant.tenantId;
		for (const provider of this.#providers) {
			for (const descriptor of await provider.describe(context)) {
				if (this.#tools.size >= this.#maxRegisteredTools) {
					throw new KernelError("TOOL_NOT_ALLOWED", "工具目录超过固定注册上限。", false, {
						maxRegisteredTools: this.#maxRegisteredTools,
					});
				}
				if (this.#tools.has(descriptor.name)) {
					throw new KernelError("TOOL_NOT_ALLOWED", "工具目录中存在重复名称。", false, {
						toolName: descriptor.name,
					});
				}
				this.#tools.set(descriptor.name, { descriptor, provider });
			}
		}
		this.#initialized = true;
	}

	/** 返回当前政策允许且未被紧急停止的模型可见工具描述快照。 */
	public listAllowed(
		context: RequestContext,
		policy: ToolPolicy,
		scope: ToolExecutionScope,
	): readonly ToolDescriptor[] {
		if (!this.#initialized) throw new KernelError("TOOL_NOT_ALLOWED", "工具目录尚未初始化。");
		if (this.#killSnapshot(context, scope).active) return [];
		return [...this.#tools.values()]
			.map((entry) => entry.descriptor)
			.filter(
				(descriptor) =>
					policy.allowedToolNames.includes(descriptor.name) && policy.allowedRisks.includes(descriptor.risk),
			)
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	/** 在创建模型、工具或子 Run 动作前检查当前分层 Kill Switch。 */
	public assertActive(context: RequestContext, scope: ToolExecutionScope): void {
		this.#assertNotKilled(context, scope);
	}

	/** 经审批、再校验和沙箱强制后执行单个工具。 */
	public async execute(
		context: RequestContext,
		scope: ToolExecutionScope,
		invocation: ToolInvocation,
		policy: ToolPolicy,
		signal: AbortSignal,
	): Promise<ToolResult> {
		assertRequestContext(context, this.#timePort);
		if (this.#tenantId !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "工具 Runtime 与调用租户不匹配。");
		}
		const registered = this.#tools.get(invocation.toolName);
		if (
			!registered ||
			!policy.allowedToolNames.includes(invocation.toolName) ||
			!policy.allowedRisks.includes(registered.descriptor.risk)
		) {
			throw new KernelError("TOOL_NOT_ALLOWED", "工具未注册或不在当前 Run 的允许策略内。", false, {
				toolName: invocation.toolName,
			});
		}

		const argumentsBytes = Buffer.byteLength(JSON.stringify(invocation.arguments), "utf8");
		if (argumentsBytes > policy.maxArgumentsBytes) {
			throw new KernelError("TOOL_ARGUMENTS_TOO_LARGE", "工具参数超过允许上限。", false, {
				argumentsBytes,
				maxArgumentsBytes: policy.maxArgumentsBytes,
			});
		}
		this.#assertNotKilled(context, scope, invocation);

		const decision = await this.#security.permissionApproval.evaluate(
			context,
			{
				tenantId: context.tenant.tenantId,
				subjectId: context.tenant.subjectId,
				agentId: scope.agentId,
				sessionId: scope.sessionId,
				runId: scope.runId,
				policySnapshotId: scope.policySnapshotId,
				deadlineAt: context.operation.deadlineAt,
				descriptor: registered.descriptor,
				runtimeCeiling: scope.runtimeCeiling,
				sessionCeiling: scope.sessionCeiling,
				runCeiling: scope.runCeiling,
			},
			{
				toolCallId: invocation.toolCallId,
				toolName: invocation.toolName,
				toolVersion: registered.descriptor.version,
				toolDescriptorHash: computeToolDescriptorDigest(registered.descriptor),
				argumentsHash: computeArgumentsDigest(invocation.arguments),
				resourceClaims: scope.resourceClaims,
				requestedEgress: scope.requestedEgress,
				requestedSecrets: scope.requestedSecrets,
				requestedBudget: {
					timeoutMs: policy.perCallTimeoutMs,
					maxResultBytes: registered.descriptor.maxResultBytes,
				},
			},
			signal,
		);
		if (decision.kind === "DENY") {
			throw new KernelError("TOOL_NOT_ALLOWED", "内部权限审批拒绝了工具调用。", false, {
				reasonCode: decision.reasonCode,
			});
		}
		this.#assertNotKilled(context, scope, invocation);
		const revalidation = await this.#security.permissionApproval.revalidate(context, decision.grant, signal);
		if (revalidation.kind !== "VALID" || revalidation.grantDigest !== decision.grant.grantDigest) {
			throw new KernelError("TOOL_NOT_ALLOWED", "工具权限 Grant 已失效。", false, {
				reasonCode: revalidation.kind === "INVALID" ? revalidation.reasonCode : "PERMISSION_GRANT_STALE",
			});
		}
		this.#assertNotKilled(context, scope, invocation);

		const sandboxRequest = this.#security.sandboxPlanner.plan(context, decision.grant, {
			profileRef: "in-process-read-only/v1",
			resources: decision.grant.resourceGrants,
			egress: decision.grant.egressGrants.map((grant) => ({ ...grant, protocol: "tcp" as const })),
			secrets: decision.grant.secretGrants,
			budget: {
				wallClockMs: decision.grant.budget.timeoutMs,
				maxOutputBytes: decision.grant.budget.maxResultBytes,
				maxOpenFiles: 32,
				maxProcesses: 1,
				writableScratchQuotaBytes: 0,
			},
			allowChildProcesses: false,
			requiresOsProcessIsolation: registered.descriptor.risk !== "read_only",
		});
		const timeoutSignal = AbortSignal.timeout(decision.grant.budget.timeoutMs);
		const executionAbort = new AbortController();
		const combinedSignal = AbortSignal.any([signal, timeoutSignal, executionAbort.signal]);
		let sandbox: SandboxHandle | undefined;
		let terminationReason: "completed" | "provider_failed" | "kill_switch" | "deadline_exceeded" | "cancelled" =
			"completed";
		try {
			sandbox = await this.#security.sandboxPort.create(context, sandboxRequest, combinedSignal);
			this.#assertNotKilled(context, scope, invocation);
			const watchAbort = new AbortController();
			const watchTask = this.#watchKillSwitch(context, scope, invocation, executionAbort, watchAbort.signal);
			try {
				const result = await registered.provider.execute(
					context,
					invocation,
					sandbox,
					AbortSignal.any([combinedSignal, sandbox.executionSignal]),
				);
				const resultBytes = Buffer.byteLength(result.text, "utf8");
				if (resultBytes > registered.descriptor.maxResultBytes) {
					throw new KernelError("TOOL_RESULT_TOO_LARGE", "工具结果超过描述符声明的上限。", false, {
						resultBytes,
						maxResultBytes: registered.descriptor.maxResultBytes,
					});
				}
				return result;
			} finally {
				watchAbort.abort();
				await watchTask;
			}
		} catch (error) {
			terminationReason = executionAbort.signal.aborted
				? "kill_switch"
				: timeoutSignal.aborted
					? "deadline_exceeded"
					: signal.aborted
						? "cancelled"
						: "provider_failed";
			if (error instanceof KernelError) throw error;
			throw new KernelError("TOOL_EXECUTION_FAILED", "工具 Provider 或安全执行链失败。", true);
		} finally {
			if (sandbox) await this.#security.sandboxPort.terminate(context, sandbox, terminationReason);
		}
	}

	#killTarget(context: RequestContext, scope: ToolExecutionScope, invocation?: ToolInvocation): KillSwitchTarget {
		return {
			runtimeId: scope.runtimeId,
			tenantId: context.tenant.tenantId,
			agentId: scope.agentId,
			sessionId: scope.sessionId,
			runId: scope.runId,
			toolName: invocation?.toolName,
			toolCallId: invocation?.toolCallId,
		};
	}

	#killSnapshot(context: RequestContext, scope: ToolExecutionScope, invocation?: ToolInvocation) {
		return this.#security.killSwitch.check(context, this.#killTarget(context, scope, invocation));
	}

	#assertNotKilled(context: RequestContext, scope: ToolExecutionScope, invocation?: ToolInvocation): void {
		const snapshot = this.#killSnapshot(context, scope, invocation);
		if (snapshot.active) {
			throw new KernelError("TOOL_NOT_ALLOWED", "Kill Switch 已阻断工具动作。", false, {
				killSwitchEpoch: snapshot.epoch,
			});
		}
	}

	async #watchKillSwitch(
		context: RequestContext,
		scope: ToolExecutionScope,
		invocation: ToolInvocation,
		executionAbort: AbortController,
		signal: AbortSignal,
	): Promise<void> {
		for await (const snapshot of this.#security.killSwitch.watch(
			context,
			this.#killTarget(context, scope, invocation),
			signal,
		)) {
			if (snapshot.active) {
				executionAbort.abort("kill_switch");
				return;
			}
		}
	}
}
