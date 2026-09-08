/** 本目录显式导出入口；跨职责调用方应优先依赖 contracts 中的窄端口。 */
export { IN_PROCESS_READ_ONLY_CAPABILITIES, InProcessReadOnlySandbox } from "./in-process-read-only-sandbox.ts";
export { ReadOnlyToolProvider } from "./read-only-tool-provider.ts";
