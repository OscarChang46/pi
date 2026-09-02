import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
	FakeDelegationProvider,
	InMemoryPermissionSnapshots,
	InProcessReadOnlySandbox,
	PiAgentAdapter,
	ReadOnlyToolProvider,
	SystemTimeAdapter,
} from "../adapters/index.ts";
import { loadRuntimeSettings, RuntimeConfigurationError, type RuntimeSettings } from "../config/index.ts";
import type { RequestContext, StartAgentRunCommand, TimePort } from "../contracts/index.ts";
import {
	AgentLoopEngine,
	AgentRuntime,
	ContextEngine,
	computeWorkspaceResourceId,
	createReadOnlyPermissionCeiling,
	DelegationEngine,
	InMemoryKillSwitch,
	PermissionApprovalService,
	SandboxPlanner,
	ToolRuntime,
} from "../kernel/index.ts";

/** 创建配置化的本地调用上下文；服务接入时必须改由 Backend 签发可信上下文。 */
export function createRequestContext(
	settings: RuntimeSettings = loadRuntimeSettings(),
	timePort: TimePort = new SystemTimeAdapter(),
): RequestContext {
	const now = timePort.now();
	const configured = settings.config.runtime.requestContext;
	return {
		tenant: {
			tenantId: configured.tenantId,
			subjectId: configured.subjectId,
			authorizationSnapshot: configured.authorizationSnapshot,
			issuedAt: timePort.addMilliseconds(now, -configured.issuedAtSkewMs).isoUtc,
			expiresAt: timePort.addMilliseconds(now, configured.tenantTtlMs).isoUtc,
			contextVersion: "1",
		},
		operation: {
			traceId: crypto.randomUUID(),
			spanId: crypto.randomUUID(),
			correlationId: crypto.randomUUID(),
			deadlineAt: timePort.addMilliseconds(now, configured.operationDeadlineMs).isoUtc,
			requestStartedAt: now.isoUtc,
		},
		time: { timeZone: configured.timeZone, locale: configured.locale },
	};
}

/** 返回完全由配置构造的 Agent Run 命令；只生成 Run/Session 技术标识。 */
export function createRunCommand(
	workspaceRoot: string,
	settings: RuntimeSettings = loadRuntimeSettings(),
): StartAgentRunCommand {
	return {
		runId: crypto.randomUUID(),
		sessionId: crypto.randomUUID(),
		systemPrompt: settings.promptCatalog.require(settings.config.prompts.agentSystemPromptId),
		goal: settings.config.runtime.goal,
		contextItems: [settings.config.runtime.contextItem],
		toolPolicy: settings.config.runtime.toolPolicy,
		delegationPolicy: settings.config.runtime.delegationPolicy,
		budget: settings.config.runtime.budget,
		workspaceRoot,
	};
}

/**
 * Agent Kernel 的唯一 Composition Root。
 *
 * 模型、Kernel 参数、工具限制和 Faux 场景全部由已验证配置注入；Kernel 不读取 YAML。
 */
export async function createAgentKernel(
	workspaceRoot: string,
	settings: RuntimeSettings = loadRuntimeSettings(),
): Promise<AgentRuntime> {
	const timePort = new SystemTimeAdapter();
	let adapter: PiAgentAdapter;
	const selection = settings.config.model;
	const scenario = settings.config.runtime.fauxScenario;

	if (selection.source === "faux") {
		const faux = fauxProvider({
			api: `${selection.providerId}-api`,
			provider: selection.providerId,
			models: [{ id: selection.modelId }],
			tokenSize: { min: scenario.tokenSizeMin, max: scenario.tokenSizeMax },
		});
		faux.setResponses([
			fauxAssistantMessage(
				[
					fauxText(scenario.beforeReadText),
					fauxToolCall("lawclaw_read_text", { path: scenario.readPath }, { id: crypto.randomUUID() }),
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(
				[
					fauxText(scenario.beforeDelegationText),
					fauxToolCall("lawclaw_delegate", { task: scenario.delegationTask }, { id: crypto.randomUUID() }),
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(scenario.finalResponse),
		]);
		const models = createModels();
		models.setProvider(faux.provider);
		adapter = new PiAgentAdapter(
			faux.getModel(),
			models.streamSimple.bind(models),
			settings.config.kernel.piAdapter,
			timePort,
		);
	} else {
		const models = builtinModels();
		const model = models.getModel(selection.providerId, selection.modelId);
		if (!model) {
			throw new RuntimeConfigurationError(`模型目录中不存在配置项 ${selection.providerId}/${selection.modelId}。`);
		}
		adapter = new PiAgentAdapter(model, models.streamSimple.bind(models), settings.config.kernel.piAdapter, timePort);
	}

	const readOnlyProvider = await ReadOnlyToolProvider.create(workspaceRoot, settings.config.tools.readOnly, timePort);
	const workspaceResourceId = computeWorkspaceResourceId(workspaceRoot);
	const permissionCeiling = createReadOnlyPermissionCeiling(
		settings.config.runtime.toolPolicy,
		workspaceResourceId,
		settings.config.tools.readOnly.maxResultBytes,
	);
	const configuredContext = settings.config.runtime.requestContext;
	const permissionSnapshots = new InMemoryPermissionSnapshots({
		policySnapshotId: configuredContext.authorizationSnapshot,
		authorizationSnapshotId: configuredContext.authorizationSnapshot,
		tenantId: configuredContext.tenantId,
		subjectId: configuredContext.subjectId,
		ceiling: permissionCeiling,
	});
	const toolRuntime = new ToolRuntime(
		[readOnlyProvider],
		settings.config.kernel.toolRuntime.maxRegisteredTools,
		timePort,
		{
			permissionApproval: new PermissionApprovalService(
				permissionSnapshots,
				permissionSnapshots,
				timePort,
				settings.config.runtime.toolPolicy.perCallTimeoutMs,
			),
			killSwitch: new InMemoryKillSwitch(timePort),
			sandboxPlanner: new SandboxPlanner(timePort),
			sandboxPort: new InProcessReadOnlySandbox(timePort),
		},
	);
	const delegationEngine = new DelegationEngine(
		new FakeDelegationProvider(scenario.fakeDelegationSummaryPrefix),
		settings.config.kernel.delegation.maxTrackedParents,
		timePort,
	);
	const loopEngine = new AgentLoopEngine(
		adapter,
		new ContextEngine(settings.config.kernel.context),
		toolRuntime,
		delegationEngine,
		settings.config.kernel.runLimits,
		settings.config.kernel.delegation.delegationToolMaxResultBytes,
		timePort,
	);
	return new AgentRuntime(
		`runtime:${configuredContext.tenantId}`,
		"agent:kernel-default",
		loopEngine,
		settings.config.kernel.objectModel,
		permissionCeiling,
	);
}
