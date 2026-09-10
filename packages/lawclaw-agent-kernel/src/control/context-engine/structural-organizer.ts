import type {
	AssemblyBasis,
	CausalUnit,
	DependencyEdge,
	HistorySelectionRecord,
	ResolvedSourceContent,
	SourceRecord,
	ToolCallIdentity,
} from "../../contracts/control/context-engine/assembly-contract.ts";
import { requireContext } from "../../contracts/control/context-engine/context-error.ts";
import { canonicalize, flowId, freezeDecision } from "../../contracts/flow-value.ts";
import type { CollectedSources } from "./source-collector.ts";

/** 配对完成后不允许缺少任一端点。 */
export interface ResolvedToolCall {
	/** 原始事实身份，不能改成当前Run身份 */
	readonly identity: ToolCallIdentity;
	/** 协议字段requestRecordRef，取值与空值语义遵循CTX-CON-1。 */
	readonly requestRecordRef: string;
	/** 协议字段resultRecordRef，取值与空值语义遵循CTX-CON-1。 */
	readonly resultRecordRef: string;
}
/** 结构结果不含预算选择，也不暴露可变索引。 */
export interface OrganizedContext {
	/** 规范来源记录集合 */
	readonly records: readonly SourceRecord[];
	/** 非消息记录的已解析正文 */
	readonly contents: readonly ResolvedSourceContent[];
	/** 完整不可拆因果单元 */
	readonly units: readonly CausalUnit[];
	/** 依赖方到前驱的完整关系 */
	readonly dependencies: readonly DependencyEdge[];
	/** 仅Session和Run规范历史 */
	readonly historyRecords: readonly HistorySelectionRecord[];
	/** 原调用与最终消息的映射 */
	readonly toolCalls: readonly ResolvedToolCall[];
}
function compareRecords(left: SourceRecord, right: SourceRecord): number {
	const a = left.orderKey,
		b = right.orderKey;
	return (
		a.sourceOrdinal - b.sourceOrdinal ||
		a.sequence - b.sequence ||
		a.recordOrdinal - b.recordOrdinal ||
		(left.recordRef < right.recordRef ? -1 : left.recordRef > right.recordRef ? 1 : 0)
	);
}
function uniqueRecords(sources: CollectedSources): { records: SourceRecord[]; contents: ResolvedSourceContent[] } {
	const records = new Map<string, SourceRecord>();
	const contents = new Map<string, ResolvedSourceContent>();
	for (const batch of sources.batches)
		for (const item of batch.result.records) {
			requireContext(item.recordRef === flowId("ctx-rec", item.identity), "BINDING_MISMATCH");
			const previous = records.get(item.recordRef);
			const content = batch.result.contents.find((value) => value.recordRef === item.recordRef);
			if (previous) {
				requireContext(canonicalize(previous.identity) === canonicalize(item.identity), "BINDING_MISMATCH");
				requireContext(canonicalize(previous.message) === canonicalize(item.message), "DIGEST_MISMATCH");
				requireContext(
					canonicalize(previous.callBindings) === canonicalize(item.callBindings) &&
						canonicalize(previous.dependencies) === canonicalize(item.dependencies),
					"BINDING_MISMATCH",
				);
				if (content)
					requireContext(
						canonicalize(contents.get(item.recordRef)?.value) === canonicalize(content.value),
						"DIGEST_MISMATCH",
					);
				if (compareRecords(previous, item) <= 0) continue;
			}
			records.set(item.recordRef, item);
			if (content) contents.set(item.recordRef, content);
		}
	return { records: [...records.values()].sort(compareRecords), contents: [...contents.values()] };
}
function pairTools(records: readonly SourceRecord[]): ResolvedToolCall[] {
	const requests = new Map<string, { record: SourceRecord; identity: ToolCallIdentity; toolName: string }>();
	const results = new Map<string, SourceRecord>();
	for (const record of records) {
		const message = record.message;
		const expectedBindings =
			message?.role === "assistant"
				? message.content.filter((block) => block.type === "tool_call").length
				: message?.role === "tool"
					? 1
					: 0;
		requireContext(record.callBindings.length === expectedBindings, "BINDING_MISMATCH");
		const ordinals = new Set<number>();
		for (const binding of record.callBindings) {
			requireContext(
				record.identity.kind === "run_event" &&
					record.identity.originAgentRunId === binding.identity.originAgentRunId,
				"BINDING_MISMATCH",
			);
			const key = canonicalize(binding.identity);
			if (binding.side === "request") {
				requireContext(message?.role === "assistant" && binding.blockOrdinal !== null);
				const block = message.content[binding.blockOrdinal];
				requireContext(
					block?.type === "tool_call" &&
						block.toolCallId === binding.identity.callId &&
						!ordinals.has(binding.blockOrdinal),
					"BINDING_MISMATCH",
				);
				requireContext(!requests.has(key), "BINDING_MISMATCH");
				ordinals.add(binding.blockOrdinal);
				requests.set(key, { record, identity: binding.identity, toolName: block.toolName });
			} else {
				requireContext(
					message?.role === "tool" &&
						binding.blockOrdinal === null &&
						message.toolCallId === binding.identity.callId &&
						!results.has(key),
					"BINDING_MISMATCH",
				);
				results.set(key, record);
			}
		}
	}
	requireContext(requests.size === results.size, "BINDING_MISMATCH");
	return [...requests.entries()].map(([key, request]) => {
		const result = results.get(key);
		requireContext(
			result?.message?.role === "tool" && result.message.toolName === request.toolName,
			"BINDING_MISMATCH",
		);
		return {
			identity: request.identity,
			requestRecordRef: request.record.recordRef,
			resultRecordRef: result.recordRef,
		};
	});
}
function childEdges(basis: AssemblyBasis, records: readonly SourceRecord[]): DependencyEdge[] {
	const declarations = new Map<string, string>();
	const observations = new Map<string, SourceRecord>();
	for (const record of records) {
		const message = record.message;
		if (message?.role === "assistant")
			for (const block of message.content)
				if (block.type === "child_task") {
					const key = canonicalize([block.childId, block.childRunId]);
					requireContext(!declarations.has(key), "BINDING_MISMATCH");
					declarations.set(key, record.recordRef);
				}
		if (message?.role === "task_observation") {
			const key = canonicalize([message.childId, message.childRunId]);
			requireContext(
				!observations.has(key) &&
					(message.outcome === "SUCCEEDED"
						? message.resultRef !== null && message.errorRef === null
						: message.errorRef !== null && message.resultRef === null),
				"BINDING_MISMATCH",
			);
			observations.set(key, record);
		}
	}
	requireContext(
		observations.size === basis.expectedChildObservations.length && declarations.size === observations.size,
		"BINDING_MISMATCH",
	);
	return basis.expectedChildObservations.map((expected) => {
		const key = canonicalize([expected.childId, expected.childRunId]);
		const observation = observations.get(key);
		const declaration = declarations.get(key);
		requireContext(
			observation &&
				declaration &&
				observation.recordRef === expected.recordRef &&
				observation.message?.role === "task_observation" &&
				observation.message.outcome === expected.outcome,
			"BINDING_MISMATCH",
		);
		return { fromRecordRef: observation.recordRef, toRecordRef: declaration, kind: "requires" };
	});
}

