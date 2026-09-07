import assert from "node:assert/strict";
import { test } from "node:test";
import { computeArgumentsDigest, computeToolDescriptorDigest } from "../../src/contracts/authorization-digest.ts";
import type { RequestContext, ToolDescriptor, ToolPolicy } from "../../src/contracts/index.ts";
import type {
	AuthorizationSnapshot,
	AuthorizationSnapshotPort,
	FrozenAgentRunScope,
	PermissionApprovalRequest,
	PermissionCeiling,
	PolicySnapshot,
	PolicySnapshotPort,
} from "../../src/contracts/permissions.ts";
import { PermissionApprovalService } from "../../src/security/permission-approval.ts";

import { TestClock as FakeTimePort } from "../support/harness.ts";

const descriptor: ToolDescriptor = {
	name: "workspace.read",
	version: "1.0.0",
	description: "读取工作区文件",
	risk: "read_only",
	inputSchema: { type: "object", properties: {}, additionalProperties: false },
	maxResultBytes: 4_096,
};

const toolPolicy: ToolPolicy = {
	allowedToolNames: [descriptor.name],
	allowedRisks: [descriptor.risk],
	maxCalls: 4,
	perCallTimeoutMs: 5_000,
	maxArgumentsBytes: 1_024,
};

function ceiling(overrides: Partial<PermissionCeiling> = {}): PermissionCeiling {
	return {
		toolPolicy,
		resources: [{ resourceId: "workspace/input.txt", access: "read" }],
		egress: [{ host: "api.example.com", port: 443 }],
		secrets: [{ secretId: "example-api-token" }],
		budget: { timeoutMs: 5_000, maxResultBytes: 4_096 },
		...overrides,
	};
}

function context(time: FakeTimePort): RequestContext {
	const now = time.now();
	return {
		tenant: {
			tenantId: "tenant-1",
			subjectId: "subject-1",
			authorizationSnapshot: "auth-1",
			issuedAt: time.addMilliseconds(now, -1_000).isoUtc,
			expiresAt: time.addMilliseconds(now, 60_000).isoUtc,
			contextVersion: "1",
		},
		operation: {
			traceId: "trace-1",
			spanId: "span-1",
			correlationId: "correlation-1",
			deadlineAt: time.addMilliseconds(now, 30_000).isoUtc,
			requestStartedAt: now.isoUtc,
		},
		time: { timeZone: "Asia/Shanghai", locale: "zh-CN" },
	};
}

function scope(time: FakeTimePort): FrozenAgentRunScope {
	return {
		tenantId: "tenant-1",
		subjectId: "subject-1",
		agentId: "agent-1",
		sessionId: "session-1",
		runId: "run-1",
		policySnapshotId: "policy-1",
		deadlineAt: time.addMilliseconds(time.now(), 20_000).isoUtc,
		descriptor,
		runtimeCeiling: ceiling(),
		sessionCeiling: ceiling(),
		runCeiling: ceiling(),
	};
}

function request(): PermissionApprovalRequest {
	return {
		toolCallId: "tool-call-1",
		toolName: descriptor.name,
		toolVersion: descriptor.version,
		toolDescriptorHash: computeToolDescriptorDigest(descriptor),
		argumentsHash: computeArgumentsDigest({ path: "workspace/input.txt" }),
		resourceClaims: [{ resourceId: "workspace/input.txt", access: "read" }],
		requestedEgress: [],
		requestedSecrets: [],
		requestedBudget: { timeoutMs: 1_000, maxResultBytes: 1_024 },
	};
}

function harness(): {
	time: FakeTimePort;
	policy: PolicySnapshot;
	authorization: AuthorizationSnapshot;
	service: PermissionApprovalService;
} {
	const time = new FakeTimePort("2026-09-03T00:00:00.000Z");
	const policy: PolicySnapshot = { snapshotId: "policy-1", policyEpoch: 7, ceiling: ceiling() };
	const authorization: AuthorizationSnapshot = {
		snapshotId: "auth-1",
		tenantId: "tenant-1",
		subjectId: "subject-1",
		authorizationEpoch: 11,
		ceiling: ceiling(),
	};
	const policyPort: PolicySnapshotPort = {
		get: async () => policy,
		currentEpoch: async () => policy.policyEpoch,
	};
	const authorizationPort: AuthorizationSnapshotPort = {
		get: async () => authorization,
		currentEpoch: async () => authorization.authorizationEpoch,
	};
	return {
		time,
		policy,
		authorization,
		service: new PermissionApprovalService(policyPort, authorizationPort, time, 10_000),
	};
}

test("[AK-AUTH-001] 只对五层权限交集内的调用返回不可变 ALLOW grant", async () => {
	const { time, service } = harness();
	const decision = await service.evaluate(context(time), scope(time), request(), new AbortController().signal);
	assert.equal(decision.kind, "ALLOW");
	if (decision.kind !== "ALLOW") return;
	assert.equal(decision.grant.expiresAt, "2026-09-03T00:00:10.000Z");
	assert.match(decision.grant.grantDigest, /^sha256:[a-f0-9]{64}$/u);
	assert.deepEqual(decision.grant.resourceGrants, request().resourceClaims);
	assert.ok(Object.isFrozen(decision.grant));
	assert.ok(Object.isFrozen(decision.grant.resourceGrants));
	const repeat = await service.evaluate(context(time), scope(time), request(), new AbortController().signal);
	assert.equal(repeat.kind, "ALLOW");
	if (repeat.kind === "ALLOW") assert.equal(repeat.grant.grantDigest, decision.grant.grantDigest);
});

