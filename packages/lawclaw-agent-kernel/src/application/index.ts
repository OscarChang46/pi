/** 应用装配入口；只在此创建跨职责组件，不向核心传递配置加载器或 Pi 原生类型。 */
export { createAgentKernel, createRequestContext, createRunCommand } from "./composition-root.ts";
export { createToolCoordinator } from "./tool-composition.ts";
