import type { AdvanceInput, CommandPayload, EngineCommand, RuntimeEvent, RuntimePayload } from "./flow-engine.ts";

/** 执行边界生成的候选事实；事件序列由Run存储分配。 */
export interface FlowCommandOutcome {
	/** 事实来源，不由HTTP调用方选择。 */
	readonly source: RuntimeEvent["source"];
	/** 与已提交命令关联的结果。 */
	readonly payload: RuntimePayload;
}

/** 命令分支处理器；执行器不改变Run状态。 */
export type FlowCommandHandler<K extends CommandPayload["kind"]> = (
	input: AdvanceInput,
	command: EngineCommand & {
		/** 已收窄到注册分支的命令参数。 */
		readonly payload: Extract<
			CommandPayload,
			{
				/** 当前处理器声明的分支标识。 */
				kind: K;
			}
		>;
	},
	signal: AbortSignal,
) => Promise<FlowCommandOutcome | null>;

/** 装配时穷举全部命令种类，新增命令必须登记处理器。 */
export type FlowCommandHandlers = { readonly [K in CommandPayload["kind"]]: FlowCommandHandler<K> };
