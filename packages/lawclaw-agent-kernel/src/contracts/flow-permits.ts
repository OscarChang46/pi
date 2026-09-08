import type { ActionProposal, AdvanceInput, EngineCommand } from "./flow-engine.ts";
import type { PermissionGrant } from "./permissions.ts";

/** 耐久一次性Permit目录；Grant与消费回执职责分离。 */
export interface FlowPermitStore {
	/** 保存已通过PDP判定的Grant及Run、动作、取消栅栏绑定。 */
	issue(input: AdvanceInput, proposal: ActionProposal, grant: PermissionGrant): string;
	/** 执行前原子消费；未知、过期、取消或已消费一律拒绝。 */
	consume(input: AdvanceInput, command: EngineCommand, permitRef: string): PermissionGrant;
}
