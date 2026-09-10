/** 包级主入口；只暴露控制外观、配置与规范化调用类型，不导出 Pi 或执行适配器。 */

export type {
	CreateRootSessionCommandInput,
	CreateRunCommandInput,
} from "./application/composition-root.ts";
export {
	createAgentKernel,
	createRequestContext,
	createRootSessionCommand,
	createRunCommand,
} from "./application/composition-root.ts";
export { createContextAssembler } from "./application/context-assembly-composition.ts";
export type {
	PreparedRootSession,
	RootSessionCandidateAssemblerPort,
} from "./application/root-session-preparation.ts";
export { RootSessionPreparationCoordinator } from "./application/root-session-preparation.ts";
export type { RuntimeSettings } from "./config/index.ts";
export { loadRuntimeSettings, RuntimeConfigurationError, resolveConfiguredPath } from "./config/index.ts";
export type {
	AssemblyBasis,
	AssemblyCandidate,
	AssemblyLimits,
	ContextArtifactReader,
	ContextMessage,
	ContextPayload,
	ExpectedChildObservation,
	Requirement,
	SessionInput,
	SourceReader,
	SourceReadRequest,
	SourceReadResult,
	SourceRecord,
} from "./contracts/control/context-engine/assembly-contract.ts";
export type { ContextErrorCode } from "./contracts/control/context-engine/context-error.ts";
export { ContextAssemblyError } from "./contracts/control/context-engine/context-error.ts";
export type {
	FlowActivity,
	FlowActivityRecord,
	FlowExecutionContext,
	FlowExecutionToken,
	FlowJournal,
	FlowJournalEvent,
	FlowRun,
	FlowRunAction,
	FlowRunRequest,
	FlowRunState,
	FlowWorkflow,
} from "./contracts/control/flow-engine/flow-engine-contract.ts";
export {
	FLOW_GRAPH_ROUTE,
	FLOW_JOURNAL_EVENT,
	FLOW_RUN_ACTION,
	FLOW_RUN_STATE,
} from "./contracts/control/flow-engine/flow-engine-values.ts";
export type {
	FlowGraphDefinition,
	FlowGraphNode,
	FlowGraphResult,
} from "./contracts/control/flow-engine/flow-graph.ts";
export type {
	AbsentSessionLookupResult,
	ActiveRunBinding,
	ActiveRunBindingState,
	EnsureSessionCommand,
	EnsureSessionResult,
	FoundSessionLookupResult,
	SessionAnchor,
	SessionCommandPort,
	SessionCreationIntent,
	SessionLookupResult,
	SessionQueryPort,
} from "./contracts/control/session-manager/session-manager-contract.ts";
export { ACTIVE_RUN_BINDING_STATE } from "./contracts/control/session-manager/session-manager-contract.ts";
export type { KernelErrorCode } from "./contracts/errors.ts";
export { KernelError } from "./contracts/errors.ts";
export type {
	AdvanceInput as FlowAdvanceInput,
	AdvanceResult as FlowAdvanceResult,
	AgentRunSnapshot,
	FlowAdvancePort,
	RunContextBinding,
	StateCommitPort as FlowStateCommitPort,
} from "./contracts/flow-engine.ts";
export {
	FLOW_COMMAND_STATUS,
	FLOW_EFFECT,
	FLOW_INCIDENT_STATUS,
	FLOW_WAIT_REASON,
	REACT_FLOW_STATE,
	REACT_FLOW_WAIT_STATE,
} from "./contracts/react-flow-values.ts";
export type {
	AgentAdapter,
	AgentEvent,
	AgentRunResult,
	AgentTurnRequest,
	RequestContext,
	RuntimeEventCandidate,
	StartAgentRunCommand,
	TimePort,
} from "./contracts/types.ts";
export type { AgentSystem } from "./control/agent-system.ts";
export { FlowEngine } from "./control/flow-engine/flow-engine.ts";
export { TaskGraph } from "./control/flow-engine/task-graph.ts";
export { ReActFlowPolicy } from "./control/react-flow/react-flow-policy.ts";
