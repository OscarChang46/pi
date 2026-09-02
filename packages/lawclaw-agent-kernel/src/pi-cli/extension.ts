import { fileURLToPath } from "node:url";
import { type Static, Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { InMemoryPermissionSnapshots } from "../adapters/in-memory-permission-snapshots.ts";
import { InProcessReadOnlySandbox } from "../adapters/in-process-read-only-sandbox.ts";
import { PiCliDelegationProvider } from "../adapters/pi-cli-delegation-provider.ts";
import { ReadOnlyToolProvider } from "../adapters/read-only-tool-provider.ts";
import { SystemTimeAdapter } from "../adapters/system-time-adapter.ts";
import { loadRuntimeSettings, type RequestContextConfig, type RuntimeSettings } from "../config/index.ts";
import type { RequestContext, TimePort, ToolInvocation } from "../contracts/index.ts";
import { DelegationEngine } from "../kernel/delegation-engine.ts";
import { InMemoryKillSwitch } from "../kernel/kill-switch.ts";
import { PermissionApprovalService } from "../kernel/permission-approval.ts";
import { SandboxPlanner } from "../kernel/sandbox-planner.ts";
import { computeWorkspaceResourceId, createReadOnlyPermissionCeiling, ToolRuntime } from "../kernel/tool-runtime.ts";

function requestContext(config: RequestContextConfig, timePort: TimePort): RequestContext {
	const now = timePort.now();
	return {
		tenant: {
			tenantId: process.env.LAWCLAW_TENANT_ID?.trim() || config.tenantId,
			subjectId: config.subjectId,
			authorizationSnapshot: config.authorizationSnapshot,
			issuedAt: timePort.addMilliseconds(now, -config.issuedAtSkewMs).isoUtc,
			expiresAt: timePort.addMilliseconds(now, config.tenantTtlMs).isoUtc,
			contextVersion: "1",
		},
		operation: {
			traceId: crypto.randomUUID(),
			spanId: crypto.randomUUID(),
			correlationId: crypto.randomUUID(),
			deadlineAt: timePort.addMilliseconds(now, config.operationDeadlineMs).isoUtc,
			requestStartedAt: now.isoUtc,
		},
		time: { timeZone: config.timeZone, locale: config.locale },
	};
}

async function runtimeFor(
	cwd: string,
	settings: RuntimeSettings,
	timePort: TimePort,
	context: RequestContext,
): Promise<ToolRuntime> {
	const provider = await ReadOnlyToolProvider.create(cwd, settings.config.tools.readOnly, timePort);
	const ceiling = createReadOnlyPermissionCeiling(
		settings.config.cli.toolPolicy,
		computeWorkspaceResourceId(cwd),
		settings.config.tools.readOnly.maxResultBytes,
	);
	const snapshots = new InMemoryPermissionSnapshots({
		policySnapshotId: context.tenant.authorizationSnapshot,
		authorizationSnapshotId: context.tenant.authorizationSnapshot,
		tenantId: context.tenant.tenantId,
		subjectId: context.tenant.subjectId,
		ceiling,
	});
	const runtime = new ToolRuntime([provider], settings.config.kernel.toolRuntime.maxRegisteredTools, timePort, {
		permissionApproval: new PermissionApprovalService(
			snapshots,
			snapshots,
			timePort,
			settings.config.cli.toolPolicy.perCallTimeoutMs,
		),
		killSwitch: new InMemoryKillSwitch(timePort),
		sandboxPlanner: new SandboxPlanner(timePort),
		sandboxPort: new InProcessReadOnlySandbox(timePort),
	});
	await runtime.initialize(context);
	return runtime;
}

async function runReadOnlyTool(
	settings: RuntimeSettings,
	extensionContext: ExtensionContext,
	invocation: ToolInvocation,
	signal: AbortSignal | undefined,
	timePort: TimePort,
) {
	const context = requestContext(settings.config.cli.requestContext, timePort);
	const runtime = await runtimeFor(extensionContext.cwd, settings, timePort, context);
	const ceiling = createReadOnlyPermissionCeiling(
		settings.config.cli.toolPolicy,
		computeWorkspaceResourceId(extensionContext.cwd),
		settings.config.tools.readOnly.maxResultBytes,
	);
	return runtime.execute(
		context,
		{
			runtimeId: `runtime:${context.tenant.tenantId}`,
			agentId: "agent:pi-cli",
			sessionId: context.operation.correlationId,
			runId: context.operation.correlationId,
			policySnapshotId: context.tenant.authorizationSnapshot,
			runtimeCeiling: ceiling,
			sessionCeiling: ceiling,
			runCeiling: ceiling,
			resourceClaims: ceiling.resources,
			requestedEgress: [],
			requestedSecrets: [],
		},
		invocation,
		settings.config.cli.toolPolicy,
		signal ?? new AbortController().signal,
	);
}

/**
 * Pi CLI 的 LawClaw 开发扩展入口。
 *
 * 所有可调预算、租户、工具和委派参数来自严格配置；安全禁止项仍是架构不变量。
 */
export default function lawClawPiExtension(pi: ExtensionAPI): void {
	const settings = loadRuntimeSettings();
	const timePort = new SystemTimeAdapter();
	timePort.toZonedDateTime(timePort.now(), settings.config.cli.requestContext);
	const cliSafetyAppendix = settings.promptCatalog.require(settings.config.prompts.cliSafetyAppendixId);
	const childSystemPrompt = settings.promptCatalog.require(settings.config.prompts.childAgentSystemPromptId);
	const delegationPolicy = settings.config.cli.delegationPolicy;

	const listSchema = Type.Object(
		{ path: Type.Optional(Type.String({ description: "相对工作区路径，默认为当前目录" })) },
		{ additionalProperties: false },
	);
	const readSchema = Type.Object(
		{ path: Type.String({ minLength: 1, description: "工作区内文本文件的相对路径" }) },
		{ additionalProperties: false },
	);
	const searchSchema = Type.Object(
		{
			query: Type.String({ minLength: 1, description: "普通文本查询，不作为正则表达式执行" }),
			path: Type.Optional(Type.String({ description: "相对工作区目录，默认为当前目录" })),
		},
		{ additionalProperties: false },
	);
	const delegateSchema = Type.Object(
		{
			task: Type.String({
				minLength: 1,
				maxLength: delegationPolicy.maxTaskChars,
				description: "交给只读技术子 Agent 的单一目标",
			}),
		},
		{ additionalProperties: false },
	);

	pi.on("before_agent_start", async (event) => ({
		systemPrompt: `${event.systemPrompt}\n\n${cliSafetyAppendix}`,
	}));

	pi.on("tool_call", async (event) => {
		// Shell 和写入能力属于首版禁止职责，不允许通过配置开启。
		if (["bash", "powershell", "write", "edit"].includes(event.toolName)) {
			return { block: true, reason: "LawClaw Agent Kernel 默认拒绝 Shell 和文件写入工具。" };
		}
		return undefined;
	});

	pi.registerCommand("lawclaw-status", {
		description: "显示 LawClaw Agent Kernel 的边界、租户和已启用能力",
		handler: async (_args, context) => {
			const depth = Number.parseInt(process.env.LAWCLAW_CHILD_DEPTH ?? "0", 10);
			const tenantId = process.env.LAWCLAW_TENANT_ID || settings.config.cli.requestContext.tenantId;
			context.ui.notify(`LawClaw Agent Kernel 已加载；tenant=${tenantId}；depth=${depth}；模式=只读`, "info");
		},
	});

	pi.registerTool({
		name: "lawclaw_list_files",
		label: "列出文件",
		description: "列出工作区内目录的直接子项；不递归且拒绝路径逃逸。",
		parameters: listSchema,
		async execute(toolCallId, params: Static<typeof listSchema>, signal, _onUpdate, context) {
			const result = await runReadOnlyTool(
				settings,
				context,
				{ toolCallId, toolName: "lawclaw_list_files", arguments: { path: params.path ?? "." } },
				signal,
				timePort,
			);
			return { content: [{ type: "text" as const, text: result.text }], details: result.metadata };
		},
	});

	pi.registerTool({
		name: "lawclaw_read_text",
		label: "读取文本",
		description: "读取工作区内受大小限制的 UTF-8 文件；拒绝符号链接逃逸。",
		parameters: readSchema,
		async execute(toolCallId, params: Static<typeof readSchema>, signal, _onUpdate, context) {
			const result = await runReadOnlyTool(
				settings,
				context,
				{ toolCallId, toolName: "lawclaw_read_text", arguments: { path: params.path } },
				signal,
				timePort,
			);
			return { content: [{ type: "text" as const, text: result.text }], details: result.metadata };
		},
	});

	pi.registerTool({
		name: "lawclaw_search_text",
		label: "搜索文本",
		description: "在工作区内有界搜索普通文本；不执行正则表达式或 Shell。",
		parameters: searchSchema,
		async execute(toolCallId, params: Static<typeof searchSchema>, signal, _onUpdate, context) {
			const result = await runReadOnlyTool(
				settings,
				context,
				{
					toolCallId,
					toolName: "lawclaw_search_text",
					arguments: { query: params.query, path: params.path ?? "." },
				},
				signal,
				timePort,
			);
			return { content: [{ type: "text" as const, text: result.text }], details: result.metadata };
		},
	});

	const depth = Number.parseInt(process.env.LAWCLAW_CHILD_DEPTH ?? "0", 10);
	if (delegationPolicy.enabled && depth < delegationPolicy.maxDepth) {
		pi.registerTool({
			name: "lawclaw_delegate",
			label: "委派只读子 Agent",
			description: "把一个技术分析目标交给隔离的单层只读子 Agent；子 Agent 不能再次委派。",
			parameters: delegateSchema,
			async execute(_toolCallId, params: Static<typeof delegateSchema>, signal, _onUpdate, context) {
				const provider = new PiCliDelegationProvider(
					process.env.LAWCLAW_PI_CLI_EXECUTABLE ?? process.execPath,
					process.env.LAWCLAW_PI_CLI_ENTRY ?? process.argv[1] ?? "pi",
					fileURLToPath(import.meta.url),
					childSystemPrompt,
					{
						offline: settings.config.cli.offline,
						maxRpcStdoutBytes: settings.config.cli.childProcess.maxRpcStdoutBytes,
						killGraceMs: settings.config.cli.childProcess.killGraceMs,
					},
				);
				const engine = new DelegationEngine(
					provider,
					settings.config.kernel.delegation.maxTrackedParents,
					timePort,
				);
				const modelRef = context.model ? `${context.model.provider}/${context.model.id}` : undefined;
				const result = await engine.delegate(
					requestContext(settings.config.cli.requestContext, timePort),
					{
						parentRunId: process.env.LAWCLAW_PARENT_RUN_ID || crypto.randomUUID(),
						depth,
						task: params.task,
						workspaceRoot: context.cwd,
						...(modelRef ? { modelRef } : {}),
					},
					delegationPolicy,
					signal ?? new AbortController().signal,
				);
				return {
					content: [{ type: "text" as const, text: result.summary }],
					details: { childRunId: result.childRunId, status: result.status },
				};
			},
		});
	}
}
