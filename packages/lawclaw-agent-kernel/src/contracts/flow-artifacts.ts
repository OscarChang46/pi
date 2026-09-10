import type { ArtifactRef } from "./flow-engine.ts";

/** 作用域绑定的不可变内容存储；读取必须核对内容摘要及长度。 */
export interface FlowArtifactStore {
	/** 写入JSON正文，返回内容寻址引用。 */
	put(value: unknown): ArtifactRef;
	/** 验证引用后读取独立JSON对象。 */
	get(ref: ArtifactRef): unknown;
}
