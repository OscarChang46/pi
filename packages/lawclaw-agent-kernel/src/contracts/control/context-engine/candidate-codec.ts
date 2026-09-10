import { canonicalize, flowId, freezeDecision } from "../../flow-value.ts";
import type { AssemblyCandidate } from "./assembly-candidate.ts";
import { ContextAssemblyError, requireContext } from "./context-error.ts";
import { validateCandidateShape } from "./context-schema.ts";

/** 已采纳Run固定的内容身份；不携带第二份模型正文。 */
export interface CandidateIdentity {
	/** 冻结AssemblyBasis摘要。 */
	readonly inputDigest: string;
	/** 六字段模型载荷摘要。 */
	readonly payloadDigest: string;
	/** 冻结载荷格式。 */
	readonly formatVersion: string;
	/** 冻结模型映射版本。 */
	readonly modelAdapterVersion: string;
}

/** 完整候选的显式持久化版本，不接受旧模型请求。 */
export interface CandidateArtifact {
	/** 首版完整候选格式。 */
	readonly schemaVersion: "ctx-candidate-1";
	/** 正文、Trace、计量共同保存。 */
	readonly candidate: AssemblyCandidate;
}

/** 保存前与恢复时走同一校验；完整对象摘要由Artifact端负责。 */
export function encodeCandidate(candidate: AssemblyCandidate): CandidateArtifact {
	const artifact: CandidateArtifact = { schemaVersion: "ctx-candidate-1", candidate };
	decodeCandidate(artifact, candidate);
	return freezeDecision(structuredClone(artifact));
}

/** 恢复原候选，不访问来源、不重新选择；调用前须验证Artifact摘要和当前读取资格。 */
export function decodeCandidate(value: unknown, expected: CandidateIdentity): AssemblyCandidate {
	try {
		requireContext(typeof value === "object" && value !== null && !Array.isArray(value));
		requireContext(Reflect.get(value, "schemaVersion") === "ctx-candidate-1", "FORMAT_UNSUPPORTED");
		requireContext(Object.keys(value).length === 2 && Object.hasOwn(value, "candidate"));
		const candidate: unknown = Reflect.get(value, "candidate");
		validateCandidateShape(candidate);
		requireContext(
			candidate.formatVersion === "ctx-input-1" && candidate.modelAdapterVersion === "pi-context-1",
			"FORMAT_UNSUPPORTED",
		);
		for (const key of ["inputDigest", "payloadDigest", "formatVersion", "modelAdapterVersion"] as const)
			requireContext(candidate[key] === expected[key], "BINDING_MISMATCH");
		requireContext(candidate.payloadDigest === flowId("ctx-payload", candidate.payload), "DIGEST_MISMATCH");
		requireContext(candidate.tokenAccounting.formatVersion === candidate.formatVersion, "BINDING_MISMATCH");
		requireContext(candidate.tokenAccounting.estimatorVersion === "pi-estimate-1", "BINDING_MISMATCH");
		validateTrace(candidate);
		validateCalls(candidate);
		return freezeDecision(structuredClone(candidate));
	} catch (error) {
		if (error instanceof ContextAssemblyError) throw error;
		throw new ContextAssemblyError("SCHEMA_INVALID", error);
	}
}

