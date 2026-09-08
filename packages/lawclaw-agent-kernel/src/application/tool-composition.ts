import type { SandboxPort, TimePort, ToolProviderPort } from "../contracts/index.ts";
import type { KillSwitchPort } from "../contracts/kill-switch.ts";
import type { PermissionApprovalPort } from "../contracts/permissions.ts";
import { ToolCoordinator } from "../control/tool-coordinator.ts";
import type { SandboxPlanner } from "../execution/sandbox-planner.ts";
import { ToolExecutor } from "../execution/tool-executor.ts";
import { ToolRuntime } from "../tools/tool-runtime.ts";

/** 本地工具链装配依赖；不提供放行或无沙箱默认值。 */
export interface ToolCompositionDependencies {
	/** 现有 Grant 判定及有效性检查；不是一次性 Permit 服务。 */
	readonly permissionApproval: PermissionApprovalPort;
	/** 可读紧急停止状态与订阅。 */
	readonly killSwitch: KillSwitchPort;
	/** 已有授权收敛计划器。 */
	readonly sandboxPlanner: SandboxPlanner;
	/** 真实声明自身能力的沙箱机制。 */
	readonly sandboxPort: SandboxPort;
}
/** 装配控制、安全检查和受控执行；缺少任何必需依赖即失败。 */
export function createToolCoordinator(
	providers: readonly ToolProviderPort[],
	capacity: number,
	time: TimePort,
	dependencies: ToolCompositionDependencies,
): ToolCoordinator {
	if (
		!dependencies.permissionApproval ||
		!dependencies.killSwitch ||
		!dependencies.sandboxPlanner ||
		!dependencies.sandboxPort ||
		!time
	)
		throw new Error("工具装配缺少必需依赖。");
	const execution = new ToolExecutor(providers, dependencies.sandboxPlanner, dependencies.sandboxPort);
	const tools = new ToolRuntime(execution, dependencies.permissionApproval, dependencies.killSwitch, time, capacity);
	return new ToolCoordinator(tools, dependencies.permissionApproval, dependencies.killSwitch, time);
}
