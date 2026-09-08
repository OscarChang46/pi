import type { ToolDescriptor } from "../contracts/index.ts";

/** 既有Loop与耐久Flow共用单层委派描述，保持同一模型侧契约。 */
export function createDelegationToolDescriptor(maxResultBytes: number): ToolDescriptor {
	return Object.freeze<ToolDescriptor>({
		name: "lawclaw_delegate",
		version: "1.0.0",
		description: "把单一技术分析目标委派给受限、只读、不可递归的子 Agent。",
		risk: "read_only",
		maxResultBytes,
		inputSchema: {
			type: "object",
			properties: { task: { type: "string", description: "有界的技术委派目标" } },
			required: ["task"],
			additionalProperties: false,
		},
	});
}
