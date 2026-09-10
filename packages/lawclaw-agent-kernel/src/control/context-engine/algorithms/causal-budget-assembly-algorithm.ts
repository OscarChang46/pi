import type {
	AssemblyAlgorithm,
	AssemblyAlgorithmInput,
	Selection,
} from "../../../contracts/control/context-engine/assembly-contract.ts";
import { requireContext } from "../../../contracts/control/context-engine/context-error.ts";
import { finishSelection, mandatorySelection, selectionClosure, withinSelectionTargets } from "./selection-policy.ts";

/** 默认策略只做完整单元选择；估算和结构规则由公共能力提供。 */
export class CausalBudgetAssemblyAlgorithm implements AssemblyAlgorithm {
	/** 受信注册的策略标识 */
	readonly algorithmId = "causal-budget";
	/** 实现或来源的冻结版本 */
	readonly version = "v1";
	/** 必选超软目标直接返回，不再试放任何可选内容。 */
	select(input: AssemblyAlgorithmInput): Selection {
		let selected = mandatorySelection(input);
		const mandatoryEstimate = input.estimateSelection(selected);
		requireContext(mandatoryEstimate.inputBytes <= input.limits.maxBytes, "CONTEXT_LIMIT");
		const ranked = new Set<string>();
		if (!withinSelectionTargets(input, mandatoryEstimate)) return finishSelection(input, selected, ranked);
		for (const id of input.optionalUnitOrder) {
			if (selected.includes(id)) continue;
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
