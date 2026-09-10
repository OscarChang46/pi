import type { ArtifactRef, Ref } from "../../flow-engine.ts";
import type { MaterialSource, MemoryAssemblySource, SessionAnchor } from "./assembly-basis.ts";
import type { ResolvedSourceContent, SourceRecord } from "./assembly-messages.ts";

/** 只有完整成功批次才能交给结构整理。 */
export interface SourceReadResult {
	/** 规范来源记录集合 */
	readonly records: readonly SourceRecord[];
	/** 非消息记录的已解析正文 */
	readonly contents: readonly ResolvedSourceContent[];
}

/** 受限来源读取的封闭联合。 */
export type SourceReadBinding =
	| {
			/** 当前数据的封闭变体 */ readonly kind: "session";
			/** 协议字段anchor，取值与空值语义遵循CTX-CON-1。 */
			readonly anchor: SessionAnchor;
			/** 协议字段recordRefs，取值与空值语义遵循CTX-CON-1。 */
			readonly recordRefs: readonly Ref[] | null;
	  }
	| {
			/** 当前数据的封闭变体 */ readonly kind: "run";
			/** 协议字段runId，取值与空值语义遵循CTX-CON-1。 */
			readonly runId: Ref;
			/** 实现或来源的冻结版本 */
			readonly version: number;
			/** 协议字段headRef，取值与空值语义遵循CTX-CON-1。 */
			readonly headRef: Ref;
	  }
	| {
			/** 当前数据的封闭变体 */ readonly kind: "memory";
			/** 协议字段input，取值与空值语义遵循CTX-CON-1。 */
			readonly input: MemoryAssemblySource;
	  }
	| {
			/** 当前数据的封闭变体 */ readonly kind: "material";
			/** 协议字段input，取值与空值语义遵循CTX-CON-1。 */
			readonly input: MaterialSource;
	  };

/** 确定来源次序，不取决于异步返回顺序。 */
export interface SourceReadRequest {
	/** 单批读取不得超过调用方收窄的记录及字节上限。 */
	readonly limits: {
		/** 协议字段maxRecords，取值与空值语义遵循CTX-CON-1。 */ readonly maxRecords: number;
		/** 模型映射的字节硬上限 */
		readonly maxBytes: number;
	};
	/** 协议字段binding，取值与空值语义遵循CTX-CON-1。 */
	readonly binding: SourceReadBinding;
	/** 冻结来源序号，不使用返回顺序 */
	readonly sourceOrdinal: number;
}

/** 已绑定可信读取作用域的reader；取消后须结束原调用。 */
export interface SourceReader {
	/** 协议字段read，取值与空值语义遵循CTX-CON-1。 */
	read(request: SourceReadRequest, signal: AbortSignal): Promise<SourceReadResult>;
}

/** 组合根注入已校验权限、版本及内容摘要的Artifact读取能力。 */
export interface ContextArtifactReader {
	/** 协议字段read，取值与空值语义遵循CTX-CON-1。 */
	read(ref: ArtifactRef, signal: AbortSignal): Promise<unknown>;
}
