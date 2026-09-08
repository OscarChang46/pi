import { createHash } from "node:crypto";
import type { SandboxRequest } from "./tool-security.ts";
/** 计算 SandboxRequest 的内容摘要；Adapter 用它拒绝 Planner 之后被改写的计划。 */
export function calculateSandboxPlanDigest(request: Omit<SandboxRequest, "planDigest">): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				tenantId: request.tenantId,
				toolCallId: request.toolCallId,
				profileRef: request.profileRef,
				grantDigest: request.grantDigest,
				resources: [...request.resources].sort((left, right) =>
					`${left.access}\u0000${left.resourceId}`.localeCompare(`${right.access}\u0000${right.resourceId}`),
				),
				egress: [...request.egress].sort((left, right) =>
					`${left.protocol}\u0000${left.host.toLocaleLowerCase("en-US")}\u0000${left.port}`.localeCompare(
						`${right.protocol}\u0000${right.host.toLocaleLowerCase("en-US")}\u0000${right.port}`,
					),
				),
				secrets: [...request.secrets].sort((left, right) => left.secretId.localeCompare(right.secretId)),
				budget: request.budget,
				allowChildProcesses: request.allowChildProcesses,
				requiresOsProcessIsolation: request.requiresOsProcessIsolation,
				deadlineAt: request.deadlineAt,
			}),
		)
		.digest("hex");
}
