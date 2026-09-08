import type {
	AdvanceInput,
	AdvanceResult,
	CommandRecord,
	EngineCommand,
	ExecutionClaim,
	RuntimeEvent,
	StateCommitPort,
	TranscriptEntry,
} from "./flow-engine.ts";

/** 持久化适配器复用Core验证和摘要规则；由装配方注入，不依赖控制层实现。 */
export interface FlowStorageRules {
	/** 重算决定，阻止任意patch或伪造命令提交。 */
	advance(input: AdvanceInput): AdvanceResult;
	/** 规范字节摘要。 */
	digest(value: unknown): string;
	/** 恢复快照时验证封闭结构。 */
	isInput(value: unknown): value is AdvanceInput;
}

/** RunRegistry持久化门面；实例绑定单一受信任存储作用域。 */
export interface DurableFlowStore extends StateCommitPort {
	/** 耐久受理完整初始输入；同ID异内容拒绝。 */
	admit(input: AdvanceInput, parent?: AdvanceInput): void;
	/** 返回独立快照；未知Run返回null。 */
	load(runId: string): AdvanceInput | null;
	/** 读取首次受理输入，供上下文从初始帧与耐久转录重建。 */
	initial(runId: string): AdvanceInput | null;
	/** 返回按消费顺序排列的已提交转录。 */
	transcript(runId: string): readonly TranscriptEntry[];
	/** 有界扫描，供调度重新发现任务。 */
	listRunIds(limit: number): readonly string[];
	/** 首次领取或同身份续期；其他活动持有者返回null。 */
	acquire(runId: string, ownerId: string, ttlMs: number): ExecutionClaim | null;
	/** 绑定当前Run版本和执行资格，受理来自可信边界的下一事件。 */
	acceptEvent(runId: string, event: RuntimeEvent, claim: ExecutionClaim): void;
	/** 原子取消栅栏；不直接计算业务终态。 */
	cancel(runId: string): void;
	/** 列出当前Run的耐久命令。 */
	commands(runId: string): readonly CommandRecord[];
	/** 原子领取尚未派发命令；已领取命令不得重复执行。 */
	claimCommand(runId: string, commandId: string, claim: ExecutionClaim): EngineCommand | null;
	/** 保存执行端耐久确认或结果；不重新打开已完成命令。 */
	recordCommand(runId: string, record: CommandRecord, claim: ExecutionClaim): void;
	/** 关闭存储连接。 */
	close(): void;
}