function validateTrace(candidate: AssemblyCandidate): void {
	const { trace, payload } = candidate;
	const records = new Map(trace.records.map((record) => [record.recordRef, record]));
	requireContext(records.size === trace.records.length);
	const locations = new Set<string>();
	for (const record of trace.records) {
		requireContext(record.recordRef === flowId("ctx-rec", record.identity), "BINDING_MISMATCH");
		if (!record.output) continue;
		const { field, index } = record.output;
		requireContext(index < payload[field].length);
		const location = `${field}:${index}`;
		requireContext(!locations.has(location));
		locations.add(location);
	}
	requireContext(locations.size === payload.messages.length + payload.materials.length + payload.memory.length);
	const units = new Map(trace.units.map((unit) => [unit.unitRef, unit]));
	requireContext(units.size === trace.units.length && trace.decisions.length === units.size);
	const decisions = new Map(trace.decisions.map((decision) => [decision.unitRef, decision]));
	requireContext(decisions.size === units.size && [...decisions.keys()].every((key) => units.has(key)));
	const selected = new Set<string>();
	for (const unit of trace.units) {
		requireContext(unit.memberRefs.length > 0 && new Set(unit.memberRefs).size === unit.memberRefs.length);
		requireContext(unit.memberRefs.every((key) => records.has(key)));
		requireContext(unit.unitRef === flowId("ctx-unit", { memberRefs: unit.memberRefs }), "BINDING_MISMATCH");
		if (decisions.get(unit.unitRef)?.decision === "keep") for (const key of unit.memberRefs) selected.add(key);
	}
	for (const record of trace.records) requireContext(selected.has(record.recordRef) === (record.output !== null));
	const predecessors = new Map<string, string[]>();
	for (const edge of trace.dependencies) {
		requireContext(records.has(edge.fromRecordRef) && records.has(edge.toRecordRef));
		requireContext(!selected.has(edge.fromRecordRef) || selected.has(edge.toRecordRef));
		const list = predecessors.get(edge.fromRecordRef) ?? [];
		list.push(edge.toRecordRef);
		predecessors.set(edge.fromRecordRef, list);
	}
	// Kahn遍历避免恶意长链触发递归栈溢出。
	const remaining = new Map([...records.keys()].map((key) => [key, predecessors.get(key)?.length ?? 0]));
	const queue = [...remaining].filter(([, count]) => count === 0).map(([key]) => key);
	const dependents = new Map<string, string[]>();
	for (const [key, refs] of predecessors) {
		for (const ref of refs) {
			const list = dependents.get(ref) ?? [];
			list.push(key);
			dependents.set(ref, list);
		}
	}
	for (let index = 0; index < queue.length; index++) {
		for (const key of dependents.get(queue[index]!) ?? []) {
			const next = remaining.get(key)! - 1;
			remaining.set(key, next);
			if (next === 0) queue.push(key);
		}
	}
	requireContext(queue.length === records.size);
}

function validateCalls(candidate: AssemblyCandidate): void {
	const requests = new Map<string, { index: number; name: string }>();
	const results = new Map<string, { index: number; name: string }>();
	const children = new Map<string, { runId: string; index: number }>();
	const observations = new Set<string>();
	for (const [index, message] of candidate.payload.messages.entries()) {
		if (message.role === "assistant") {
			for (const block of message.content) {
				if (block.type === "tool_call") {
					requireContext(!requests.has(block.toolCallId));
					requests.set(block.toolCallId, { index, name: block.toolName });
				} else if (block.type === "child_task") {
					requireContext(!children.has(block.childId));
					children.set(block.childId, { runId: block.childRunId, index });
				}
			}
		} else if (message.role === "tool") {
			requireContext(!results.has(message.toolCallId));
			results.set(message.toolCallId, { index, name: message.toolName });
		} else if (message.role === "task_observation") {
			const child = children.get(message.childId);
			requireContext(child && child.runId === message.childRunId && child.index < index);
			requireContext(!observations.has(message.childId));
			requireContext(
				message.outcome === "SUCCEEDED"
					? message.resultRef !== null && message.errorRef === null
					: message.resultRef === null && message.errorRef !== null,
			);
			observations.add(message.childId);
		}
	}
	requireContext(requests.size === results.size && children.size === observations.size);
	requireContext(candidate.trace.toolCalls.length === requests.size);
	const identities = new Set<string>();
	const mapped = new Set<string>();
	for (const mapping of candidate.trace.toolCalls) {
		const request = requests.get(mapping.frameCallId);
		const result = results.get(mapping.frameCallId);
		requireContext(request && result && request.index < result.index && request.name === result.name);
		const identity = canonicalize(mapping.identity);
		requireContext(!identities.has(identity) && !mapped.has(mapping.frameCallId));
		identities.add(identity);
		mapped.add(mapping.frameCallId);
		for (const [recordRef, index] of [
			[mapping.requestRecordRef, request.index],
			[mapping.resultRecordRef, result.index],
		] as const) {
			const record = candidate.trace.records.find((record) => record.recordRef === recordRef);
			requireContext(record?.output?.field === "messages" && record.output.index === index);
		}
	}
	requireContext(new Set(candidate.payload.tools.map((tool) => tool.name)).size === candidate.payload.tools.length);
}
