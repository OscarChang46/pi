import type { ArtifactRef, Ref } from "../../flow-engine.ts";
import type { JsonValue } from "../../types.ts";

/** 规范消息块；未知变体必须拒绝。 */
export type ContextBlock =
	| {
			/** 当前块的封闭变体 */ readonly type: "text";
			/** 允许交付的完整正文，不能用空值掩盖读取失败 */
			readonly text: string;
	  }
	| {
			/** 当前块的封闭变体 */
			readonly type: "tool_call";
			/** 协议字段toolCallId，取值与空值语义遵循CTX-CON-1。 */
			readonly toolCallId: Ref;
			/** 协议字段toolName，取值与空值语义遵循CTX-CON-1。 */
			readonly toolName: Ref;
			/** 协议字段arguments，取值与空值语义遵循CTX-CON-1。 */
			readonly arguments: Readonly<Record<string, JsonValue>>;
	  }
	| {
			/** 当前块的封闭变体 */ readonly type: "child_task";
			/** 协议字段childId，取值与空值语义遵循CTX-CON-1。 */
			readonly childId: Ref;
			/** 协议字段childRunId，取值与空值语义遵循CTX-CON-1。 */
			readonly childRunId: Ref;
			/** 协议字段task，取值与空值语义遵循CTX-CON-1。 */
			readonly task: string;
	  };

/** 只包含已确认事实的模型上下文消息。 */
export type ContextMessage =
	| {
			/** 规范消息的封闭角色 */ readonly role: "user";
			/** 允许交付的完整正文，不能用空值掩盖读取失败 */
			readonly text: string;
	  }
	| {
			/** 规范消息的封闭角色 */
			readonly role: "assistant";
			/** 协议字段content，取值与空值语义遵循CTX-CON-1。 */
			readonly content: readonly ContextBlock[];
			/** 协议字段stopReason，取值与空值语义遵循CTX-CON-1。 */
			readonly stopReason: "stop" | "tool_use" | "length" | "error" | "aborted";
	  }
	| {
			/** 规范消息的封闭角色 */
			readonly role: "tool";
			/** 协议字段toolCallId，取值与空值语义遵循CTX-CON-1。 */
			readonly toolCallId: Ref;
			/** 协议字段toolName，取值与空值语义遵循CTX-CON-1。 */
			readonly toolName: Ref;
			/** 允许交付的完整正文，不能用空值掩盖读取失败 */
			readonly text: string;
			/** 协议字段isError，取值与空值语义遵循CTX-CON-1。 */
			readonly isError: boolean;
	  }
	| {
			/** 规范消息的封闭角色 */
			readonly role: "task_observation";
			/** 协议字段childId，取值与空值语义遵循CTX-CON-1。 */
			readonly childId: Ref;
			/** 协议字段childRunId，取值与空值语义遵循CTX-CON-1。 */
			readonly childRunId: Ref;
			/** 已确认终态，只允许成功或失败 */
			readonly outcome: "SUCCEEDED" | "FAILED";
			/** 协议字段resultRef，取值与空值语义遵循CTX-CON-1。 */
			readonly resultRef: ArtifactRef | null;
			/** 协议字段errorRef，取值与空值语义遵循CTX-CON-1。 */
			readonly errorRef: Ref | null;
			/** 允许交付的完整正文，不能用空值掩盖读取失败 */
			readonly text: string;
	  };

/** 来源事实身份，读取路径不参与身份。 */
export type SourceIdentity =
	| {
			/** 当前数据的封闭变体 */
			readonly kind: "run_event";
			/** 原始AgentRun身份 */
			readonly originAgentRunId: Ref;
			/** 协议字段originEventRef，取值与空值语义遵循CTX-CON-1。 */
			readonly originEventRef: Ref;
			/** 协议字段recordIndex，取值与空值语义遵循CTX-CON-1。 */
			readonly recordIndex: number;
	  }
	| {
			/** 当前数据的封闭变体 */ readonly kind: "artifact";
			/** 协议字段sourceRef，取值与空值语义遵循CTX-CON-1。 */
			readonly sourceRef: Ref;
			/** 协议字段sourceVersion，取值与空值语义遵循CTX-CON-1。 */
			readonly sourceVersion: number;
			/** 协议字段fragmentRef，取值与空值语义遵循CTX-CON-1。 */
			readonly fragmentRef: Ref;
	  }
	| {
			/** 当前数据的封闭变体 */ readonly kind: "memory";
			/** 协议字段spaceId，取值与空值语义遵循CTX-CON-1。 */
			readonly spaceId: Ref;
			/** 协议字段entryId，取值与空值语义遵循CTX-CON-1。 */
			readonly entryId: Ref;
			/** 协议字段entryVersion，取值与空值语义遵循CTX-CON-1。 */
			readonly entryVersion: number;
	  };

