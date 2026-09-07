/** 包级主入口；只暴露控制外观、配置与规范化调用类型，不导出 Pi 或执行适配器。 */
export { createAgentKernel, createRequestContext, createRunCommand } from "./application/composition-root.ts";
export type { RuntimeSettings } from "./config/index.ts";
export { loadRuntimeSettings, RuntimeConfigurationError, resolveConfiguredPath } from "./config/index.ts";
export type { KernelErrorCode } from "./contracts/errors.ts";
export { KernelError } from "./contracts/errors.ts";
export type {
	AdvanceInput as FlowAdvanceInput,
	AdvanceResult as FlowAdvanceResult,
	FlowAdvancePort,
	StateCommitPort as FlowStateCommitPort,
} from "./contracts/flow-engine.ts";
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
