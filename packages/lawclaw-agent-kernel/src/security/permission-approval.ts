import { computeToolDescriptorDigest, digest } from "../contracts/authorization-digest.ts";
import type { RequestContext, TimePort, ToolDescriptor } from "../contracts/index.ts";

import type {
	AuthorizationSnapshotPort,
	EgressClaim,
	FrozenAgentRunScope,
	PermissionApprovalPort,
	PermissionApprovalRequest,
	PermissionCeiling,
	PermissionDecision,
	PermissionDenialReasonCode,
	PermissionGrant,
	PolicySnapshotPort,
	ResourceClaim,
	RevalidationResult,
	SecretClaim,
	ToolBudget,
} from "../contracts/permissions.ts";
import { assertRequestContext } from "../contracts/request-context-guard.ts";

function validText(value: string): boolean {
	return value.trim().length > 0;
}

function validEpoch(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

function validBudget(value: ToolBudget): boolean {
	return (
		Number.isSafeInteger(value.timeoutMs) &&
		value.timeoutMs > 0 &&
		Number.isSafeInteger(value.maxResultBytes) &&
		value.maxResultBytes > 0
	);
}

function resourceKey(value: ResourceClaim): string {
	return `${value.access}:${value.resourceId}`;
}

function egressKey(value: EgressClaim): string {
	return `${value.host.toLowerCase()}:${value.port}`;
}

function uniqueByKey<T>(values: readonly T[], keyOf: (value: T) => string): readonly T[] | undefined {
	const seen = new Set<string>();
	for (const value of values) {
		const key = keyOf(value);
		if (seen.has(key)) return undefined;
		seen.add(key);
	}
	return values;
}

function scopeAllowsTool(
	scope: PermissionCeiling,
	request: PermissionApprovalRequest,
	risk: ToolDescriptor["risk"],
): boolean {
	return scope.toolPolicy.allowedToolNames.includes(request.toolName) && scope.toolPolicy.allowedRisks.includes(risk);
}

function scopeAllowsResources(scope: PermissionCeiling, claims: readonly ResourceClaim[]): boolean {
	const allowed = new Set(scope.resources.map(resourceKey));
	return claims.every((claim) => allowed.has(resourceKey(claim)));
}

function scopeAllowsEgress(scope: PermissionCeiling, claims: readonly EgressClaim[]): boolean {
	const allowed = new Set(scope.egress.map(egressKey));
	return claims.every((claim) => allowed.has(egressKey(claim)));
}

function scopeAllowsSecrets(scope: PermissionCeiling, claims: readonly SecretClaim[]): boolean {
	const allowed = new Set(scope.secrets.map((value) => value.secretId));
	return claims.every((claim) => allowed.has(claim.secretId));
}

function scopeAllowsBudget(scope: PermissionCeiling, requested: ToolBudget): boolean {
	return (
		requested.timeoutMs <= scope.budget.timeoutMs &&
		requested.timeoutMs <= scope.toolPolicy.perCallTimeoutMs &&
		requested.maxResultBytes <= scope.budget.maxResultBytes
	);
}

function immutableGrant(grant: Omit<PermissionGrant, "grantDigest">): PermissionGrant {
	const digestValue = digest(grant);
	return Object.freeze({
		...grant,
		resourceGrants: Object.freeze(grant.resourceGrants.map((value) => Object.freeze({ ...value }))),
		egressGrants: Object.freeze(grant.egressGrants.map((value) => Object.freeze({ ...value }))),
		secretGrants: Object.freeze(grant.secretGrants.map((value) => Object.freeze({ ...value }))),
		budget: Object.freeze({ ...grant.budget }),
		grantDigest: digestValue,
	});
}

function grantWithoutDigest(grant: PermissionGrant): Omit<PermissionGrant, "grantDigest"> {
	const { grantDigest: _grantDigest, ...boundGrant } = grant;
	return boundGrant;
}

/** 默认拒绝、只生成权限交集的 Permission Approval 实现。 */
export class PermissionApprovalService implements PermissionApprovalPort {
	readonly #policyPort: PolicySnapshotPort;
	readonly #authorizationPort: AuthorizationSnapshotPort;
	readonly #timePort: TimePort;
	readonly #grantTtlMs: number;

	/** 注入策略、主体授权、时间端口与 Grant 有效期毫秒数；不创建存储实现。 */
	public constructor(
		policyPort: PolicySnapshotPort,
		authorizationPort: AuthorizationSnapshotPort,
		timePort: TimePort,
		grantTtlMs: number,
	) {
		this.#policyPort = policyPort;
		this.#authorizationPort = authorizationPort;
		this.#timePort = timePort;
		this.#grantTtlMs = grantTtlMs;
	}

	/** 根据冻结作用域与动作提案计算权限交集；取消、快照缺失和人工确认要求均拒绝，不执行动作。 */
	public async evaluate(
		context: RequestContext,
		runScope: FrozenAgentRunScope,
		request: PermissionApprovalRequest,
		signal: AbortSignal,
	): Promise<PermissionDecision> {
		const now = this.#timePort.now();
		let evidence: unknown = { request, runScope, tenant: context.tenant };
		const deny = (reasonCode: PermissionDenialReasonCode): PermissionDecision => {
			const evidenceDigest = digest(evidence);
			return Object.freeze({
				kind: "DENY",
				decisionId: `decision:${evidenceDigest.slice(7, 39)}`,
				reasonCode,
				evidenceDigest,
				evaluatedAt: now.isoUtc,
			});
		};

		try {
			assertRequestContext(context, this.#timePort);
		} catch {
			return deny("PERMISSION_CONTEXT_INVALID");
		}

		try {
			if (signal.aborted) return deny("PERMISSION_CONTEXT_INVALID");
			const deadline = this.#timePort.parseIsoUtc(runScope.deadlineAt);
			if (
				!deadline ||
				deadline.epochMilliseconds <= now.epochMilliseconds ||
				!validText(runScope.tenantId) ||
				!validText(runScope.subjectId) ||
				!validText(runScope.agentId) ||
				!validText(runScope.sessionId) ||
				!validText(runScope.runId) ||
				!validText(runScope.policySnapshotId) ||
				runScope.tenantId !== context.tenant.tenantId ||
				runScope.subjectId !== context.tenant.subjectId ||
				!validText(request.toolCallId) ||
				!validText(request.argumentsHash)
			) {
				return deny("PERMISSION_CONTEXT_INVALID");
			}
			if (
				request.toolName !== runScope.descriptor.name ||
				request.toolVersion !== runScope.descriptor.version ||
				request.toolDescriptorHash !== computeToolDescriptorDigest(runScope.descriptor)
			) {
				return deny("PERMISSION_TOOL_NOT_ALLOWED");
			}
			const resources = uniqueByKey(request.resourceClaims, resourceKey);
			const egress = uniqueByKey(request.requestedEgress, egressKey);
			const secrets = uniqueByKey(request.requestedSecrets, (value) => value.secretId);
			if (
				!resources ||
				!egress ||
				!secrets ||
				request.resourceClaims.some((value) => !validText(value.resourceId)) ||
				request.requestedEgress.some(
					(value) =>
						!validText(value.host) || !Number.isSafeInteger(value.port) || value.port < 1 || value.port > 65_535,
				) ||
				request.requestedSecrets.some((value) => !validText(value.secretId)) ||
				!validBudget(request.requestedBudget)
			) {
				return deny("PERMISSION_CONTEXT_INVALID");
			}

			const [policy, authorization] = await Promise.all([
				this.#policyPort.get(context, runScope.policySnapshotId, signal),
				this.#authorizationPort.get(context, runScope.subjectId, signal),
			]);
			evidence = { request, runScope, policy, authorization };
			if (signal.aborted) return deny("PERMISSION_CONTEXT_INVALID");
			if (
				policy.snapshotId !== runScope.policySnapshotId ||
				!validEpoch(policy.policyEpoch) ||
				authorization.snapshotId !== context.tenant.authorizationSnapshot ||
				!validEpoch(authorization.authorizationEpoch)
			) {
				return deny("PERMISSION_POLICY_MISSING");
			}
			if (authorization.tenantId !== runScope.tenantId || authorization.subjectId !== runScope.subjectId) {
				return deny("PERMISSION_CONTEXT_INVALID");
			}
			if (policy.requiresHumanConfirmation) return deny("HUMAN_CONFIRMATION_UNSUPPORTED");

			const ceilings = [
				runScope.runtimeCeiling,
				runScope.sessionCeiling,
				runScope.runCeiling,
				policy.ceiling,
				authorization.ceiling,
			];
			if (!ceilings.every((scope) => scopeAllowsTool(scope, request, runScope.descriptor.risk))) {
				return deny("PERMISSION_TOOL_NOT_ALLOWED");
			}
			if (!ceilings.every((scope) => scopeAllowsResources(scope, resources))) {
				return deny("PERMISSION_RESOURCE_OUT_OF_SCOPE");
			}
			if (!ceilings.every((scope) => scopeAllowsEgress(scope, egress))) {
				return deny("PERMISSION_EGRESS_NOT_ALLOWED");
			}
			if (!ceilings.every((scope) => scopeAllowsSecrets(scope, secrets))) {
				return deny("PERMISSION_SECRET_NOT_ALLOWED");
			}
			if (!ceilings.every((scope) => scopeAllowsBudget(scope, request.requestedBudget))) {
				return deny("PERMISSION_BUDGET_EXCEEDED");
			}

			const operationDeadline = this.#timePort.parseIsoUtc(context.operation.deadlineAt);
			if (!operationDeadline || !Number.isSafeInteger(this.#grantTtlMs) || this.#grantTtlMs <= 0) {
				return deny("PERMISSION_CONTEXT_INVALID");
			}
			const expiresAt = this.#timePort.addMilliseconds(
				now,
				Math.min(
					this.#grantTtlMs,
					deadline.epochMilliseconds - now.epochMilliseconds,
					operationDeadline.epochMilliseconds - now.epochMilliseconds,
				),
			);
			const evidenceDigest = digest(evidence);
			const decisionId = `decision:${evidenceDigest.slice(7, 39)}`;
			const grant = immutableGrant({
				decisionId,
				tenantId: runScope.tenantId,
				subjectId: runScope.subjectId,
				runId: runScope.runId,
				toolCallId: request.toolCallId,
				toolName: request.toolName,
				toolVersion: request.toolVersion,
				toolDescriptorHash: request.toolDescriptorHash,
				argumentsHash: request.argumentsHash,
				resourceGrants: resources,
				egressGrants: egress,
				secretGrants: secrets,
				budget: request.requestedBudget,
				policySnapshotId: policy.snapshotId,
				policyEpoch: policy.policyEpoch,
				authorizationSnapshotId: authorization.snapshotId,
				authorizationEpoch: authorization.authorizationEpoch,
				expiresAt: expiresAt.isoUtc,
			});
			return Object.freeze({
				kind: "ALLOW",
				decisionId,
				reasonCode: "POLICY_ALLOWED",
				grant,
				evidenceDigest,
				evaluatedAt: now.isoUtc,
			});
		} catch {
			return deny("PERMISSION_POLICY_MISSING");
		}
	}

	/** 复核 Grant 摘要、有效期和撤销版本；取消或状态未知时无效，不扩大或重新签发授权。 */
	public async revalidate(
		context: RequestContext,
		grant: PermissionGrant,
		signal: AbortSignal,
	): Promise<RevalidationResult> {
		const now = this.#timePort.now();
		const invalid = (reasonCode: PermissionDenialReasonCode): RevalidationResult =>
			Object.freeze({ kind: "INVALID", reasonCode, revalidatedAt: now.isoUtc });
		try {
			assertRequestContext(context, this.#timePort);
			if (
				signal.aborted ||
				context.tenant.tenantId !== grant.tenantId ||
				context.tenant.subjectId !== grant.subjectId ||
				context.tenant.authorizationSnapshot !== grant.authorizationSnapshotId ||
				digest(grantWithoutDigest(grant)) !== grant.grantDigest
			) {
				return invalid("PERMISSION_GRANT_STALE");
			}
			const expiry = this.#timePort.parseIsoUtc(grant.expiresAt);
			if (!expiry || expiry.epochMilliseconds <= now.epochMilliseconds) {
				return invalid("PERMISSION_GRANT_EXPIRED");
			}
			const [policyEpoch, authorizationEpoch] = await Promise.all([
				this.#policyPort.currentEpoch(context, grant.policySnapshotId, signal),
				this.#authorizationPort.currentEpoch(context, grant.subjectId, signal),
			]);
			if (signal.aborted || policyEpoch !== grant.policyEpoch || authorizationEpoch !== grant.authorizationEpoch) {
				return invalid("PERMISSION_GRANT_STALE");
			}
			return Object.freeze({ kind: "VALID", grantDigest: grant.grantDigest, revalidatedAt: now.isoUtc });
		} catch {
			return invalid("PERMISSION_GRANT_STALE");
		}
	}
}
