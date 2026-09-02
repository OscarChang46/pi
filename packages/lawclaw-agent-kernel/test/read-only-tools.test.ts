import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ReadOnlyToolProvider } from "../src/adapters/read-only-tool-provider.ts";
import { loadRuntimeSettings } from "../src/config/index.ts";
import { KernelError } from "../src/contracts/index.ts";
import { ToolRuntime } from "../src/kernel/tool-runtime.ts";
import { testContext, testTimePort } from "./test-context.ts";

const policy = {
	allowedToolNames: ["lawclaw_list_files", "lawclaw_read_text", "lawclaw_search_text"],
	allowedRisks: ["read_only" as const],
	maxCalls: 5,
	perCallTimeoutMs: 2_000,
	maxArgumentsBytes: 1_024,
};
const runtimeSettings = loadRuntimeSettings();

test("只读工具可以读取工作区文本并拒绝符号链接逃逸", async () => {
	const root = await fs.mkdtemp(path.join(tmpdir(), "lawclaw-tools-"));
	const outside = await fs.mkdtemp(path.join(tmpdir(), "lawclaw-outside-"));
	try {
		await fs.writeFile(path.join(root, "inside.txt"), "boundary ok\n", "utf8");
		await fs.writeFile(path.join(outside, "secret.txt"), "outside\n", "utf8");
		await fs.symlink(path.join(outside, "secret.txt"), path.join(root, "escape.txt"));

		const runtime = new ToolRuntime(
			[await ReadOnlyToolProvider.create(root, runtimeSettings.config.tools.readOnly, testTimePort)],
			runtimeSettings.config.kernel.toolRuntime.maxRegisteredTools,
			testTimePort,
		);
		await runtime.initialize(testContext());
		const read = await runtime.execute(
			testContext(),
			{ toolCallId: "read-1", toolName: "lawclaw_read_text", arguments: { path: "inside.txt" } },
			policy,
			new AbortController().signal,
		);
		assert.match(read.text, /boundary ok/u);

		await assert.rejects(
			runtime.execute(
				testContext(),
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

test("ToolRuntime 默认拒绝未在政策中的工具", async () => {
	const runtime = new ToolRuntime([], runtimeSettings.config.kernel.toolRuntime.maxRegisteredTools, testTimePort);
	await runtime.initialize(testContext());
	await assert.rejects(
		runtime.execute(
			testContext(),
			{ toolCallId: "unknown-1", toolName: "shell", arguments: {} },
			policy,
			new AbortController().signal,
		),
		(error: unknown) => error instanceof KernelError && error.code === "TOOL_NOT_ALLOWED",
	);
});

test("ToolRuntime 拒绝跨租户复用已初始化目录", async () => {
	const runtime = new ToolRuntime([], runtimeSettings.config.kernel.toolRuntime.maxRegisteredTools, testTimePort);
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
