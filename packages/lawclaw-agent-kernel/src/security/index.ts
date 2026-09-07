/** 本目录显式导出入口；跨职责调用方应优先依赖 contracts 中的窄端口。 */
export { compareKillSwitchScopes, InMemoryKillSwitch } from "./kill-switch.ts";
export { PermissionApprovalService } from "./permission-approval.ts";
