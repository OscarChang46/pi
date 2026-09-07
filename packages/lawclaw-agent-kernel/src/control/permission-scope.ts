import { createHash } from "node:crypto";
import type { PermissionCeiling } from "../contracts/permissions.ts";
import type { ToolPolicy } from "../contracts/types.ts";
/** 从当前只读工具政策构造不可扩权的权限上限。 */
export function createReadOnlyPermissionCeiling(
	policy: ToolPolicy,
	workspaceResourceId: string,
	maxResultBytes: number,
): PermissionCeiling {
	return Object.freeze({
		toolPolicy: policy,
		resources: Object.freeze([{ resourceId: workspaceResourceId, access: "read" as const }]),
		egress: Object.freeze([]),
		secrets: Object.freeze([]),
		budget: Object.freeze({ timeoutMs: policy.perCallTimeoutMs, maxResultBytes }),
	});
}

/** 把工作区路径转换为不泄漏裸路径的稳定资源引用。 */
export function computeWorkspaceResourceId(workspaceRoot: string): string {
	return `workspace:sha256:${createHash("sha256").update(workspaceRoot).digest("hex")}`;
}
