import { createHash } from "node:crypto";
import type { FlowArtifactStore } from "../../contracts/flow-artifacts.ts";
import type { ArtifactRef } from "../../contracts/flow-engine.ts";

/** 单个内存运行宿主的不可变正文存储，生命周期由宿主控制。 */
export class InMemoryContextArtifacts implements FlowArtifactStore {
	readonly #bodies = new Map<string, string>();
	/** 保存独立 JSON 正文，限制单个对象为 4 MiB。 */
	put(value: unknown): ArtifactRef {
		const body = JSON.stringify(value);
		if (body === undefined || Buffer.byteLength(body) > 4194304) throw new Error("FLOW_ARTIFACT_LIMIT");
		const hash = createHash("sha256").update(body).digest("hex");
		const ref = { id: `art:${hash}`, digest: `sha256:${hash}`, bytes: Buffer.byteLength(body) };
		this.#bodies.set(ref.id, body);
		return ref;
	}
	/** 校验内容引用后返回独立对象；缺失不能作为空历史。 */
	get(ref: ArtifactRef): unknown {
		const body = this.#bodies.get(ref.id);
		if (body === undefined) throw new Error("FLOW_ARTIFACT_NOT_FOUND");
		const hash = createHash("sha256").update(body).digest("hex");
		if (ref.id !== `art:${hash}` || ref.digest !== `sha256:${hash}` || ref.bytes !== Buffer.byteLength(body))
			throw new Error("FLOW_ARTIFACT_CORRUPT");
		return JSON.parse(body);
	}
}
