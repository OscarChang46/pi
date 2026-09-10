import type {
	AssemblyAlgorithmInput,
	AssemblyBasis,
	AssemblyCandidate,
	ContextEstimatorPort,
	ContextMessage,
	ContextPayload,
	PayloadLocation,
	Selection,
	SelectionEstimate,
	ToolCallProjection,
} from "../../contracts/control/context-engine/assembly-contract.ts";
import { requireContext } from "../../contracts/control/context-engine/context-error.ts";
import { canonicalize, flowId, freezeDecision } from "../../contracts/flow-value.ts";
import { selectionClosure, validateSelection, withinSelectionTargets } from "./algorithms/selection-policy.ts";
import type { CollectedSources } from "./source-collector.ts";
import type { OrganizedContext } from "./structural-organizer.ts";

/** 所有估算捕获同一次冻结来源，不读取live配置或外部存储。 */
export interface AssemblyRenderInput {
	/** 协议字段basis，取值与空值语义遵循CTX-CON-1。 */
	readonly basis: AssemblyBasis;
	/** 协议字段sources，取值与空值语义遵循CTX-CON-1。 */
	readonly sources: CollectedSources;
	/** 协议字段organized，取值与空值语义遵循CTX-CON-1。 */
	readonly organized: OrganizedContext;
}

function renderRecords(
	input: AssemblyRenderInput,
	selectedRefs: ReadonlySet<string>,
): { payload: ContextPayload; locations: Map<string, PayloadLocation>; toolCalls: ToolCallProjection[] } {
	const payload: {
		system: string;
		task: string;
		tools: ContextPayload["tools"];
		messages: ContextMessage[];
		materials: ContextPayload["materials"][number][];
		memory: ContextPayload["memory"][number][];
	} = { ...input.sources.fixedInput, messages: [], materials: [], memory: [] };
	const locations = new Map<string, PayloadLocation>();
	const calls = input.organized.toolCalls
		.filter((call) => selectedRefs.has(call.requestRecordRef) && selectedRefs.has(call.resultRecordRef))
		.sort((a, b) => (canonicalize(a.identity) < canonicalize(b.identity) ? -1 : 1));
	const toolCalls = calls.map((call, index) => ({ ...call, frameCallId: `ctxcall_${index}` }));
	for (const record of input.organized.records) {
		if (!selectedRefs.has(record.recordRef)) continue;
		const message = structuredClone(record.message);
		if (message) {
			let output = message;
			if (message.role === "assistant")
				output = {
					...message,
					content: message.content.map((block) => {
						if (block.type !== "tool_call") return block;
						const mapping = toolCalls.find(
							(call) => call.requestRecordRef === record.recordRef && call.identity.callId === block.toolCallId,
						);
						requireContext(mapping, "BINDING_MISMATCH");
						return { ...block, toolCallId: mapping.frameCallId };
					}),
				};
			if (message.role === "tool") {
				const mapping = toolCalls.find((call) => call.resultRecordRef === record.recordRef);
				requireContext(mapping, "BINDING_MISMATCH");
				output = { ...message, toolCallId: mapping.frameCallId };
			}
			locations.set(record.recordRef, { field: "messages", index: payload.messages.length });
			payload.messages.push(output);
		} else {
			const content = input.organized.contents.find((item) => item.recordRef === record.recordRef);
			requireContext(content);
			if (content.kind === "material") {
				locations.set(record.recordRef, { field: "materials", index: payload.materials.length });
				payload.materials.push(content.value);
			} else {
				locations.set(record.recordRef, { field: "memory", index: payload.memory.length });
				payload.memory.push(content.value);
			}
		}
	}
	return { payload: freezeDecision(structuredClone(payload)), locations, toolCalls };
}

