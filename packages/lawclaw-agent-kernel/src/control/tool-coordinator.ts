import { Buffer } from "node:buffer";
import { computeArgumentsDigest, computeToolDescriptorDigest } from "../contracts/authorization-digest.ts";
import {
	KernelError,
	type RequestContext,
	type TimePort,
	type ToolDescriptor,
	type ToolInvocation,
	type ToolPolicy,
	type ToolResult,
} from "../contracts/index.ts";
import type { KillSwitchPort, KillSwitchTarget } from "../contracts/kill-switch.ts";
import type { PermissionDecisionPort } from "../contracts/permissions.ts";
import { assertRequestContext } from "../contracts/request-context-guard.ts";
import type { ToolCoordinatorPort, ToolRuntimePort } from "../contracts/tool-runtime.ts";
import type { ToolExecutionScope } from "../contracts/tool-scope.ts";

/** 控制层前置权限协调；只通过工具端口派发，不接触沙箱或 Provider。 */
export class ToolCoordinator implements ToolCoordinatorPort {
	readonly #tools: ToolRuntimePort;
	readonly #permissionApproval: PermissionDecisionPort;
	readonly #killSwitch: KillSwitchPort;
	readonly #timePort: TimePort;
	#initialized = false;
	#tenantId: string | undefined;
	/** 注入目录执行、技术判定、停止与时间端口；不创建具体实现。 */
	constructor(
		tools: ToolRuntimePort,
		permissionApproval: PermissionDecisionPort,
		killSwitch: KillSwitchPort,
		timePort: TimePort,
	) {
		this.#tools = tools;
		this.#permissionApproval = permissionApproval;
		this.#killSwitch = killSwitch;
		this.#timePort = timePort;
	}
	/** 初始化当前作用域工具目录；其他作用域不能复用。 */
	async initialize(context: RequestContext): Promise<void> {
		assertRequestContext(context, this.#timePort);
		if (this.#tenantId && this.#tenantId !== context.tenant.tenantId)
			throw new KernelError("TENANT_SCOPE_VIOLATION", "工具目录不能跨租户复用。");
		await this.#tools.initialize(context);
		this.#tenantId = context.tenant.tenantId;
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
		return this.#tools
			.list()
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
		invocation = structuredClone(invocation);
		scope = structuredClone(scope);
		assertRequestContext(context, this.#timePort);
		signal.throwIfAborted();
		if (this.#tenantId !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "工具 Runtime 与调用租户不匹配。");
		}
		const registered = this.#tools.list().find((item) => item.name === invocation.toolName);
		if (
			!registered ||
			!policy.allowedToolNames.includes(invocation.toolName) ||
			!policy.allowedRisks.includes(registered.risk)
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

		const decision = await this.#permissionApproval.evaluate(
			context,
			{
				tenantId: context.tenant.tenantId,
				subjectId: context.tenant.subjectId,
				agentId: scope.agentId,
				sessionId: scope.sessionId,
				runId: scope.runId,
				policySnapshotId: scope.policySnapshotId,
				deadlineAt: context.operation.deadlineAt,
				descriptor: registered,
				runtimeCeiling: scope.runtimeCeiling,
				sessionCeiling: scope.sessionCeiling,
				runCeiling: scope.runCeiling,
			},
			{
				toolCallId: invocation.toolCallId,
				toolName: invocation.toolName,
				toolVersion: registered.version,
				toolDescriptorHash: computeToolDescriptorDigest(registered),
				argumentsHash: computeArgumentsDigest(invocation.arguments),
				resourceClaims: scope.resourceClaims,
				requestedEgress: scope.requestedEgress,
				requestedSecrets: scope.requestedSecrets,
				requestedBudget: {
					timeoutMs: policy.perCallTimeoutMs,
					maxResultBytes: registered.maxResultBytes,
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
		signal.throwIfAborted();
		return this.#tools.execute(context, { invocation, scope, grant: decision.grant }, signal);
	}
	#killTarget(context: RequestContext, scope: ToolExecutionScope, invocation?: ToolInvocation): KillSwitchTarget {
		return {
			runtimeId: scope.runtimeId,
			tenantId: context.tenant.tenantId,
			agentId: scope.agentId,
			sessionId: scope.sessionId,
			runId: scope.runId,
			...(invocation
				? {
						toolName: invocation.toolName,
						toolCallId: invocation.toolCallId,
					}
				: {}),
		};
	}

	#killSnapshot(context: RequestContext, scope: ToolExecutionScope, invocation?: ToolInvocation) {
		return this.#killSwitch.check(context, this.#killTarget(context, scope, invocation));
	}

	#assertNotKilled(context: RequestContext, scope: ToolExecutionScope, invocation?: ToolInvocation): void {
		const snapshot = this.#killSnapshot(context, scope, invocation);
		if (snapshot.active) {
			throw new KernelError("TOOL_NOT_ALLOWED", "Kill Switch 已阻断工具动作。", false, {
				killSwitchEpoch: snapshot.epoch,
			});
		}
	}
}
