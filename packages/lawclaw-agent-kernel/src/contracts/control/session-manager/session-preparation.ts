import type { RequestContext } from "../../types.ts";
import type { AssemblyCandidate, SessionAnchor, SessionInput } from "../context-engine/assembly-contract.ts";
import type { EnsureSessionCommand } from "./session-manager-contract.ts";

/** 首次输入准备方提供的候选组装回调。 */
export interface RootSessionCandidateAssemblerPort {
	/** 按传入的确切创建意图或历史锚点重新组装。 */
	assemble(sessionInput: SessionInput, signal: AbortSignal): Promise<AssemblyCandidate>;
}

/** 候选与已确认 Session 的配对，尚未表示 Run 已受理。 */
export interface PreparedRootSession {
	/** 最终确认锚点。 */ readonly anchor: SessionAnchor;
	/** 当前命令是否创建 Session。 */ readonly created: boolean;
	/** 最终候选使用的输入。 */ readonly sessionInput: SessionInput;
	/** 尚待保存/条件采纳的候选。 */ readonly candidate: AssemblyCandidate;
}

/** 应用层协调候选后创建，并处理首次创建竞争。 */
export interface RootSessionPreparationPort {
	/** 只在候选成功后确保 Session；竞争失败时按赢家历史重新组装。 */
	prepare(
		context: RequestContext,
		command: EnsureSessionCommand,
		assembler: RootSessionCandidateAssemblerPort,
		signal: AbortSignal,
	): Promise<PreparedRootSession>;
}
