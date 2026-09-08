import assert from "node:assert/strict";
import { test } from "node:test";
import { KernelError } from "../../src/contracts/index.ts";
import type { PermissionGrant } from "../../src/contracts/permissions.ts";
import { IN_PROCESS_READ_ONLY_CAPABILITIES } from "../../src/execution/adapters/in-process-read-only-sandbox.ts";
import { SandboxPlanner, type SandboxPlanRequirement } from "../../src/execution/sandbox-planner.ts";

import { testContext, testTimePort } from "../support/test-context.ts";

function grant(): PermissionGrant {
	return {
		decisionId: "decision-1",
		tenantId: "tenant-test",
		subjectId: "subject-test",
		runId: "run-1",
		toolCallId: "tool-call-1",
		toolName: "lawclaw_read_text",
		toolVersion: "1.0.0",
		toolDescriptorHash: "descriptor-hash-1",
		argumentsHash: "arguments-hash-1",
		grantDigest: "grant-digest-1",
		expiresAt: testTimePort.addMilliseconds(testTimePort.now(), 20_000).isoUtc,
		resourceGrants: [{ resourceId: "workspace:src", access: "read" }],
		egressGrants: [{ host: "api.example.com", port: 443 }],
		secretGrants: [{ secretId: "secret:test" }],
		budget: {
			timeoutMs: 10_000,
			maxResultBytes: 4_096,
		},
		policySnapshotId: "policy-1",
		policyEpoch: 1,
		authorizationSnapshotId: "snapshot-test",
		authorizationEpoch: 1,
	};
}

function readOnlyRequirement(): SandboxPlanRequirement {
	return {
		profileRef: IN_PROCESS_READ_ONLY_CAPABILITIES.profileRef,
		resources: [{ resourceId: "workspace:src", access: "read" }],
		egress: [],
		secrets: [],
		budget: {
			wallClockMs: 5_000,
			maxOutputBytes: 2_048,
			maxOpenFiles: 8,
			maxProcesses: 1,
			writableScratchQuotaBytes: 0,
		},
		allowChildProcesses: false,
		requiresOsProcessIsolation: false,
	};
}

test("[AK-SBX-001] SandboxPlanner 只生成 PermissionGrant 的确定性子集", () => {
	const planner = new SandboxPlanner(testTimePort);
	const permissionGrant = grant();
	const first = planner.plan(testContext(), permissionGrant, readOnlyRequirement());
	const second = planner.plan(testContext(), permissionGrant, readOnlyRequirement());
	assert.equal(first.planDigest, second.planDigest);
	assert.equal(first.deadlineAt, permissionGrant.expiresAt);
	assert.deepEqual(first.resources, [{ resourceId: "workspace:src", access: "read" }]);
	assert.ok(Object.isFrozen(first));
	assert.ok(Object.isFrozen(first.resources));
});

test("[AK-SBX-002] SandboxPlanner 拒绝资源、网络、Secret、预算和子进程扩权", () => {
	const planner = new SandboxPlanner(testTimePort);
	const base = readOnlyRequirement();
	const attempts: SandboxPlanRequirement[] = [
		{ ...base, resources: [{ resourceId: "workspace:src", access: "write" }] },
		{ ...base, egress: [{ protocol: "https", host: "other.example.com", port: 443 }] },
		{ ...base, secrets: [{ secretId: "secret:other" }] },
		{ ...base, budget: { ...base.budget, maxOutputBytes: 8_192 } },
		{ ...base, allowChildProcesses: true },
	];
	for (const attempt of attempts) {
		assert.throws(
			() => planner.plan(testContext(), grant(), attempt),
			(error: unknown) => error instanceof KernelError && error.code === "TOOL_NOT_ALLOWED",
		);
	}
});
