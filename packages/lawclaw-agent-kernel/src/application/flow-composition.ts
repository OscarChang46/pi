import { createConfiguredFlowModel } from "../cognitive/adapters/pi-adapter-factory.ts";
import { AgentRuntime } from "../cognitive/agent-runtime.ts";
import { loadRuntimeSettings, resolveConfiguredPath } from "../config/index.ts";
import type { ModelObservationPort } from "../contracts/control/run-registry/model-observation.ts";
import type { FlowCommandHandlers } from "../contracts/flow-dispatch.ts";
import { flowDigest } from "../contracts/flow-value.ts";
import type { AgentAdapter, ToolDescriptor } from "../contracts/index.ts";
import { createDelegationToolDescriptor } from "../control/delegation-tool-descriptor.ts";
import { createFlowChildHandler } from "../control/flow-child-coordinator.ts";
import { FlowContext } from "../control/flow-context.ts";
import { FlowDriver } from "../control/flow-driver.ts";
import { createFlowModelHandler } from "../control/flow-model-executor.ts";
import {
	createFlowPermissionHandler,
	createFlowToolHandler,
	type FlowToolDependencies,
} from "../control/flow-tool-executor.ts";
import { computeWorkspaceResourceId, createReadOnlyPermissionCeiling } from "../control/permission-scope.ts";
import { isAdvanceInput } from "../control/react-flow/input-schema.ts";
import { ReActFlowPolicy } from "../control/react-flow/react-flow-policy.ts";
import { ReActFlowHost } from "../control/react-flow-host.ts";
import { DurableSessionManager } from "../control/session-manager/durable-session-manager.ts";
import { InProcessReadOnlySandbox } from "../execution/adapters/in-process-read-only-sandbox.ts";
import { ReadOnlyToolProvider } from "../execution/adapters/read-only-tool-provider.ts";
import { SandboxPlanner } from "../execution/sandbox-planner.ts";
import { ToolExecutor } from "../execution/tool-executor.ts";
import { ScopedContextArtifactReader } from "../infrastructure/adapters/context-artifact-reader.ts";
import { InMemoryPermissionSnapshots } from "../infrastructure/adapters/in-memory-permission-snapshots.ts";
import { SqliteFlowArtifacts } from "../infrastructure/adapters/sqlite-flow-artifacts.ts";
import { SqliteFlowPermits } from "../infrastructure/adapters/sqlite-flow-permits.ts";
import { SystemTimeAdapter } from "../infrastructure/adapters/system-time-adapter.ts";
import { SqliteFlowJournal } from "../infrastructure/state-storage/adapters/flow-engine/sqlite-flow-journal.ts";
import { AgentRunDatabase } from "../infrastructure/state-storage/adapters/run-registry/agent-run-database.ts";
import { SqliteRunMaintenance } from "../infrastructure/state-storage/adapters/run-registry/sqlite-run-maintenance.ts";
import { SqliteRunRepository } from "../infrastructure/state-storage/adapters/run-registry/sqlite-run-repository.ts";
import { SqliteSessionRepository } from "../infrastructure/state-storage/adapters/sqlite-session-repository.ts";
import { InMemoryKillSwitch } from "../security/kill-switch.ts";
import { PermissionApprovalService } from "../security/permission-approval.ts";
import { ToolRuntime } from "../tools/tool-runtime.ts";
import { createRequestContext } from "./composition-root.ts";
import { createContextEngineFactory } from "./context-assembly-composition.ts";
import { RootSessionPreparationCoordinator } from "./root-session-preparation.ts";

/** Flow服务装配输入；模型替身只能由测试显式注入。 */
export interface FlowServiceOptions {
	/** 本机宿主授权后的临时模型观察出口；不改变持久执行协议。 */
	readonly modelObservation?: ModelObservationPort;
	/** 本地业务驱动推进上限，默认512；不是系统任务图的访问上限。 */
	readonly maxAdvanceSteps?: number;
	/** 数据目录，必须独立于只读工作区。 */
	readonly dataDirectory: string;
	/** 主运行配置路径。 */
	readonly configFile?: string;
	/** Pi模型配置路径。 */
	readonly modelsPath: string;
	/** 模型提供方。 */
	readonly providerId: string;
	/** 模型标识。 */
	readonly modelId: string;
	/** 测试替身入口；服务CLI不暴露此设置。 */
	readonly modelOverride?: AgentAdapter;
}

