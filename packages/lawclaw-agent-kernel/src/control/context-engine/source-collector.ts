import type {
	AssemblyBasis,
	ContextArtifactReader,
	SourceReader,
	SourceReadRequest,
	SourceReadResult,
} from "../../contracts/control/context-engine/assembly-contract.ts";
import {
	ContextAssemblyError,
	checkContextCancellation,
	requireContext,
} from "../../contracts/control/context-engine/context-error.ts";
import {
	decodeContextText,
	decodeContextTools,
	validateSourceResult,
} from "../../contracts/control/context-engine/context-schema.ts";
import { canonicalize, freezeDecision } from "../../contracts/flow-value.ts";
import type { ToolDescriptor } from "../../contracts/types.ts";

/** 完整来源包只在本次请求期间存在。 */
export interface CollectedSources {
	/** 协议字段fixedInput，取值与空值语义遵循CTX-CON-1。 */
	readonly fixedInput: {
		/** 协议字段system，取值与空值语义遵循CTX-CON-1。 */
		readonly system: string;
		/** 协议字段task，取值与空值语义遵循CTX-CON-1。 */
		readonly task: string;
		/** 协议字段tools，取值与空值语义遵循CTX-CON-1。 */
		readonly tools: readonly ToolDescriptor[];
	};
	/** 协议字段batches，取值与空值语义遵循CTX-CON-1。 */
	readonly batches: readonly {
		/** 协议字段request，取值与空值语义遵循CTX-CON-1。 */
		readonly request: SourceReadRequest;
		/** 协议字段result，取值与空值语义遵循CTX-CON-1。 */
		readonly result: SourceReadResult;
	}[];
	/** 协议字段degradedSources，取值与空值语义遵循CTX-CON-1。 */
	readonly degradedSources: readonly string[];
}

/** 从冻结输入派生有限来源，父、自身、当前Run、Memory、资料依次读取。 */
export function sourceRequests(basis: AssemblyBasis): readonly SourceReadRequest[] {
	const bindings: SourceReadRequest["binding"][] = [];
	if (basis.parentContext)
		bindings.push({
			kind: "session",
			anchor: basis.parentContext.parent,
			recordRefs: basis.parentContext.candidateRefs,
		});
	if (basis.sessionInput.kind === "existing")
		bindings.push({ kind: "session", anchor: basis.sessionInput.anchor, recordRefs: null });
	if (basis.runInput.kind === "existing")
		bindings.push({
			kind: "run",
			runId: basis.runInput.runId,
			version: basis.runInput.sourceRunVersion,
			headRef: basis.runInput.transcriptHeadRef,
		});
	for (const input of basis.memory) bindings.push({ kind: "memory", input });
	for (const input of basis.materials) bindings.push({ kind: "material", input });
	requireContext(bindings.length + 3 <= basis.limits.maxSources, "CONTEXT_LIMIT");
	return bindings.map((binding, sourceOrdinal) => ({
		binding,
		sourceOrdinal,
		limits: { maxRecords: basis.limits.maxRecords, maxBytes: basis.limits.maxWorkingBytes },
	}));
}

