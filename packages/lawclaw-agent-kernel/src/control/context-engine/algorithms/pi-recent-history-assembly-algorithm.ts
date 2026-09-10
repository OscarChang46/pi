import type {
	AssemblyAlgorithm,
	AssemblyAlgorithmInput,
	RecentHistorySelectorPort,
	Selection,
} from "../../../contracts/control/context-engine/assembly-contract.ts";
import { requireContext } from "../../../contracts/control/context-engine/context-error.ts";
import { finishSelection, mandatorySelection, selectionClosure, withinSelectionTargets } from "./selection-policy.ts";

/** Pi只建议后缀，不拥有结构修复、存储或自动失败回退。 */
export class PiRecentHistoryAssemblyAlgorithm implements AssemblyAlgorithm {
	/** 受信注册的策略标识 */
	readonly algorithmId = "pi-recent-history";
	/** 实现或来源的冻结版本 */
	readonly version = "v1";
	readonly #selector: RecentHistorySelectorPort;
	/** 注入真实Pi或确定性替身的纯建议能力。 */
	constructor(selector: RecentHistorySelectorPort) {
		this.#selector = selector;
	}
	/** 有界推进后缀；每次从必选重建，避免遗留孤立前驱。 */
	select(input: AssemblyAlgorithmInput): Selection {
		const mandatory = mandatorySelection(input);
		const mandatoryEstimate = input.estimateSelection(mandatory);
		requireContext(mandatoryEstimate.inputBytes <= input.limits.maxBytes, "CONTEXT_LIMIT");
		const ranked = new Set<string>();
		if (!withinSelectionTargets(input, mandatoryEstimate)) return finishSelection(input, mandatory, ranked);
		const target = Math.min(
			input.limits.inputTokenLimit,
			input.limits.modelWindowTokens - input.limits.outputReserveTokens - input.limits.estimatorMarginTokens,
		);
		const suggestion =
			target > mandatoryEstimate.inputTokens && input.historyRecords.length
				? this.#selector.selectCut({
						historyRecords: input.historyRecords,
						targetTokens: target - mandatoryEstimate.inputTokens,
					}).firstKeptRecordRef
				: null;
		let start =
			suggestion === null
				? input.historyRecords.length
				: input.historyRecords.findIndex((record) => record.recordRef === suggestion);
		requireContext(start >= 0);
		let selected = mandatory;
		for (; start < input.historyRecords.length; start++) {
			const suffix = new Set(input.historyRecords.slice(start).map((record) => record.recordRef));
			const seeds = input.units
				.filter((unit) => unit.memberRefs.some((id) => suffix.has(id)))
				.map((unit) => unit.unitRef);
			const trial = selectionClosure(input, [...mandatory, ...seeds]);
			const estimate = input.estimateSelection(trial);
			if (estimate.inputBytes <= input.limits.maxBytes && withinSelectionTargets(input, estimate)) {
				selected = trial;
				for (const id of seeds) ranked.add(id);
				break;
			}
		}
		const history = new Set(input.historyRecords.map((record) => record.recordRef));
		for (const id of input.optionalUnitOrder) {
			if (
				selected.includes(id) ||
				input.units.find((unit) => unit.unitRef === id)?.memberRefs.some((ref) => history.has(ref))
			)
				continue;
			const trial = selectionClosure(input, [...selected, id]);
			const estimate = input.estimateSelection(trial);
			if (estimate.inputBytes <= input.limits.maxBytes && withinSelectionTargets(input, estimate)) {
				selected = trial;
				ranked.add(id);
			}
		}
		return finishSelection(input, selected, ranked);
	}
}