/** 装配单租户Flow服务；按持久化、安全执行、上下文、驱动顺序建立所有权。 */
export async function createFlowService(options: FlowServiceOptions) {
	const settings = loadRuntimeSettings(options.configFile);
	const time = new SystemTimeAdapter();
	const persistence = createFlowPersistence(options.dataDirectory, settings, time);
	try {
		const { db, store, artifacts, engine } = persistence;
		const model = new AgentRuntime(
			options.modelOverride ??
				(await createConfiguredFlowModel({
					...options,
					time,
				})),
		);
		const { toolDependencies, descriptors, delegationEnabled } = await createFlowExecution(
			settings,
			persistence,
			time,
		);
		const { frames, configVersion } = createFlowFrames(
			settings,
			options,
			persistence,
			descriptors,
			delegationEnabled,
		);
		const maintenance = new SqliteRunMaintenance(db, settings.config.runtime.requestContext.tenantId, time);
		const driver = createFlowDriver({
			sessions: persistence.sessions,
			modelObservation: options.modelObservation,
			maxAdvanceSteps: options.maxAdvanceSteps ?? 512,
			journal: persistence.journal,
			engine,
			store,
			artifacts,
			time,
			model,
			frames,
			configVersion,
			maintenance,
			toolDependencies,
			descriptors,
		});
		return {
			sessions: persistence.sessions,
			journal: persistence.journal,
			model: { providerId: options.providerId, modelId: options.modelId },
			maintenance,
			store,
			artifacts,
			frames,
			driver,
			time,
			configVersion,
			maxDurationMs: settings.config.runtime.budget.maxDurationMs,
			close: persistence.close,
		};
	} catch (error) {
		persistence.close();
		throw error;
	}
}

type Settings = ReturnType<typeof loadRuntimeSettings>;
type Persistence = ReturnType<typeof createFlowPersistence>;

function createFlowPersistence(dataDirectory: string, settings: Settings, time: SystemTimeAdapter) {
	const scope = settings.config.runtime.requestContext.tenantId;
	const path = `${dataDirectory}/flow.sqlite`;
	const db = new AgentRunDatabase(path);
	const engine = new ReActFlowPolicy();
	let openedJournal: SqliteFlowJournal | undefined;
	let sessionRepository: SqliteSessionRepository | undefined;
	let openedStore: SqliteRunRepository | undefined;
	try {
		const journal = new SqliteFlowJournal(`${dataDirectory}/flow-system.sqlite`, scope);
		openedJournal = journal;
		let sessions: DurableSessionManager;
		const store = new SqliteRunRepository(
			path,
			scope,
			{ advance: engine.advance.bind(engine), digest: flowDigest, isInput: isAdvanceInput },
			time,
			(input) => sessions.assertAdmission(input),
		);
		openedStore = store;
		sessionRepository = new SqliteSessionRepository(`${dataDirectory}/sessions.sqlite`, scope);
		sessions = new DurableSessionManager(sessionRepository, store, new SqliteFlowArtifacts(db, scope), scope);
		for (const runId of store.listRunIds(4096)) {
			const input = store.load(runId);
			if (input && !sessionRepository.get(input.session.sessionId))
				throw new Error("SESSION_STORAGE_MIGRATION_REQUIRED");
		}
		sessions.recover();
		return {
			sessions,
			db,
			journal,
			engine,
			store,
			artifacts: new SqliteFlowArtifacts(db, scope),
			close: () => {
				sessionRepository?.close();
				store.close();
				journal.close();
				db.close();
			},
		};
	} catch (error) {
		sessionRepository?.close();
		openedStore?.close();
		openedJournal?.close();
		db.close();
		throw error;
	}
}

