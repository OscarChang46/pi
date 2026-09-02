import { createHash } from "node:crypto";
import {
	KernelError,
	type RequestContext,
	type SandboxBudget,
	type SandboxEgressGrant,
	type SandboxRequest,
	type SandboxResourceGrant,
	type SandboxSecretGrant,
	type TimePort,
} from "../contracts/index.ts";
import type { EgressClaim, PermissionGrant } from "./permission-approval.ts";

/** 工具执行守卫要求 SandboxPlanner 落实的权限子集。 */
export interface SandboxPlanRequirement {
	readonly profileRef: string;
	readonly resources: readonly SandboxResourceGrant[];
	readonly egress: readonly SandboxEgressGrant[];
	readonly secrets: readonly SandboxSecretGrant[];
	readonly budget: SandboxBudget;
	readonly allowChildProcesses: boolean;
	/** 高风险工具必须为 true；进程内只读适配器会据此失败关闭。 */
	readonly requiresOsProcessIsolation: boolean;
}

/** 计算 SandboxRequest 的内容摘要；Adapter 用它拒绝 Planner 之后被改写的计划。 */
export function calculateSandboxPlanDigest(request: Omit<SandboxRequest, "planDigest">): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				tenantId: request.tenantId,
				toolCallId: request.toolCallId,
				profileRef: request.profileRef,
				grantDigest: request.grantDigest,
				resources: [...request.resources].sort((left, right) =>
					resourceKey(left).localeCompare(resourceKey(right)),
				),
				egress: [...request.egress].sort((left, right) => egressKey(left).localeCompare(egressKey(right))),
				secrets: [...request.secrets].sort((left, right) => secretKey(left).localeCompare(secretKey(right))),
				budget: request.budget,
				allowChildProcesses: request.allowChildProcesses,
				requiresOsProcessIsolation: request.requiresOsProcessIsolation,
				deadlineAt: request.deadlineAt,
			}),
		)
		.digest("hex");
}

function requireNonEmpty(value: string, field: string): void {
	if (value.trim() === "") {
		throw new KernelError("TOOL_NOT_ALLOWED", `沙箱授权字段 ${field} 不能为空。`);
	}
}

function validateBudget(budget: SandboxBudget, field: string): void {
	for (const [name, value] of Object.entries(budget)) {
		if (!Number.isSafeInteger(value) || value < 0) {
			throw new KernelError("TOOL_NOT_ALLOWED", `${field}.${name} 必须是非负安全整数。`);
		}
	}
	if (
		budget.wallClockMs === 0 ||
		budget.maxOutputBytes === 0 ||
		budget.maxOpenFiles === 0 ||
		budget.maxProcesses === 0
	) {
		throw new KernelError("TOOL_NOT_ALLOWED", `${field} 的执行上限必须大于零。`);
	}
}

function resourceKey(grant: SandboxResourceGrant): string {
	return `${grant.access}\u0000${grant.resourceId}`;
}

function egressKey(grant: SandboxEgressGrant): string {
	return `${grant.protocol}\u0000${grant.host.toLocaleLowerCase("en-US")}\u0000${grant.port}`;
}

function secretKey(grant: SandboxSecretGrant): string {
	return grant.secretId;
}

function assertUniqueSubset<TRequested, TGranted>(
	requested: readonly TRequested[],
	granted: readonly TGranted[],
	keyOf: (value: TRequested | TGranted) => string,
	label: string,
): void {
	const allowed = new Set(granted.map(keyOf));
	const seen = new Set<string>();
	for (const item of requested) {
		const key = keyOf(item);
		if (seen.has(key) || !allowed.has(key)) {
			throw new KernelError("TOOL_NOT_ALLOWED", `沙箱计划包含重复或未授权的${label}。`, false, { label });
		}
		seen.add(key);
	}
}