/** 跨Run工具调用的完整身份。 */
export interface ToolCallIdentity {
	/** 原始AgentRun身份 */
	readonly originAgentRunId: Ref;
	/** 原始模型命令身份 */
	readonly modelCommandId: Ref;
	/** 原模型命令内的调用标识 */
	readonly callId: Ref;
}

/** 原始来源中的稳定排序键。 */
export interface SourceOrderKey {
	/** 冻结来源序号，不使用返回顺序 */
	readonly sourceOrdinal: number;
	/** 来源内原始提交序号 */
	readonly sequence: number;
	/** 同序号内的稳定位置 */
	readonly recordOrdinal: number;
}

/** 依赖方向始终为依赖方到前驱。 */
export interface DependencyEdge {
	/** 依赖方记录引用 */
	readonly fromRecordRef: Ref;
	/** 被依赖前驱记录引用 */
	readonly toRecordRef: Ref;
	/** 当前数据的封闭变体 */
	readonly kind: "tool_result_of" | "requires";
}

/** 请求块或结果的权威调用关联。 */
export interface ToolCallBinding {
	/** 原始事实身份，不能改成当前Run身份 */
	readonly identity: ToolCallIdentity;
	/** 调用绑定的请求或结果侧 */
	readonly side: "request" | "result";
	/** 请求工具块下标，结果固定null */
	readonly blockOrdinal: number | null;
}

/** 规范记录，非消息正文位于同批contents。 */
export interface SourceRecord {
	/** 原始规范记录的稳定引用 */
	readonly recordRef: Ref;
	/** 原始事实身份，不能改成当前Run身份 */
	readonly identity: SourceIdentity;
	/** 正文Artifact引用，引用本身不授予读取资格 */
	readonly contentRef: ArtifactRef;
	/** 规范消息；资料和Memory显式为null */
	readonly message: ContextMessage | null;
	/** 协议字段orderKey，取值与空值语义遵循CTX-CON-1。 */
	readonly orderKey: SourceOrderKey;
	/** 协议字段callBindings，取值与空值语义遵循CTX-CON-1。 */
	readonly callBindings: readonly ToolCallBinding[];
	/** 依赖方到前驱的完整关系 */
	readonly dependencies: readonly DependencyEdge[];
}

/** 已解析资料投影。 */
export interface MaterialProjection {
	/** 协议字段sourceRef，取值与空值语义遵循CTX-CON-1。 */
	readonly sourceRef: Ref;
	/** 实现或来源的冻结版本 */
	readonly version: number;
	/** 正文Artifact引用，引用本身不授予读取资格 */
	readonly contentRef: ArtifactRef;
	/** 允许交付的完整正文，不能用空值掩盖读取失败 */
	readonly text: string;
}

/** 已解析Memory条目投影。 */
export interface MemoryProjection {
	/** 协议字段spaceId，取值与空值语义遵循CTX-CON-1。 */
	readonly spaceId: Ref;
	/** 协议字段spaceVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly spaceVersion: number;
	/** 协议字段entryId，取值与空值语义遵循CTX-CON-1。 */
	readonly entryId: Ref;
	/** 协议字段entryVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly entryVersion: number;
	/** 正文Artifact引用，引用本身不授予读取资格 */
	readonly contentRef: ArtifactRef;
	/** 允许交付的完整正文，不能用空值掩盖读取失败 */
	readonly text: string;
}

/** 普通记录的完整正文；排名只属于视图。 */
export type ResolvedSourceContent =
	| {
			/** 当前数据的封闭变体 */ readonly kind: "material";
			/** 原始规范记录的稳定引用 */
			readonly recordRef: Ref;
			/** 协议字段value，取值与空值语义遵循CTX-CON-1。 */
			readonly value: MaterialProjection;
	  }
	| {
			/** 当前数据的封闭变体 */ readonly kind: "memory";
			/** 原始规范记录的稳定引用 */
			readonly recordRef: Ref;
			/** 协议字段value，取值与空值语义遵循CTX-CON-1。 */
			readonly value: MemoryProjection;
			/** 协议字段scoreRank，取值与空值语义遵循CTX-CON-1。 */
			readonly scoreRank: number;
	  };

/** 不可拆的因果单元。 */
export interface CausalUnit {
	/** 完整因果单元的稳定引用 */
	readonly unitRef: Ref;
	/** 单元成员记录引用，非空且唯一 */
	readonly memberRefs: readonly Ref[];
}