/** 共享渲染/计量器；试选和最终封装使用同一实现。 */
export class FrameFreezer {
	readonly #input: AssemblyRenderInput;
	readonly #estimator: ContextEstimatorPort;
	/** 注入不可变来源和冻结版本的计量能力。 */
	constructor(input: AssemblyRenderInput, estimator: ContextEstimatorPort) {
		this.#input = input;
		this.#estimator = estimator;
	}
	#records(unitRefs: readonly string[]): Set<string> {
		requireContext(
			new Set(unitRefs).size === unitRefs.length &&
				unitRefs.every((id) => this.#input.organized.units.some((unit) => unit.unitRef === id)),
		);
		return new Set(
			this.#input.organized.units
				.filter((unit) => unitRefs.includes(unit.unitRef))
				.flatMap((unit) => unit.memberRefs),
		);
	}
	#measure(refs: ReadonlySet<string>): {
		/** 完整模型投影的Pi粗估Token数 */ inputTokens: number;
		/** 完整模型投影的UTF-8字节数 */
		inputBytes: number;
	} {
		const measured = this.#estimator.estimate(renderRecords(this.#input, refs).payload);
		requireContext(
			Number.isSafeInteger(measured.inputTokens) &&
				measured.inputTokens >= 0 &&
				Number.isSafeInteger(measured.inputBytes) &&
				measured.inputBytes >= 0,
		);
		return measured;
	}
	/** 父贡献用同版完整投影差值计算，不相加原文字符预算。 */
	estimateSelection(unitRefs: readonly string[]): SelectionEstimate {
		const refs = this.#records(unitRefs);
		const full = this.#measure(refs);
		const parent = this.#input.basis.parentContext;
		if (!parent) return { ...full, inheritedTokens: 0, inheritedTargetTokens: 0 };
		const own = new Set([...refs].filter((id) => !parent.candidateRefs.includes(id)));
		const base = this.#measure(own);
		const limits = this.#input.basis.limits;
		const target = Math.min(
			limits.inputTokenLimit,
			limits.modelWindowTokens - limits.outputReserveTokens - limits.estimatorMarginTokens,
		);
		return {
			...full,
			inheritedTokens: Math.max(0, full.inputTokens - base.inputTokens),
			inheritedTargetTokens: Math.max(0, Math.min(parent.maxInheritedTokens, target - base.inputTokens)),
		};
	}
	/** 独立复核后生成不引用工作集可变内存的完整候选。 */
	freeze(algorithmInput: AssemblyAlgorithmInput, selection: Selection): AssemblyCandidate {
		validateSelection(algorithmInput, selection);
		const { basis, organized, sources } = this.#input;
		const refs = this.#records(selection.selectedUnitRefs);
		const rendered = renderRecords(this.#input, refs);
		const estimate = this.estimateSelection(selection.selectedUnitRefs);
		const parent = new Set(basis.parentContext?.candidateRefs ?? []);
		const base = this.#measure(new Set([...refs].filter((id) => !parent.has(id))));
		const omittedParentUnits = organized.units.filter(
			(unit) => !selection.selectedUnitRefs.includes(unit.unitRef) && unit.memberRefs.some((id) => parent.has(id)),
		);
		const allParent = selectionClosure(algorithmInput, [
			...selection.selectedUnitRefs,
			...omittedParentUnits.map((unit) => unit.unitRef),
		]);
		const next = omittedParentUnits[0];
		const candidate: AssemblyCandidate = {
			payload: rendered.payload,
			trace: {
				records: organized.records.map((record) => ({
					recordRef: record.recordRef,
					identity: record.identity,
					contentRef: record.contentRef,
					orderKey: record.orderKey,
					output: rendered.locations.get(record.recordRef) ?? null,
				})),
				units: organized.units,
				dependencies: organized.dependencies,
				decisions: selection.decisions,
				toolCalls: rendered.toolCalls,
				degradedSources: sources.degradedSources,
			},
			tokenAccounting: {
				inputBytes: estimate.inputBytes,
				inputTargetTokens: Math.min(
					basis.limits.inputTokenLimit,
					basis.limits.modelWindowTokens - basis.limits.outputReserveTokens - basis.limits.estimatorMarginTokens,
				),
				baseInputTokens: base.inputTokens,
				inheritedTargetTokens: estimate.inheritedTargetTokens,
				inputTokens: estimate.inputTokens,
				estimatedInheritedTokens: estimate.inheritedTokens,
				nextEligibleInheritedUnitTokens: next
					? Math.max(
							0,
							this.estimateSelection(
								selectionClosure(algorithmInput, [...selection.selectedUnitRefs, next.unitRef]),
							).inheritedTokens - estimate.inheritedTokens,
						)
					: null,
				droppedInheritedTokens: Math.max(
					0,
					this.estimateSelection(allParent).inheritedTokens - estimate.inheritedTokens,
				),
				estimatorVersion: basis.estimatorVersion,
				modelWindowVersion: basis.modelWindowVersion,
				formatVersion: basis.formatVersion,
				budgetStatus: withinSelectionTargets(algorithmInput, estimate) ? "within_target" : "required_over_target",
			},
			inputDigest: flowId("ctx-input", basis),
			payloadDigest: flowId("ctx-payload", rendered.payload),
			selectionVersion: basis.selectionVersion,
			formatVersion: basis.formatVersion,
			modelAdapterVersion: basis.modelAdapterVersion,
		};
		requireContext(Buffer.byteLength(canonicalize(candidate)) <= basis.limits.maxCandidateBytes, "CONTEXT_LIMIT");
		return freezeDecision(structuredClone(candidate));
	}
}
