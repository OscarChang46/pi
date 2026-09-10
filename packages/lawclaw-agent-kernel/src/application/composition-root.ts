import { createPiAdapter } from "../cognitive/adapters/pi-adapter-factory.ts";
import { AgentRuntime } from "../cognitive/agent-runtime.ts";
import { loadRuntimeSettings, type RuntimeSettings } from "../config/index.ts";
import type { EnsureSessionCommand, RequestContext, StartAgentRunCommand, TimePort } from "../contracts/index.ts";
import { AgentSystem } from "../control/agent-system.ts";
import { DelegationEngine } from "../control/delegation-engine.ts";
import { computeWorkspaceResourceId, createReadOnlyPermissionCeiling } from "../control/permission-scope.ts";
import { RunFlow } from "../control/run-flow.ts";
import { RunRegistry } from "../control/run-registry/run-registry.ts";
import { InProcessReadOnlySandbox } from "../execution/adapters/in-process-read-only-sandbox.ts";
import { ReadOnlyToolProvider } from "../execution/adapters/read-only-tool-provider.ts";
import { SandboxPlanner } from "../execution/sandbox-planner.ts";
import { FakeDelegationProvider } from "../infrastructure/adapters/fake-delegation-provider.ts";
import { InMemoryPermissionSnapshots } from "../infrastructure/adapters/in-memory-permission-snapshots.ts";
import { SystemTimeAdapter } from "../infrastructure/adapters/system-time-adapter.ts";
import { InMemoryKillSwitch } from "../security/kill-switch.ts";
import { PermissionApprovalService } from "../security/permission-approval.ts";
import { createInMemoryContextDependencies } from "./context-assembly-composition.ts";
import { createToolCoordinator } from "./tool-composition.ts";

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

/** 创建显式 Root Session 命令所需的调用方业务绑定。 */
export interface CreateRootSessionCommandInput {
	/** 可信作用域内稳定的逻辑会话键；不是 Session ID。 */
	readonly logicalKey: string;
	/** 本会话绑定的 Agent 定义引用。 */
	readonly agentDefinitionRef: string;
	/** 本会话绑定的 Context 策略引用。 */
	readonly contextPolicyRef: string;
}

/** 构造稳定创建意图并只生成幂等命令标识；Session ID 由 ensure 产生。 */
export function createRootSessionCommand(input: CreateRootSessionCommandInput): EnsureSessionCommand {
	return {
		commandId: crypto.randomUUID(),
		intent: {
			logicalKey: input.logicalKey,
			agentDefinitionRef: input.agentDefinitionRef,
			contextPolicyRef: input.contextPolicyRef,
			parent: null,
		},
	};
}

/** 创建 Run 命令所需的显式 Session 绑定和工作区输入。 */
export interface CreateRunCommandInput {
	/** 已由 Session 显式创建步骤确认的技术标识。 */
	readonly sessionId: string;
	/** 工具和子 Agent 允许访问的工作区根目录。 */
	readonly workspaceRoot: string;
}

/** 返回完全由显式 Session 绑定和配置构造的 Agent Run 命令；只生成 Run 标识。 */
export function createRunCommand(
	input: CreateRunCommandInput,
	settings: RuntimeSettings = loadRuntimeSettings(),
): StartAgentRunCommand {
	return {
		runId: crypto.randomUUID(),
		sessionId: input.sessionId,
		systemPrompt: settings.promptCatalog.require(settings.config.prompts.agentSystemPromptId),
		goal: settings.config.runtime.goal,
		contextItems: [settings.config.runtime.contextItem],
		toolPolicy: settings.config.runtime.toolPolicy,
		delegationPolicy: settings.config.runtime.delegationPolicy,
		budget: settings.config.runtime.budget,
		workspaceRoot: input.workspaceRoot,
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
): Promise<AgentSystem> {
	const timePort = new SystemTimeAdapter();
	const adapter = new AgentRuntime(createPiAdapter(settings, timePort));
	const scenario = settings.config.runtime.fauxScenario;

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
	const toolRuntime = createToolCoordinator(
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
	const loopEngine = new RunFlow(
		adapter,
		createInMemoryContextDependencies(),
		toolRuntime,
		delegationEngine,
		settings.config.kernel.runLimits,
		settings.config.kernel.delegation.delegationToolMaxResultBytes,
		timePort,
	);
	return new AgentSystem(
		`runtime:${configuredContext.tenantId}`,
		"agent:kernel-default",
		loopEngine,
		settings.config.kernel.objectModel,
		permissionCeiling,
		new RunRegistry(),
	);
}