/** 去重、工具及Child完整性检查先于任何选择，失败不修造事实。 */
export function organizeContext(basis: AssemblyBasis, sources: CollectedSources): OrganizedContext {
	const { records, contents } = uniqueRecords(sources);
	const tools = pairTools(records);
	const generated: DependencyEdge[] = tools.map((call) => ({
		fromRecordRef: call.resultRecordRef,
		toRecordRef: call.requestRecordRef,
		kind: "tool_result_of",
	}));
	generated.push(...childEdges(basis, records));
	const edges = new Map<string, DependencyEdge>();
	for (const record of records)
		for (const edge of record.dependencies) {
			requireContext(edge.fromRecordRef === record.recordRef);
			if (edge.kind === "tool_result_of")
				requireContext(
					generated.some((item) => canonicalize(item) === canonicalize(edge)),
					"BINDING_MISMATCH",
				);
			edges.set(canonicalize(edge), edge);
		}
	for (const edge of generated) edges.set(canonicalize(edge), edge);
	const dependencies = [...edges.values()];
	requireContext(dependencies.length <= basis.limits.maxEdges, "CONTEXT_LIMIT");
	const byRef = new Map(records.map((record) => [record.recordRef, record]));
	for (const edge of dependencies)
		requireContext(
			edge.fromRecordRef !== edge.toRecordRef && byRef.has(edge.fromRecordRef) && byRef.has(edge.toRecordRef),
		);
	for (const edge of dependencies) {
		const from = byRef.get(edge.fromRecordRef)!;
		const to = byRef.get(edge.toRecordRef)!;
		if (from.message && to.message && from.orderKey.sourceOrdinal === to.orderKey.sourceOrdinal)
			requireContext(
				from.orderKey.sequence > to.orderKey.sequence ||
					(from.orderKey.sequence === to.orderKey.sequence &&
						from.orderKey.recordOrdinal > to.orderKey.recordOrdinal),
				"SCHEMA_INVALID",
			);
	}
	const predecessors = new Map(records.map((record) => [record.recordRef, new Set<string>()]));
	const successors = new Map(records.map((record) => [record.recordRef, new Set<string>()]));
	for (const edge of dependencies) {
		predecessors.get(edge.fromRecordRef)!.add(edge.toRecordRef);
		successors.get(edge.toRecordRef)!.add(edge.fromRecordRef);
	}
	const orderRecords = new Map(records.map((record) => [record.recordRef, record]));
	for (const edge of generated) {
		const declaration = byRef.get(edge.toRecordRef)!;
		const result = byRef.get(edge.fromRecordRef)!;
		const message = declaration.message;
		requireContext(message?.role === "assistant");
		const ordinal = message.content.findIndex((block) =>
			result.message?.role === "tool"
				? block.type === "tool_call" && block.toolCallId === result.message.toolCallId
				: result.message?.role === "task_observation" &&
					block.type === "child_task" &&
					block.childId === result.message.childId &&
					block.childRunId === result.message.childRunId,
		);
		requireContext(ordinal >= 0);
		orderRecords.set(result.recordRef, {
			...result,
			orderKey: { ...declaration.orderKey, recordOrdinal: declaration.orderKey.recordOrdinal + ordinal + 1 },
		});
	}
	const pending = new Map([...predecessors].map(([id, refs]) => [id, refs.size]));
	const ready = records.filter((record) => pending.get(record.recordRef) === 0);
	const ordered: SourceRecord[] = [];
	while (ready.length) {
		ready.sort((left, right) =>
			compareRecords(orderRecords.get(left.recordRef)!, orderRecords.get(right.recordRef)!),
		);
		const next = ready.shift()!;
		ordered.push(next);
		for (const successor of successors.get(next.recordRef)!) {
			const count = pending.get(successor)! - 1;
			pending.set(successor, count);
			if (count === 0) ready.push(byRef.get(successor)!);
		}
	}
	requireContext(ordered.length === records.length);
	// 原子轮次由声明和所有已确认结果构成；资料依赖仍由选择闭包处理。
	const groups = records.map((record) => new Set([record.recordRef]));
	for (const edge of dependencies) {
		const from = byRef.get(edge.fromRecordRef)!,
			to = byRef.get(edge.toRecordRef)!;
		if (!from.message || !to.message) continue;
		const left = groups.find((group) => group.has(edge.fromRecordRef))!,
			right = groups.find((group) => group.has(edge.toRecordRef))!;
		if (left !== right) {
			for (const id of right) left.add(id);
			groups.splice(groups.indexOf(right), 1);
		}
	}
	const units = groups.map((group) => {
		const memberRefs = ordered.filter((record) => group.has(record.recordRef)).map((record) => record.recordRef);
		return { unitRef: flowId("ctx-unit", { memberRefs }), memberRefs };
	});
	const historyRecords: HistorySelectionRecord[] = ordered.flatMap((record) =>
		record.message ? [{ recordRef: record.recordRef, message: record.message }] : [],
	);
	return freezeDecision({ records: ordered, contents, units, dependencies, historyRecords, toolCalls: tools });
}
