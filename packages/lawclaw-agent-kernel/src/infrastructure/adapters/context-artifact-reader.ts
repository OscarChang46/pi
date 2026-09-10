import type { ContextArtifactReader } from "../../contracts/control/context-engine/assembly-contract.ts";
import {
	ContextAssemblyError,
	checkContextCancellation,
} from "../../contracts/control/context-engine/context-error.ts";
import type { FlowArtifactStore } from "../../contracts/flow-artifacts.ts";
import type { ArtifactRef } from "../../contracts/flow-engine.ts";

/** 已绑定存储作用域及当前读取资格的只读能力；不向组装器暴露put。 */
export class ScopedContextArtifactReader implements ContextArtifactReader {
	readonly #store: FlowArtifactStore;
	readonly #authorize: (ref: ArtifactRef, signal: AbortSignal) => Promise<void>;
	/** 授权器由可信组合根提供，校验失败必须抛出稳定安全错误。 */
	constructor(store: FlowArtifactStore, authorize: (ref: ArtifactRef, signal: AbortSignal) => Promise<void>) {
		this.#store = store;
		this.#authorize = authorize;
	}
	/** 读取前和交付前复核当前资格，Artifact存储验证原始字节摘要。 */
	async read(ref: ArtifactRef, signal: AbortSignal): Promise<unknown> {
		checkContextCancellation(signal);
		await this.#authorize(ref, signal);
		checkContextCancellation(signal);
		let value: unknown;
		try {
			value = this.#store.get(ref);
		} catch (error) {
			if (error instanceof Error && error.message === "FLOW_ARTIFACT_NOT_FOUND")
				throw new ContextAssemblyError("NOT_FOUND", error);
			if (error instanceof Error && error.message === "FLOW_ARTIFACT_CORRUPT")
				throw new ContextAssemblyError("DIGEST_MISMATCH", error);
			throw error;
		}
		await this.#authorize(ref, signal);
		checkContextCancellation(signal);
		return value;
	}
}