test("[AK-AUTH-002] 任一上游权限收窄都不能增加最终 Grant", async () => {
	const { time, service } = harness();
	const narrowed = { ...scope(time), sessionCeiling: ceiling({ resources: [] }) };
	const decision = await service.evaluate(context(time), narrowed, request(), new AbortController().signal);
	assert.equal(decision.kind, "DENY");
	if (decision.kind === "DENY") assert.equal(decision.reasonCode, "PERMISSION_RESOURCE_OUT_OF_SCOPE");
});

test("[AK-AUTH-003] 工具、网络、Secret 和预算分别按交集默认拒绝", async () => {
	const cases: readonly [Partial<PermissionApprovalRequest>, PermissionCeiling, string][] = [
		[{}, ceiling({ toolPolicy: { ...toolPolicy, allowedToolNames: [] } }), "PERMISSION_TOOL_NOT_ALLOWED"],
		[{ requestedEgress: [{ host: "blocked.example.com", port: 443 }] }, ceiling(), "PERMISSION_EGRESS_NOT_ALLOWED"],
		[{ requestedSecrets: [{ secretId: "unknown" }] }, ceiling(), "PERMISSION_SECRET_NOT_ALLOWED"],
		[{ requestedBudget: { timeoutMs: 6_000, maxResultBytes: 1_024 } }, ceiling(), "PERMISSION_BUDGET_EXCEEDED"],
	];
	for (const [requestOverride, runCeiling, expected] of cases) {
		const { time, service } = harness();
		const decision = await service.evaluate(
			context(time),
			{ ...scope(time), runCeiling },
			{ ...request(), ...requestOverride },
			new AbortController().signal,
		);
		assert.equal(decision.kind, "DENY");
		if (decision.kind === "DENY") assert.equal(decision.reasonCode, expected);
	}
});

test("[AK-AUTH-004] 端口异常、快照不匹配、人工确认和取消均失败关闭", async () => {
	const { time, authorization } = harness();
	const failingPolicyPort: PolicySnapshotPort = {
		get: async () => {
			throw new Error("unavailable");
		},
		currentEpoch: async () => 1,
	};
	const authorizationPort: AuthorizationSnapshotPort = {
		get: async () => authorization,
		currentEpoch: async () => authorization.authorizationEpoch,
	};
	const service = new PermissionApprovalService(failingPolicyPort, authorizationPort, time, 10_000);
	const failed = await service.evaluate(context(time), scope(time), request(), new AbortController().signal);
	assert.equal(failed.kind, "DENY");
	if (failed.kind === "DENY") assert.equal(failed.reasonCode, "PERMISSION_POLICY_MISSING");

	const controller = new AbortController();
	controller.abort();
	const cancelled = await harness().service.evaluate(context(time), scope(time), request(), controller.signal);
	assert.equal(cancelled.kind, "DENY");

	const humanPolicy: PolicySnapshotPort = {
		get: async () => ({
			snapshotId: "policy-1",
			policyEpoch: 1,
			ceiling: ceiling(),
			requiresHumanConfirmation: true,
		}),
		currentEpoch: async () => 1,
	};
	const human = new PermissionApprovalService(humanPolicy, authorizationPort, time, 10_000);
	const humanDecision = await human.evaluate(context(time), scope(time), request(), new AbortController().signal);
	assert.equal(humanDecision.kind, "DENY");
	if (humanDecision.kind === "DENY") assert.equal(humanDecision.reasonCode, "HUMAN_CONFIRMATION_UNSUPPORTED");
});

test("[AK-AUTH-005] revalidate 校验 digest、有效期和 policy/auth epoch", async () => {
	const { time, service } = harness();
	const decision = await service.evaluate(context(time), scope(time), request(), new AbortController().signal);
	assert.equal(decision.kind, "ALLOW");
	if (decision.kind !== "ALLOW") return;
	assert.equal((await service.revalidate(context(time), decision.grant, new AbortController().signal)).kind, "VALID");

	const tampered = { ...decision.grant, argumentsHash: "sha256:tampered" };
	const tamperedResult = await service.revalidate(context(time), tampered, new AbortController().signal);
	assert.deepEqual(tamperedResult.kind, "INVALID");
	if (tamperedResult.kind === "INVALID") assert.equal(tamperedResult.reasonCode, "PERMISSION_GRANT_STALE");

	time.advance(10_000);
	const expired = await service.revalidate(context(time), decision.grant, new AbortController().signal);
	assert.equal(expired.kind, "INVALID");
	if (expired.kind === "INVALID") assert.equal(expired.reasonCode, "PERMISSION_GRANT_EXPIRED");
});

test("[AK-AUTH-006] authorization epoch 变化使尚未过期的 Grant 失效", async () => {
	const time = new FakeTimePort("2026-09-03T00:00:00.000Z");
	let currentAuthorizationEpoch = 11;
	const policyPort: PolicySnapshotPort = {
		get: async () => ({ snapshotId: "policy-1", policyEpoch: 7, ceiling: ceiling() }),
		currentEpoch: async () => 7,
	};
	const authorizationPort: AuthorizationSnapshotPort = {
		get: async () => ({
			snapshotId: "auth-1",
			tenantId: "tenant-1",
			subjectId: "subject-1",
			authorizationEpoch: 11,
			ceiling: ceiling(),
		}),
		currentEpoch: async () => currentAuthorizationEpoch,
	};
	const service = new PermissionApprovalService(policyPort, authorizationPort, time, 10_000);
	const decision = await service.evaluate(context(time), scope(time), request(), new AbortController().signal);
	assert.equal(decision.kind, "ALLOW");
	if (decision.kind !== "ALLOW") return;
	currentAuthorizationEpoch = 12;
	const result = await service.revalidate(context(time), decision.grant, new AbortController().signal);
	assert.equal(result.kind, "INVALID");
	if (result.kind === "INVALID") assert.equal(result.reasonCode, "PERMISSION_GRANT_STALE");
});
