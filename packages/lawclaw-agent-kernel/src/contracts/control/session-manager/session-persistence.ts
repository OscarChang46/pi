import type { AdvanceInput } from "../../flow-engine.ts";
import type { ExpectedChildObservation } from "../context-engine/assembly-basis.ts";
import type { SourceRecord } from "../context-engine/assembly-messages.ts";
import type { ActiveRunBinding, SessionAnchor, SessionCreationIntent } from "./session-manager-contract.ts";

/** 本地持久 Session 聚合；历史版本和占槽代次独立推进。 */
export interface DurableSession {
	/** 已确认历史锚点，初始版本为零。 */ readonly anchor: SessionAnchor;
	/** 不可变创建配置。 */ readonly intent: SessionCreationIntent;
	/** Session 本地事务修订号。 */ readonly revision: number;
	/** 最后一次占槽代次，释放后保留。 */ readonly bindingVersion: number;
	/** 仅保存当前绑定，不保存 Run 集合。 */ readonly active: ActiveRunBinding | null;
	/** 耐久受理 outbox；确认后清空，UNKNOWN 时保留原输入。 */ readonly admission: {
		/** 原始冻结输入。 */ readonly input: AdvanceInput;
		/** 子 Run 的原父条件；根为 null。 */ readonly parent: AdvanceInput | null;
	} | null;
	/** 已采纳完整历史记录。 */ readonly records: readonly SourceRecord[];
	/** 已采纳的子任务观察约束。 */ readonly observations: readonly ExpectedChildObservation[];
}

/** 单租户同步持久端口；事务内只允许本端口操作，不调用 Run 或模型。 */
export interface SessionPersistence {
	/** 原子执行本地读改写，异常回滚。 */ transaction<T>(operation: () => T): T;
	/** 只读当前聚合；缺失返回 null。 */ get(sessionId: string): DurableSession | null;
	/** 只读 Root 逻辑键；缺失返回 null。 */ lookup(logicalKey: string): DurableSession | null;
	/** 插入或按 revision CAS 更新，冲突拒绝。 */ save(session: DurableSession, expectedRevision: number | null): void;
	/** 读取原命令结果；同键异摘要必须拒绝。 */ receipt(commandId: string, digest: string): string | null;
	/** 在调用方事务内保存不可变回执。 */ record(commandId: string, digest: string, result: string): void;
	/** 有界列举尚未释放的绑定，供宿主恢复。 */ pending(): readonly DurableSession[];
}
