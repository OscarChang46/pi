/** 应用装配入口；只在此创建跨职责组件，不向核心传递配置加载器或 Pi 原生类型。 */

export type { CreateRootSessionCommandInput, CreateRunCommandInput } from "./composition-root.ts";
export {
	createAgentKernel,
	createRequestContext,
	createRootSessionCommand,
	createRunCommand,
} from "./composition-root.ts";
export type {
	PreparedRootSession,
	RootSessionCandidateAssemblerPort,
} from "./root-session-preparation.ts";
export { RootSessionPreparationCoordinator } from "./root-session-preparation.ts";
export { createToolCoordinator } from "./tool-composition.ts";
