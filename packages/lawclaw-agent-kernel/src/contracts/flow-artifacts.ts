import type { ArtifactRef } from "./flow-engine.ts";

/** 作用域绑定的不可变内容存储；读取必须核对内容摘要及长度。 */
export interface FlowArtifactStore {
	/** 写入JSON正文，返回内容寻址引用。 */
	put(value: unknown): ArtifactRef;
	/** 验证引用后读取独立JSON对象。 */
	get(ref: ArtifactRef): unknown;
}

/** Adapter私有消息持久化端口；正文保持不透明，不成为控制层协议。 */
export interface AdapterMessageStore {
	/** 同租户同引用只允许首次写入或相同内容。 */
	put(tenantId: string, ref: string, value: unknown): void;
	/** 返回同租户私有消息；未知引用返回null。 */
	get(tenantId: string, ref: string): unknown;
}
