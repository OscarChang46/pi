import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createToolCoordinator } from "../../src/application/tool-composition.ts";
import { loadRuntimeSettings } from "../../src/config/index.ts";
import { KernelError } from "../../src/contracts/index.ts";
import { computeWorkspaceResourceId, createReadOnlyPermissionCeiling } from "../../src/control/permission-scope.ts";
import type { ToolCoordinator } from "../../src/control/tool-coordinator.ts";
import { InProcessReadOnlySandbox } from "../../src/execution/adapters/in-process-read-only-sandbox.ts";
import { ReadOnlyToolProvider } from "../../src/execution/adapters/read-only-tool-provider.ts";
import { SandboxPlanner } from "../../src/execution/sandbox-planner.ts";
import { InMemoryPermissionSnapshots } from "../../src/infrastructure/adapters/in-memory-permission-snapshots.ts";
import { InMemoryKillSwitch } from "../../src/security/kill-switch.ts";
import { PermissionApprovalService } from "../../src/security/permission-approval.ts";
import { testContext, testTimePort } from "../support/test-context.ts";

const policy = {
	allowedToolNames: ["lawclaw_list_files", "lawclaw_read_text", "lawclaw_search_text"],
	allowedRisks: ["read_only" as const],
	maxCalls: 5,
	perCallTimeoutMs: 2_000,
	maxArgumentsBytes: 1_024,
};
const runtimeSettings = loadRuntimeSettings();

function runtimeFor(root: string, providers: Parameters<typeof createToolCoordinator>[0]): ToolCoordinator {
	const ceiling = createReadOnlyPermissionCeiling(
		policy,
		computeWorkspaceResourceId(root),
		runtimeSettings.config.tools.readOnly.maxResultBytes,
	);
	const snapshots = new InMemoryPermissionSnapshots({
		policySnapshotId: "snapshot-test",
		authorizationSnapshotId: "snapshot-test",
		tenantId: "tenant-test",
		subjectId: "subject-test",
		ceiling,
	});
	return createToolCoordinator(providers, runtimeSettings.config.kernel.toolRuntime.maxRegisteredTools, testTimePort, {
		permissionApproval: new PermissionApprovalService(snapshots, snapshots, testTimePort, policy.perCallTimeoutMs),
		killSwitch: new InMemoryKillSwitch(testTimePort),
		sandboxPlanner: new SandboxPlanner(testTimePort),
		sandboxPort: new InProcessReadOnlySandbox(testTimePort),
	});
}

function scopeFor(root: string) {
	const ceiling = createReadOnlyPermissionCeiling(
		policy,
		computeWorkspaceResourceId(root),
		runtimeSettings.config.tools.readOnly.maxResultBytes,
	);
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

test("[AK-READ-001] 只读工具可以读取工作区文本并拒绝符号链接逃逸", async () => {
	const root = await fs.mkdtemp(path.join(tmpdir(), "lawclaw-tools-"));
	const outside = await fs.mkdtemp(path.join(tmpdir(), "lawclaw-outside-"));
	try {
		await fs.writeFile(path.join(root, "inside.txt"), "boundary ok\n", "utf8");
		await fs.writeFile(path.join(outside, "secret.txt"), "outside\n", "utf8");
		await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "escape.txt"));

		const runtime = runtimeFor(root, [
			await ReadOnlyToolProvider.create(root, runtimeSettings.config.tools.readOnly, testTimePort),
		]);
		await runtime.initialize(testContext());
		const read = await runtime.execute(
			testContext(),
			scopeFor(root),
			{ toolCallId: "read-1", toolName: "lawclaw_read_text", arguments: { path: "inside.txt" } },
			policy,
			new AbortController().signal,
		);
		assert.match(read.text, /boundary ok/u);

		await assert.rejects(
			runtime.execute(
				testContext(),
				scopeFor(root),
				{ toolCallId: "read-2", toolName: "lawclaw_read_text", arguments: { path: "escape.txt" } },
				policy,
				new AbortController().signal,
			),
			(error: unknown) => error instanceof KernelError && error.code === "PATH_OUTSIDE_WORKSPACE",
		);
	} finally {
		await fs.rm(root, { recursive: true, force: true });
		await fs.rm(outside, { recursive: true, force: true });
	}
});

test("[AK-READ-002] ToolCoordinator 默认拒绝未在政策中的工具", async () => {
	const runtime = runtimeFor("test-workspace", []);
	await runtime.initialize(testContext());
	await assert.rejects(
		runtime.execute(
			testContext(),
			scopeFor("test-workspace"),
			{ toolCallId: "unknown-1", toolName: "shell", arguments: {} },
			policy,
			new AbortController().signal,
		),
		(error: unknown) => error instanceof KernelError && error.code === "TOOL_NOT_ALLOWED",
	);
});

test("[AK-READ-003] ToolCoordinator 拒绝跨租户复用已初始化目录", async () => {
	const runtime = runtimeFor("test-workspace", []);
	const owner = testContext();
	await runtime.initialize(owner);
	const anotherTenant = {
		...testContext(),
		tenant: { ...testContext().tenant, tenantId: "tenant-other" },
	};
	await assert.rejects(
		runtime.initialize(anotherTenant),
		(error: unknown) => error instanceof KernelError && error.code === "TENANT_SCOPE_VIOLATION",
	);
});
