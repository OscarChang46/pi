import assert from "node:assert/strict";
import { test } from "node:test";
import type {
	RequestContext,
	SandboxHandle,
	SandboxPort,
	SandboxRequest,
	SandboxTerminationReason,
	SandboxTerminationResult,
	ToolDescriptor,
	ToolInvocation,
	ToolPolicy,
	ToolProviderPort,
	ToolResult,
} from "../src/contracts/index.ts";
import { InMemoryKillSwitch } from "../src/kernel/kill-switch.ts";
import type {
	PermissionApprovalPort,
	PermissionDecision,
	PermissionGrant,
	RevalidationResult,
} from "../src/kernel/permission-approval.ts";
import { SandboxPlanner } from "../src/kernel/sandbox-planner.ts";
import { createReadOnlyPermissionCeiling, ToolRuntime } from "../src/kernel/tool-runtime.ts";
import { testContext, testTimePort } from "./test-context.ts";

const policy: ToolPolicy = {
	allowedToolNames: ["test_read"],
	allowedRisks: ["read_only"],
	maxCalls: 1,
	perCallTimeoutMs: 1_000,
	maxArgumentsBytes: 1_024,
};

const descriptor: ToolDescriptor = {
	name: "test_read",
	version: "1.0.0",
	description: "测试只读工具",
	risk: "read_only",
	inputSchema: { type: "object", properties: {}, additionalProperties: false },
	maxResultBytes: 1_024,
};

function scope() {
	const ceiling = createReadOnlyPermissionCeiling(policy, "workspace:test", descriptor.maxResultBytes);
	return {
		runtimeId: "runtime:test",
		agentId: "agent:test",
		sessionId: "session:test",
		runId: "run:test",
		policySnapshotId: "snapshot-test",
		runtimeCeiling: ceiling,
		sessionCeiling: ceiling,
		runCeiling: ceiling,
		resourceClaims: ceiling.resources,
		requestedEgress: [],
		requestedSecrets: [],
	};
}

class CountingProvider implements ToolProviderPort {
	executions = 0;

	async describe(_context: RequestContext): Promise<readonly ToolDescriptor[]> {
		return [descriptor];
	}

	async execute(
		_context: RequestContext,
		_invocation: ToolInvocation,
		_sandbox: SandboxHandle,
		_signal: AbortSignal,
	): Promise<ToolResult> {
		this.executions += 1;
		return { text: "ok", isError: false, metadata: {} };
	}
}

class CountingSandbox implements SandboxPort {
	creations = 0;

	async create(_context: RequestContext, _request: SandboxRequest, _signal: AbortSignal): Promise<SandboxHandle> {
		this.creations += 1;
		throw new Error("不应创建沙箱");
	}

	async terminate(
		_context: RequestContext,
		_handle: SandboxHandle,
		reason: SandboxTerminationReason,
	): Promise<SandboxTerminationResult> {
		return { terminated: true, forced: false, reason };
	}
}

class DenyingApproval implements PermissionApprovalPort {
	evaluations = 0;

	async evaluate(): Promise<PermissionDecision> {
		this.evaluations += 1;
		return {
			kind: "DENY",
			decisionId: "decision:deny",
			reasonCode: "PERMISSION_TOOL_NOT_ALLOWED",
			evidenceDigest: "sha256:deny",
			evaluatedAt: testTimePort.now().isoUtc,
		};
	}

	async revalidate(
		_context: RequestContext,
		_grant: PermissionGrant,
		_signal: AbortSignal,
	): Promise<RevalidationResult> {
		throw new Error("拒绝后不应再校验");
	}
}

test("Permission Approval 拒绝后不会创建沙箱或调用 Provider", async () => {
	const provider = new CountingProvider();
	const sandbox = new CountingSandbox();
	const approval = new DenyingApproval();
	const runtime = new ToolRuntime([provider], 8, testTimePort, {
		permissionApproval: approval,
		killSwitch: new InMemoryKillSwitch(testTimePort),
		sandboxPlanner: new SandboxPlanner(testTimePort),
		sandboxPort: sandbox,
	});
	await runtime.initialize(testContext());
	await assert.rejects(
		runtime.execute(
			testContext(),
			scope(),
			{ toolCallId: "call:deny", toolName: "test_read", arguments: {} },
			policy,
			new AbortController().signal,
		),
	);
	assert.equal(approval.evaluations, 1);
	assert.equal(sandbox.creations, 0);
	assert.equal(provider.executions, 0);
});

test("ToolCall 级 Kill Switch 在审批前阻断调用", async () => {
	const provider = new CountingProvider();
	const sandbox = new CountingSandbox();
	const approval = new DenyingApproval();
	const killSwitch = new InMemoryKillSwitch(testTimePort);
	const context = testContext();
	killSwitch.enable(
		context,
		{ kind: "TOOL_CALL", runtimeId: "runtime:test", tenantId: "tenant-test", toolCallId: "call:killed" },
		{ reasonCode: "emergency", operatorRef: "operator:test" },
	);
	const runtime = new ToolRuntime([provider], 8, testTimePort, {
		permissionApproval: approval,
		killSwitch,
		sandboxPlanner: new SandboxPlanner(testTimePort),
		sandboxPort: sandbox,
	});
	await runtime.initialize(context);
	await assert.rejects(
		runtime.execute(
			context,
			scope(),
			{ toolCallId: "call:killed", toolName: "test_read", arguments: {} },
			policy,
			new AbortController().signal,
		),
	);
	assert.equal(approval.evaluations, 0);
	assert.equal(sandbox.creations, 0);
	assert.equal(provider.executions, 0);
});
