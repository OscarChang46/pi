/** 包级主入口；只暴露控制外观、配置与规范化调用类型，不导出 Pi 或执行适配器。 */
export { createAgentKernel, createRequestContext, createRunCommand } from "./application/composition-root.ts";
export type { RuntimeSettings } from "./config/index.ts";
export { loadRuntimeSettings, RuntimeConfigurationError, resolveConfiguredPath } from "./config/index.ts";
export type { KernelErrorCode } from "./contracts/errors.ts";
export { KernelError } from "./contracts/errors.ts";
export type {
	AdvanceInput as FlowAdvanceInput,
	AdvanceResult as FlowAdvanceResult,
	AgentRunSnapshot,
	FlowAdvancePort,
	StateCommitPort as FlowStateCommitPort,
} from "./contracts/flow-engine.ts";
export type { FlowGraphDefinition, FlowGraphNode, FlowGraphResult } from "./contracts/flow-graph.ts";
export type {
	FlowActivity,
	FlowActivityRecord,
	FlowExecutionContext,
	FlowExecutionToken,
	FlowJournal,
	FlowJournalEvent,
	FlowRun,
	FlowRunRequest,
	FlowSystemAction,
	FlowSystemState,
	FlowWorkflow,
} from "./contracts/flow-system.ts";
export {
	FLOW_GRAPH_ROUTE,
	FLOW_JOURNAL_EVENT,
	FLOW_SYSTEM_ACTION,
	FLOW_SYSTEM_STATE,
} from "./contracts/flow-system-values.ts";
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
export { FlowEngine } from "./control/flow-system/flow-engine.ts";
export { TaskGraph } from "./control/flow-system/task-graph.ts";
export { ReActFlowPolicy } from "./control/react-flow/react-flow-policy.ts";