function createFlowPermission(settings: Settings, workspace: string, time: SystemTimeAdapter) {
	const scope = settings.config.runtime.requestContext.tenantId;
	const configured = settings.config.runtime.requestContext;
	const policy = settings.config.runtime.toolPolicy;
	const ceiling = createReadOnlyPermissionCeiling(
		policy,
		computeWorkspaceResourceId(workspace),
		settings.config.tools.readOnly.maxResultBytes,
	);
	const snapshots = new InMemoryPermissionSnapshots({
		policySnapshotId: configured.authorizationSnapshot,
		authorizationSnapshotId: configured.authorizationSnapshot,
		tenantId: scope,
		subjectId: configured.subjectId,
		ceiling,
	});
	const permission = new PermissionApprovalService(snapshots, snapshots, time, policy.perCallTimeoutMs);
	return { permission, ceiling };
}

async function createFlowTools(
	settings: Settings,
	workspace: string,
	permission: PermissionApprovalService,
	time: SystemTimeAdapter,
) {
	const provider = await ReadOnlyToolProvider.create(workspace, settings.config.tools.readOnly, time);
	const killSwitch = new InMemoryKillSwitch(time);
	const tools = new ToolRuntime(
		new ToolExecutor([provider], new SandboxPlanner(time), new InProcessReadOnlySandbox(time)),
		permission,
		killSwitch,
		time,
		settings.config.kernel.toolRuntime.maxRegisteredTools,
	);
	await tools.initialize(createRequestContext(settings, time));
	return tools;
}

async function createFlowExecution(settings: Settings, persistence: Persistence, time: SystemTimeAdapter) {
	const context = () => createRequestContext(settings, time);
	const scope = settings.config.runtime.requestContext.tenantId;
	const workspace = resolveConfiguredPath(settings, settings.config.runtime.workspaceRoot);
	const policy = settings.config.runtime.toolPolicy;
	const configured = settings.config.runtime.requestContext;
	const { ceiling, permission } = createFlowPermission(settings, workspace, time);
	const tools = await createFlowTools(settings, workspace, permission, time);
	const descriptors = tools
		.list()
		.filter((item) => policy.allowedToolNames.includes(item.name) && policy.allowedRisks.includes(item.risk));
	const delegationDescriptor = createDelegationToolDescriptor(
		settings.config.kernel.delegation.delegationToolMaxResultBytes,
	);
	const delegationEnabled =
		settings.config.runtime.delegationPolicy.enabled &&
		policy.allowedToolNames.includes(delegationDescriptor.name) &&
		policy.allowedRisks.includes(delegationDescriptor.risk);
	if (delegationEnabled) descriptors.push(delegationDescriptor);
	const toolDependencies: FlowToolDependencies = {
		permission,
		tools,
		artifacts: persistence.artifacts,
		permits: new SqliteFlowPermits(persistence.db, scope, time),
		requestContext: context,
		time,
		policy,
		scope: (input) => ({
			runtimeId: "flow-local",
			agentId: "flow-agent",
			sessionId: input.run.bindings.sessionId,
			runId: input.run.runId,
			policySnapshotId: configured.authorizationSnapshot,
			runtimeCeiling: ceiling,
			sessionCeiling: ceiling,
			runCeiling: ceiling,
			resourceClaims: ceiling.resources,
			requestedEgress: [],
			requestedSecrets: [],
		}),
	};
	return { toolDependencies, descriptors, delegationEnabled };
}

