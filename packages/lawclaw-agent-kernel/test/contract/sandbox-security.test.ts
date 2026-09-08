import assert from "node:assert/strict";
import { test } from "node:test";
import { KernelError } from "../../src/contracts/index.ts";
import type { PermissionGrant } from "../../src/contracts/permissions.ts";
import {
	IN_PROCESS_READ_ONLY_CAPABILITIES,
	InProcessReadOnlySandbox,
} from "../../src/execution/adapters/in-process-read-only-sandbox.ts";
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

test("[AK-SBX-003] InProcessReadOnlySandbox 如实声明能力并传播协作取消", async () => {
	const sandbox = new InProcessReadOnlySandbox(testTimePort);
	const request = new SandboxPlanner(testTimePort).plan(testContext(), grant(), readOnlyRequirement());
	const handle = await sandbox.create(testContext(), request, new AbortController().signal);
	assert.deepEqual(handle.capabilities, IN_PROCESS_READ_ONLY_CAPABILITIES);
	assert.equal(handle.capabilities.osProcessIsolation, false);
	assert.equal(handle.capabilities.filesystemEnforcement, "provider_contract");
	assert.equal(handle.executionSignal.aborted, false);

	const result = await sandbox.terminate(testContext(), handle, "kill_switch");
	assert.deepEqual(result, { terminated: true, forced: false, reason: "kill_switch" });
	assert.equal(handle.executionSignal.aborted, true);
});

test("[AK-SBX-004] InProcessReadOnlySandbox 对写入、网络、Secret、子进程和 OS 隔离要求失败关闭", async () => {
	const sandbox = new InProcessReadOnlySandbox(testTimePort);
	const planner = new SandboxPlanner(testTimePort);
	const base = readOnlyRequirement();
	const cases: SandboxPlanRequirement[] = [
		{ ...base, resources: [{ resourceId: "workspace:src", access: "write" }] },
		{ ...base, egress: [{ protocol: "https", host: "api.example.com", port: 443 }] },
		{ ...base, secrets: [{ secretId: "secret:test" }] },
		{ ...base, allowChildProcesses: true },
		{ ...base, requiresOsProcessIsolation: true },
	];
	const expandedGrant: PermissionGrant = {
		...grant(),
		resourceGrants: [...grant().resourceGrants, { resourceId: "workspace:src", access: "write" }],
	};
	for (const requirement of cases) {
		const validRequest = planner.plan(testContext(), expandedGrant, base);
		const request = { ...validRequest, ...requirement };
		await assert.rejects(
			sandbox.create(testContext(), request, new AbortController().signal),
			(error: unknown) => error instanceof KernelError && error.code === "TOOL_EXECUTION_FAILED",
		);
	}
});