function freezeArray<T extends object>(items: readonly T[]): readonly Readonly<T>[] {
	return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

/**
 * 把 PermissionGrant 的逻辑能力收敛为沙箱计划。
 *
 * 安全不变量：所有集合是 Grant 的子集，所有数值预算不超过 Grant，且计划与同一次
 * tenant/toolCall/grant digest 绑定。Planner 不选择或调用具体隔离实现。
 */
export class SandboxPlanner {
	readonly #timePort: TimePort;

	/** 创建只使用统一时间端口解析期限的计划器。 */
	public constructor(timePort: TimePort) {
		this.#timePort = timePort;
	}

	public plan(context: RequestContext, grant: PermissionGrant, requirement: SandboxPlanRequirement): SandboxRequest {
		requireNonEmpty(grant.tenantId, "tenantId");
		requireNonEmpty(grant.toolCallId, "toolCallId");
		requireNonEmpty(grant.grantDigest, "grantDigest");
		requireNonEmpty(requirement.profileRef, "profileRef");
		if (context.tenant.tenantId !== grant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "PermissionGrant 与请求租户不一致。");
		}
		const expiresAt = this.#timePort.parseIsoUtc(grant.expiresAt);
		const deadlineAt = this.#timePort.parseIsoUtc(context.operation.deadlineAt);
		if (!expiresAt || !deadlineAt) {
			throw new KernelError("CONTEXT_INVALID", "Grant 或操作截止时间不是有效时间点。");
		}

		for (const resource of [...grant.resourceGrants, ...requirement.resources]) {
			requireNonEmpty(resource.resourceId, "resourceId");
		}
		for (const egress of [...grant.egressGrants, ...requirement.egress]) {
			requireNonEmpty(egress.host, "egress.host");
			if (
				!Number.isSafeInteger(egress.port) ||
				egress.port < 1 ||
				egress.port > 65_535 ||
				egress.host.includes("*")
			) {
				throw new KernelError("TOOL_NOT_ALLOWED", "沙箱网络出口必须使用精确主机和有效端口。");
			}
		}
		for (const secret of [...grant.secretGrants, ...requirement.secrets]) {
			requireNonEmpty(secret.secretId, "secret.secretId");
		}

		assertUniqueSubset(
			requirement.resources,
			grant.resourceGrants,
			(value: SandboxResourceGrant) => resourceKey(value),
			"文件资源",
		);
		assertUniqueSubset(
			requirement.egress,
			grant.egressGrants,
			(value: SandboxEgressGrant | EgressClaim) => `${value.host.toLocaleLowerCase("en-US")}\u0000${value.port}`,
			"网络出口",
		);
		assertUniqueSubset(
			requirement.secrets,
			grant.secretGrants,
			(value: SandboxSecretGrant) => secretKey(value),
			"Secret 句柄",
		);
		validateBudget(requirement.budget, "requirement.budget");
		if (
			requirement.budget.wallClockMs > grant.budget.timeoutMs ||
			requirement.budget.maxOutputBytes > grant.budget.maxResultBytes
		) {
			throw new KernelError("TOOL_NOT_ALLOWED", "沙箱计划扩大了审批授予的执行时间或输出预算。");
		}
		if (requirement.allowChildProcesses) {
			throw new KernelError("TOOL_NOT_ALLOWED", "当前 PermissionGrant 契约未授予子进程能力。");
		}
		if (
			requirement.budget.writableScratchQuotaBytes > 0 &&
			!requirement.resources.some((item) => item.access === "write")
		) {
			throw new KernelError("TOOL_NOT_ALLOWED", "没有写授权时不能规划可写临时空间。");
		}

		const resources = freezeArray(requirement.resources);
		const egress = freezeArray(requirement.egress);
		const secrets = freezeArray(requirement.secrets);
		const budget = Object.freeze({ ...requirement.budget });
		const deadline =
			expiresAt.epochMilliseconds <= deadlineAt.epochMilliseconds ? expiresAt.isoUtc : deadlineAt.isoUtc;
		const requestWithoutDigest: Omit<SandboxRequest, "planDigest"> = {
			...requirement,
			resources,
			egress,
			secrets,
			budget,
			tenantId: grant.tenantId,
			toolCallId: grant.toolCallId,
			grantDigest: grant.grantDigest,
			deadlineAt: deadline,
		};
		return Object.freeze({
			...requestWithoutDigest,
			planDigest: calculateSandboxPlanDigest(requestWithoutDigest),
		});
	}
}
