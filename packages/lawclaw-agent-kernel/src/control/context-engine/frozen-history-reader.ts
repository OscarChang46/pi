import { checkContextCancellation, requireContext } from "../../contracts/control/context-engine/context-error.ts";
import { validateSourceResult } from "../../contracts/control/context-engine/context-schema.ts";
import type { FrozenHistorySource } from "../../contracts/control/context-engine/runtime-preparation.ts";
import type {
	SourceReader,
	SourceReadRequest,
	SourceReadResult,
} from "../../contracts/control/context-engine/source-reader.ts";
import { canonicalize, freezeDecision } from "../../contracts/flow-value.ts";

/** 每次准备独占的不可变历史读取器，不提供创建、锁或失败重试。 */
export class FrozenHistoryReader implements SourceReader {
	readonly #sources: readonly FrozenHistorySource[];
	/** 宿主先完成受限读取；构造时复制快照，避免组装等待期间被改写。 */
	constructor(sources: readonly FrozenHistorySource[]) {
		for (const source of sources) {
			validateSourceResult(source.result);
			requireContext(source.binding.kind !== "session" || source.binding.recordRefs === null, "BINDING_MISMATCH");
		}
		this.#sources = freezeDecision(structuredClone(sources));
	}
	/** 只交付精确绑定的完整批次；未知来源、缺记录和容量超限均失败。 */
	async read(request: SourceReadRequest, signal: AbortSignal): Promise<SourceReadResult> {
		checkContextCancellation(signal);
		const binding = request.binding;
		requireContext(binding.kind === "session" || binding.kind === "run", "BINDING_MISMATCH");
		const matches = this.#sources.filter((source) => {
			if (binding.kind === "session" && source.binding.kind === "session")
				return canonicalize(binding.anchor) === canonicalize(source.binding.anchor);
			return (
				binding.kind === "run" &&
				source.binding.kind === "run" &&
				canonicalize(binding) === canonicalize(source.binding)
			);
		});
		requireContext(matches.length === 1, "BINDING_MISMATCH");
		const source = matches[0];
		requireContext(source !== undefined, "BINDING_MISMATCH");
		const selected = binding.kind === "session" ? binding.recordRefs : null;
		if (selected !== null) {
			requireContext(new Set(selected).size === selected.length, "BINDING_MISMATCH");
			requireContext(
				selected.every((ref) => source.result.records.some((record) => record.recordRef === ref)),
				"BINDING_MISMATCH",
			);
		}
		const records = source.result.records
			.filter((record) => selected === null || selected.includes(record.recordRef))
			.map((record) => ({ ...record, orderKey: { ...record.orderKey, sourceOrdinal: request.sourceOrdinal } }));
		const result = {
			records,
			contents: source.result.contents.filter((content) =>
				records.some((record) => record.recordRef === content.recordRef),
			),
		};
		requireContext(
			records.length <= request.limits.maxRecords &&
				Buffer.byteLength(canonicalize(result)) <= request.limits.maxBytes,
			"CONTEXT_LIMIT",
		);
		checkContextCancellation(signal);
		return freezeDecision(structuredClone(result));
	}
}