function createFlowFrames(
	settings: Settings,
	options: FlowServiceOptions,
	persistence: Persistence,
	descriptors: readonly ToolDescriptor[],
	delegationEnabled: boolean,
) {
	const { store, artifacts } = persistence;
	const configuredBudget = settings.config.runtime.budget;
	const configVersion = flowDigest({
		config: settings.config,
		providerId: options.providerId,
		modelId: options.modelId,
		prompts: {
			agent: settings.promptCatalog.require(settings.config.prompts.agentSystemPromptId),
			child: settings.promptCatalog.require(settings.config.prompts.childAgentSystemPromptId),
		},
	});
	const frames = new FlowContext(
		createContextEngineFactory(
			new ScopedContextArtifactReader(artifacts, async (_ref, signal) => signal.throwIfAborted()),
		),
		store,
		artifacts,
		{
			systemPrompt: settings.promptCatalog.require(settings.config.prompts.agentSystemPromptId),
			childSystemPrompt: settings.promptCatalog.require(settings.config.prompts.childAgentSystemPromptId),
			tools: descriptors,
			budget: {
				maxTurns: configuredBudget.maxTurns,
				maxToolCalls: Math.min(128, configuredBudget.maxToolCalls),
				maxChildren: delegationEnabled ? Math.min(8, settings.config.runtime.delegationPolicy.maxChildren) : 0,
				maxDepth: delegationEnabled ? 1 : 0,
				maxContextBytes: 1048576,
				maxInputTokens: Math.min(131072, configuredBudget.maxInputTokens),
				outputReserveTokens: Math.min(32768, configuredBudget.outputReserveTokens),
				maxOutputBytes: Math.min(1048576, configuredBudget.maxOutputChars),
			},
			bindings: {
				executionEnvelopeRef: configVersion,
				routeSnapshotRef: flowDigest({ providerId: options.providerId, modelId: options.modelId }),
				policySnapshotRef: settings.config.runtime.requestContext.authorizationSnapshot,
				configVersion,
			},
		},
		{
			sessions: persistence.sessions,
			preparation: new RootSessionPreparationCoordinator(persistence.sessions, persistence.sessions),
			requestContext: () => createRequestContext(settings, new SystemTimeAdapter()),
		},
	);
	return { frames, configVersion };
}

interface DriverAssembly {
	readonly sessions: DurableSessionManager;
	readonly modelObservation: ModelObservationPort | undefined;
	readonly maxAdvanceSteps: number;
	readonly journal: SqliteFlowJournal;
	readonly engine: ReActFlowPolicy;
	readonly store: SqliteRunRepository;
	readonly artifacts: SqliteFlowArtifacts;
	readonly time: SystemTimeAdapter;
	readonly model: AgentRuntime;
	readonly frames: FlowContext;
	readonly configVersion: string;
	readonly maintenance: SqliteRunMaintenance;
	readonly toolDependencies: FlowToolDependencies;
	readonly descriptors: readonly ToolDescriptor[];
}

function createFlowDriver(assembly: DriverAssembly): ReActFlowHost {
	const { engine, store, artifacts, time, model, frames, configVersion, maintenance, toolDependencies } = assembly;
	const host = new ReActFlowHost(store, assembly.journal, (runId) => assembly.sessions.finalize(runId));
	const childHandler = createFlowChildHandler({
		admit: (input, parent) => assembly.sessions.admit(input, parent),
		store,
		artifacts,
		frames,
		time,
		drive: (runId) => host.drive(runId),
		abort: (runId) => host.abort(runId),
	});
	const handlers: FlowCommandHandlers = {
		InvokeModel: createFlowModelHandler(
			model,
			artifacts,
			toolDependencies.requestContext,
			store,
			assembly.modelObservation,
		),
		RequestPermission: createFlowPermissionHandler(toolDependencies),
		DispatchTool: createFlowToolHandler(toolDependencies),
		CreateChildRun: childHandler,
		CancelOutstanding: async (input) => {
			maintenance.cancelOutstanding(input.run.runId);
			return null;
		},
		RequestReconciliation: async (input, command) => {
			maintenance.requestReconciliation(
				input.run.runId,
				command.payload.targetCommandId,
				command.payload.incidentRef,
			);
			return null;
		},
	};
	const driver = new FlowDriver({
		maxAdvanceSteps: assembly.maxAdvanceSteps,
		replay: host.replay.bind(host),
		activity: host.activity.bind(host),
		engine,
		store,
		artifacts,
		time,
		handlers,
		recoveryHandlers: {
			CreateChildRun: childHandler,
			CancelOutstanding: handlers.CancelOutstanding,
			RequestReconciliation: handlers.RequestReconciliation,
		},
		prepareContext: (input, signal) => {
			if (input.run.bindings.configVersion !== configVersion) throw new Error("FLOW_CONFIG_VERSION_MISMATCH");
			return frames.prepare(input, signal);
		},
	});
	host.bind(driver);
	return host;
}
