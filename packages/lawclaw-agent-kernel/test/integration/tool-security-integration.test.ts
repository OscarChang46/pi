import assert from "node:assert/strict";
import { test } from "node:test";
import { createToolCoordinator } from "../../src/application/tool-composition.ts";
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
} from "../../src/contracts/index.ts";
import type {
	PermissionApprovalPort,
	PermissionDecision,
	PermissionGrant,
	RevalidationResult,
} from "../../src/contracts/permissions.ts";
import { createReadOnlyPermissionCeiling } from "../../src/control/permission-scope.ts";
import { InProcessReadOnlySandbox } from "../../src/execution/adapters/in-process-read-only-sandbox.ts";
import { SandboxPlanner } from "../../src/execution/sandbox-planner.ts";
import { InMemoryPermissionSnapshots } from "../../src/infrastructure/adapters/in-memory-permission-snapshots.ts";
import { InMemoryKillSwitch } from "../../src/security/kill-switch.ts";
import { PermissionApprovalService } from "../../src/security/permission-approval.ts";
import { deferred } from "../support/harness.ts";
import { testContext, testTimePort } from "../support/test-context.ts";

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

test("[AK-TOOL-005] 工具成功、Provider 异常和超大结果均回收沙箱且不重试", async () => {
	for (const outcome of ["ok", "failure", "oversize"] as const) {
		let calls = 0;
		let cleaned = 0;
		const context = testContext();
		const snapshots = new InMemoryPermissionSnapshots({
			policySnapshotId: "snapshot-test",
			authorizationSnapshotId: "snapshot-test",
			tenantId: context.tenant.tenantId,
			subjectId: context.tenant.subjectId,
			ceiling: scope().runCeiling,
		});
		const sandbox = new InProcessReadOnlySandbox(testTimePort);
		const runtime = createToolCoordinator(
			[
				{
					async describe() {
						return [descriptor];
					},
					async execute() {
						calls++;
						if (outcome === "failure") throw new Error("provider failed");
						return { text: outcome === "oversize" ? "x".repeat(1025) : "ok", isError: false, metadata: {} };
					},
				},
			],
			8,
			testTimePort,
			{
				permissionApproval: new PermissionApprovalService(snapshots, snapshots, testTimePort, 1000),
				killSwitch: new InMemoryKillSwitch(testTimePort),
				sandboxPlanner: new SandboxPlanner(testTimePort),
				sandboxPort: {
					create: sandbox.create.bind(sandbox),
					async terminate(...args) {
						cleaned++;
						return sandbox.terminate(...args);
					},
				},
			},
		);
		await runtime.initialize(context);
		const execution = runtime.execute(
			context,
			scope(),
			{ toolCallId: "call:cleanup", toolName: descriptor.name, arguments: {} },
			policy,
			new AbortController().signal,
		);
		if (outcome === "ok") assert.equal((await execution).text, "ok");
		else await assert.rejects(execution);
		assert.equal(calls, 1);
		assert.equal(cleaned, 1);
	}
});

test("[AK-TOOL-006] 执行中取消后拒绝迟到的 Provider 成功结果并回收资源", async () => {
	const entered = deferred(),
		finish = deferred();
	const controller = new AbortController();
	let cleaned = 0;
	const context = testContext();
	const snapshots = new InMemoryPermissionSnapshots({
		policySnapshotId: "snapshot-test",
		authorizationSnapshotId: "snapshot-test",
		tenantId: context.tenant.tenantId,
		subjectId: context.tenant.subjectId,
		ceiling: scope().runCeiling,
	});
	const sandbox = new InProcessReadOnlySandbox(testTimePort);
	const runtime = createToolCoordinator(
		[
			{
				async describe() {
					return [descriptor];
				},
				async execute() {
					entered.resolve();
					await finish.promise;
					return { text: "late", isError: false, metadata: {} };
				},
			},
		],
		8,
		testTimePort,
		{
			permissionApproval: new PermissionApprovalService(snapshots, snapshots, testTimePort, 1000),
			killSwitch: new InMemoryKillSwitch(testTimePort),
			sandboxPlanner: new SandboxPlanner(testTimePort),
			sandboxPort: {
				create: sandbox.create.bind(sandbox),
				async terminate(...args) {
					cleaned++;
					return sandbox.terminate(...args);
				},
			},
		},
	);
	await runtime.initialize(context);
	const execution = runtime.execute(
		context,
		scope(),
		{ toolCallId: "call:late", toolName: descriptor.name, arguments: {} },
		policy,
		controller.signal,
	);
	const rejected = assert.rejects(execution);
	await entered.promise;
	controller.abort();
	finish.resolve();
	await rejected;
	assert.equal(cleaned, 1);
});

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

test("[AK-TOOL-001] Permission Approval 拒绝后不会创建沙箱或调用 Provider", async () => {
	const provider = new CountingProvider();
	const sandbox = new CountingSandbox();
	const approval = new DenyingApproval();
	const runtime = createToolCoordinator([provider], 8, testTimePort, {
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

test("[AK-TOOL-002] ToolCall 级 Kill Switch 在审批前阻断调用", async () => {
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
	const runtime = createToolCoordinator([provider], 8, testTimePort, {
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

test("[AK-TOOL-003] 等待权限判定时取消，不进入工具守卫或 Provider", async () => {
	const provider = new CountingProvider();
	const sandbox = new CountingSandbox();
	const controller = new AbortController();
	const snapshots = new InMemoryPermissionSnapshots({
		policySnapshotId: "snapshot-test",
		authorizationSnapshotId: "snapshot-test",
		tenantId: testContext().tenant.tenantId,
		subjectId: testContext().tenant.subjectId,
		ceiling: scope().runCeiling,
	});
	const approval = new PermissionApprovalService(snapshots, snapshots, testTimePort, 1000);
	const evaluate = approval.evaluate.bind(approval);
	approval.evaluate = async (...args) => {
		const decision = await evaluate(...args);
		assert.equal(decision.kind, "ALLOW");
		controller.abort();
		return decision;
	};
	const runtime = createToolCoordinator([provider], 8, testTimePort, {
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
			{ toolCallId: "cancel:1", toolName: "test_read", arguments: {} },
			policy,
			controller.signal,
		),
	);
	assert.equal(sandbox.creations, 0);
	assert.equal(provider.executions, 0);
});

test("[AK-TOOL-004] 已经取消的调用在权限判定前停止", async () => {
	const provider = new CountingProvider();
	const sandbox = new CountingSandbox();
	const approval = new DenyingApproval();
	const runtime = createToolCoordinator([provider], 8, testTimePort, {
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
			{ toolCallId: "cancel:2", toolName: "test_read", arguments: {} },
			policy,
			AbortSignal.abort(),
		),
	);
	assert.equal(approval.evaluations, 0);
	assert.equal(sandbox.creations, 0);
	assert.equal(provider.executions, 0);
});
