import type {
	ContextArtifactReader,
	SourceReader,
	SourceReadRequest,
	SourceReadResult,
} from "../../contracts/control/context-engine/assembly-contract.ts";
import { checkContextCancellation, requireContext } from "../../contracts/control/context-engine/context-error.ts";
import { decodeContextMemory, decodeContextText } from "../../contracts/control/context-engine/context-schema.ts";
import { flowDigest, flowId } from "../../contracts/flow-value.ts";

/** 固定来源注册，不开放任意kind的隐式回退。 */
export class SourceReaderRegistry implements SourceReader {
	readonly #readers: Readonly<Record<SourceReadRequest["binding"]["kind"], SourceReader>>;
	/** 组合根必须提供四种已知来源；类型联合变更时同步装配。 */
	constructor(readers: Readonly<Record<SourceReadRequest["binding"]["kind"], SourceReader>>) {
		this.#readers = Object.freeze({ ...readers });
	}
	/** 只按明确kind分派，不猜测对象字段。 */
	read(request: SourceReadRequest, signal: AbortSignal): Promise<SourceReadResult> {
		requireContext(Object.hasOwn(this.#readers, request.binding.kind));
		return this.#readers[request.binding.kind].read(request, signal);
	}
}

/** 有界资料片段读取，sourceRef同时作为首版稳定fragmentRef。 */
export class ArtifactSourceReader implements SourceReader {
	readonly #artifacts: ContextArtifactReader;
	/** 注入已限制范围及大小的读取能力，不持有写端口。 */
	constructor(artifacts: ContextArtifactReader) {
		this.#artifacts = artifacts;
	}
	/** 一个预切片Artifact转换为一个规范记录，不再次切分。 */
	async read(request: SourceReadRequest, signal: AbortSignal): Promise<SourceReadResult> {
		requireContext(request.binding.kind === "material");
		const input = request.binding.input;
		checkContextCancellation(signal);
		requireContext(
			request.limits.maxRecords >= 1 && input.contentRef.bytes <= request.limits.maxBytes,
			"CONTEXT_LIMIT",
		);
		const text = decodeContextText(await this.#artifacts.read(input.contentRef, signal));
		checkContextCancellation(signal);
		const identity = {
			kind: "artifact" as const,
			sourceRef: input.sourceRef,
			sourceVersion: input.version,
			fragmentRef: input.sourceRef,
		};
		const recordRef = flowId("ctx-rec", identity);
		return {
			records: [
				{
					recordRef,
					identity,
					contentRef: input.contentRef,
					message: null,
					orderKey: { sourceOrdinal: request.sourceOrdinal, sequence: 0, recordOrdinal: 0 },
					callBindings: [],
					dependencies: [],
				},
			],
			contents: [
				{
					kind: "material",
					recordRef,
					value: { sourceRef: input.sourceRef, version: input.version, contentRef: input.contentRef, text },
				},
			],
		};
	}
}

/** 单一冻结MemoryView读取；不搜索、不重新排名、不吞解析错误。 */
export class MemorySourceReader implements SourceReader {
	readonly #artifacts: ContextArtifactReader;
	/** 上层限额约束视图和所有正文，取消必须向读取传播。 */
	constructor(artifacts: ContextArtifactReader) {
		this.#artifacts = artifacts;
	}
	/** 绑定验证完成后按scoreRank与entryId读取正文。 */
	async read(request: SourceReadRequest, signal: AbortSignal): Promise<SourceReadResult> {
		requireContext(request.binding.kind === "memory");
		const { source, viewRef } = request.binding.input;
		checkContextCancellation(signal);
		requireContext(viewRef.bytes + source.queryRef.bytes <= request.limits.maxBytes, "CONTEXT_LIMIT");
		const view = decodeContextMemory(await this.#artifacts.read(viewRef, signal));
		checkContextCancellation(signal);
		requireContext(
			view.spaceId === source.spaceId &&
				view.version === source.spaceVersion &&
				view.epoch === source.epoch &&
				view.indexVersion === source.indexVersion &&
				view.algorithmVersion === source.algorithmVersion,
			"BINDING_MISMATCH",
		);
		const query = await this.#artifacts.read(source.queryRef, signal);
		checkContextCancellation(signal);
		requireContext(view.queryDigest === flowDigest(query), "DIGEST_MISMATCH");
		requireContext(view.rankedEntries.length <= request.limits.maxRecords, "CONTEXT_LIMIT");
		const totalBytes =
			viewRef.bytes +
			source.queryRef.bytes +
			view.rankedEntries.reduce((sum, item) => sum + item.entry.contentRef.bytes, 0);
		requireContext(Number.isSafeInteger(totalBytes) && totalBytes <= request.limits.maxBytes, "CONTEXT_LIMIT");
		const ranked = [...view.rankedEntries].sort(
			(a, b) => a.scoreRank - b.scoreRank || (a.entry.entryId < b.entry.entryId ? -1 : 1),
		);
		const records: SourceReadResult["records"][number][] = [],
			contents: SourceReadResult["contents"][number][] = [];
		for (const [sequence, { entry, scoreRank }] of ranked.entries()) {
			checkContextCancellation(signal);
			const text = decodeContextText(await this.#artifacts.read(entry.contentRef, signal));
			checkContextCancellation(signal);
			const identity = {
				kind: "memory" as const,
				spaceId: source.spaceId,
				entryId: entry.entryId,
				entryVersion: entry.version,
			};
			const recordRef = flowId("ctx-rec", identity);
			records.push({
				recordRef,
				identity,
				contentRef: entry.contentRef,
				message: null,
				orderKey: { sourceOrdinal: request.sourceOrdinal, sequence, recordOrdinal: 0 },
				callBindings: [],
				dependencies: [],
			});
			contents.push({
				kind: "memory",
				recordRef,
				scoreRank,
				value: {
					spaceId: source.spaceId,
					spaceVersion: source.spaceVersion,
					entryId: entry.entryId,
					entryVersion: entry.version,
					contentRef: entry.contentRef,
					text,
				},
			});
		}
		return { records, contents };
	}
}