/** 串行读取且无内部重试；读失败不交出半批结果。 */
export async function collectSources(
	basis: AssemblyBasis,
	reader: SourceReader,
	artifacts: ContextArtifactReader,
	signal: AbortSignal,
): Promise<CollectedSources> {
	const requests = sourceRequests(basis);
	let workingBytes = 0;
	let recordCount = 0;
	let edgeCount = 0;
	const account = (value: unknown) => {
		workingBytes += Buffer.byteLength(canonicalize(value));
		requireContext(workingBytes <= basis.limits.maxWorkingBytes, "CONTEXT_LIMIT");
	};
	const readFixed = async (ref: AssemblyBasis["systemRef"]) => {
		checkContextCancellation(signal);
		requireContext(ref.bytes <= basis.limits.maxWorkingBytes - workingBytes, "CONTEXT_LIMIT");
		const value = await artifacts.read(ref, signal);
		checkContextCancellation(signal);
		account(value);
		return value;
	};
	const system = decodeContextText(await readFixed(basis.systemRef));
	const task = decodeContextText(await readFixed(basis.taskRef));
	const tools = decodeContextTools(await readFixed(basis.toolsRef));
	const batches: CollectedSources["batches"][number][] = [];
	const degradedSources: string[] = [];
	for (const initialRequest of requests) {
		const request = {
			...initialRequest,
			limits: {
				maxRecords: basis.limits.maxRecords - recordCount,
				maxBytes: basis.limits.maxWorkingBytes - workingBytes,
			},
		};
		checkContextCancellation(signal);
		let result: SourceReadResult;
		try {
			result = await reader.read(request, signal);
		} catch (error) {
			checkContextCancellation(signal);
			const optional =
				request.binding.kind === "memory"
					? !request.binding.input.source.required
					: request.binding.kind === "material" && request.binding.input.requirement === null;
			if (
				!(
					optional &&
					error instanceof ContextAssemblyError &&
					["DEPENDENCY_UNAVAILABLE", "TRANSPORT_UNAVAILABLE"].includes(error.code)
				)
			)
				throw error;
			degradedSources.push(
				request.binding.kind === "memory"
					? request.binding.input.viewRef.id
					: request.binding.kind === "material"
						? request.binding.input.sourceRef
						: "",
			);
			continue;
		}
		checkContextCancellation(signal);
		validateSourceResult(result);
		account(result);
		recordCount += result.records.length;
		edgeCount += result.records.reduce((sum, item) => sum + item.dependencies.length, 0);
		requireContext(recordCount <= basis.limits.maxRecords && edgeCount <= basis.limits.maxEdges, "CONTEXT_LIMIT");
		requireContext(new Set(result.records.map((item) => item.recordRef)).size === result.records.length);
		requireContext(new Set(result.contents.map((item) => item.recordRef)).size === result.contents.length);
		if (request.binding.kind === "session" && request.binding.recordRefs !== null)
			requireContext(result.records.length === request.binding.recordRefs.length, "BINDING_MISMATCH");
		for (const record of result.records) {
			requireContext(record.orderKey.sourceOrdinal === request.sourceOrdinal, "BINDING_MISMATCH");
			requireContext(
				result.contents.filter((item) => item.recordRef === record.recordRef).length ===
					(record.message === null ? 1 : 0),
			);
			if (request.binding.kind === "session" && request.binding.recordRefs !== null)
				requireContext(request.binding.recordRefs.includes(record.recordRef), "BINDING_MISMATCH");
			if (request.binding.kind === "run")
				requireContext(
					record.identity.kind === "run_event" && record.identity.originAgentRunId === request.binding.runId,
					"BINDING_MISMATCH",
				);
			if (request.binding.kind === "session" || request.binding.kind === "run")
				requireContext(record.message !== null && record.identity.kind === "run_event");
			const content = result.contents.find((item) => item.recordRef === record.recordRef);
			if (content)
				requireContext(
					canonicalize(content.value.contentRef) === canonicalize(record.contentRef),
					"BINDING_MISMATCH",
				);
			if (request.binding.kind === "material")
				requireContext(
					content?.kind === "material" &&
						record.identity.kind === "artifact" &&
						content.value.sourceRef === request.binding.input.sourceRef &&
						record.identity.sourceRef === content.value.sourceRef &&
						record.identity.sourceVersion === content.value.version &&
						content.value.version === request.binding.input.version &&
						canonicalize(record.contentRef) === canonicalize(request.binding.input.contentRef),
					"BINDING_MISMATCH",
				);
			if (request.binding.kind === "memory")
				requireContext(
					content?.kind === "memory" &&
						record.identity.kind === "memory" &&
						content.value.spaceId === request.binding.input.source.spaceId &&
						content.value.spaceVersion === request.binding.input.source.spaceVersion &&
						record.identity.spaceId === content.value.spaceId &&
						record.identity.entryId === content.value.entryId &&
						record.identity.entryVersion === content.value.entryVersion,
					"BINDING_MISMATCH",
				);
		}
		requireContext(
			result.contents.every((item) => result.records.some((record) => record.recordRef === item.recordRef)),
		);
		batches.push({ request, result: freezeDecision(structuredClone(result)) });
	}
	return freezeDecision(structuredClone({ fixedInput: { system, task, tools }, batches, degradedSources }));
}
