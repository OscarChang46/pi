import type {
	AssemblyAlgorithmInput,
	AssemblyBasis,
	Selection,
	SelectionEstimate,
} from "../../../contracts/control/context-engine/assembly-contract.ts";
import { requireContext } from "../../../contracts/control/context-engine/context-error.ts";
import type { OrganizedContext } from "../structural-organizer.ts";

/** 必选声明和优先级只由冻结输入编译，正文不授予自身必选资格。 */
export function prepareSelectionPolicy(
	basis: AssemblyBasis,
	organized: OrganizedContext,
): { requiredRecordRefs: readonly string[]; optionalUnitOrder: readonly string[] } {
	const requiredRecordRefs = [
		...new Set([
			...basis.requirements.flatMap((item) => item.memberRefs),
			...basis.materials.flatMap((item) => item.requirement?.memberRefs ?? []),
			...(basis.parentContext?.requiredRefs ?? []),
		]),
	];
	requireContext(requiredRecordRefs.every((id) => organized.records.some((record) => record.recordRef === id)));
	const rank = (unitRef: string): readonly [number, number, string] => {
		const unit = organized.units.find((item) => item.unitRef === unitRef)!;
		const lastHistory = organized.historyRecords.reduce(
			(last, record, index) => (unit.memberRefs.includes(record.recordRef) ? index : last),
			-1,
		);
		if (lastHistory >= 0) return [0, -lastHistory, unitRef];
		const content = organized.contents.find((item) => unit.memberRefs.includes(item.recordRef));
		if (content?.kind === "memory") return [1, content.scoreRank, content.value.entryId];
		return [
			2,
			-(
				basis.materials.find((item) => content?.kind === "material" && item.sourceRef === content.value.sourceRef)
					?.priority ?? 0
			),
			unitRef,
		];
	};
	const optionalUnitOrder = organized.units
		.map((unit) => unit.unitRef)
		.sort((a, b) => {
			const left = rank(a),
				right = rank(b);
			return left[0] - right[0] || left[1] - right[1] || (left[2] < right[2] ? -1 : left[2] > right[2] ? 1 : 0);
		});
	return { requiredRecordRefs, optionalUnitOrder };
}

/** 有界集合闭包，不建立跨请求或平方规模闭包缓存。 */
export function selectionClosure(input: AssemblyAlgorithmInput, seeds: readonly string[]): string[] {
	const selected = new Set(seeds);
	requireContext(seeds.every((id) => input.units.some((unit) => unit.unitRef === id)));
	let changed = true;
	while (changed) {
		changed = false;
		const records = new Set(
			input.units.filter((unit) => selected.has(unit.unitRef)).flatMap((unit) => unit.memberRefs),
		);
		for (const edge of input.dependencies) if (records.has(edge.fromRecordRef)) records.add(edge.toRecordRef);
		for (const unit of input.units)
			if (!selected.has(unit.unitRef) && unit.memberRefs.some((id) => records.has(id))) {
				selected.add(unit.unitRef);
				changed = true;
			}
	}
	return input.units.filter((unit) => selected.has(unit.unitRef)).map((unit) => unit.unitRef);
}
/** 必选引用从记录空间映射到完整单元，缺记录立即失败。 */
export function mandatorySelection(input: AssemblyAlgorithmInput): string[] {
	requireContext(input.requiredRecordRefs.every((id) => input.units.some((unit) => unit.memberRefs.includes(id))));
	return selectionClosure(
		input,
		input.units
			.filter((unit) => unit.memberRefs.some((id) => input.requiredRecordRefs.includes(id)))
			.map((unit) => unit.unitRef),
	);
}
/** Token软目标保留必选，但可选试放必须满足总目标及父目标。 */
export function withinSelectionTargets(input: AssemblyAlgorithmInput, estimate: SelectionEstimate): boolean {
	const target = Math.min(
		input.limits.inputTokenLimit,
		input.limits.modelWindowTokens - input.limits.outputReserveTokens - input.limits.estimatorMarginTokens,
	);
	return estimate.inputTokens <= target && estimate.inheritedTokens <= estimate.inheritedTargetTokens;
}
/** 从最终集合形成覆盖全部输入单元的决策。 */
export function finishSelection(
	input: AssemblyAlgorithmInput,
	selected: readonly string[],
	ranked: ReadonlySet<string>,
): Selection {
	const mandatory = new Set(mandatorySelection(input));
	return {
		selectedUnitRefs: selected,
		decisions: input.units.map((unit) => ({
			unitRef: unit.unitRef,
			decision: selected.includes(unit.unitRef) ? "keep" : "drop",
			reason: mandatory.has(unit.unitRef)
				? "required"
				: !selected.includes(unit.unitRef)
					? "budget"
					: ranked.has(unit.unitRef)
						? "ranked"
						: "dependency",
		})),
	};
}

/** 公共输出守卫独立于具体策略，禁止漏必选、断依赖或伪造决定。 */
export function validateSelection(input: AssemblyAlgorithmInput, selection: Selection): void {
	requireContext(selection !== null && typeof selection === "object" && Object.keys(selection).length === 2);
	requireContext(Array.isArray(selection.selectedUnitRefs) && Array.isArray(selection.decisions));
	requireContext(new Set(selection.selectedUnitRefs).size === selection.selectedUnitRefs.length);
	const closed = selectionClosure(input, selection.selectedUnitRefs);
	requireContext(closed.length === selection.selectedUnitRefs.length);
	requireContext(mandatorySelection(input).every((id) => selection.selectedUnitRefs.includes(id)));
	requireContext(
		selection.decisions.length === input.units.length &&
			new Set(selection.decisions.map((item) => item.unitRef)).size === input.units.length,
	);
	for (const decision of selection.decisions) {
		requireContext(decision !== null && typeof decision === "object" && Object.keys(decision).length === 3);
		requireContext(input.units.some((unit) => unit.unitRef === decision.unitRef));
		requireContext(decision.decision === (selection.selectedUnitRefs.includes(decision.unitRef) ? "keep" : "drop"));
		requireContext(["required", "dependency", "ranked", "budget"].includes(decision.reason));
	}
	const estimate = input.estimateSelection(selection.selectedUnitRefs);
	requireContext(estimate.inputBytes <= input.limits.maxBytes, "CONTEXT_LIMIT");
	if (!withinSelectionTargets(input, estimate)) {
		const mandatory = mandatorySelection(input);
		requireContext(
			selection.selectedUnitRefs.length === mandatory.length &&
				mandatory.every((id) => selection.selectedUnitRefs.includes(id)),
		);
	}
}
