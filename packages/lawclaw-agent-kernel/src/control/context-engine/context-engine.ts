import type {
	AssemblyAlgorithm,
	AssemblyBasis,
	AssemblyCandidate,
	ContextArtifactReader,
	ContextEstimatorPort,
	SourceReader,
} from "../../contracts/control/context-engine/assembly-contract.ts";
import {
	ContextAssemblyError,
	checkContextCancellation,
	requireContext,
} from "../../contracts/control/context-engine/context-error.ts";
import { validateBasis } from "../../contracts/control/context-engine/context-schema.ts";
import { flowId, freezeDecision } from "../../contracts/flow-value.ts";
import { prepareSelectionPolicy } from "./algorithms/selection-policy.ts";
import { FrameFreezer } from "./frame-freezer.ts";
import { collectSources } from "./source-collector.ts";
import { organizeContext } from "./structural-organizer.ts";

/** 组合根提供限定作用域的读能力，不能从请求JSON自签权限。 */
export interface ContextEngineDependencies {
	/** 已绑定作用域和当前读取资格的来源能力 */
	readonly reader: SourceReader;
	/** 受限只读Artifact能力 */
	readonly artifacts: ContextArtifactReader;
	/** 本次冻结的纯选择策略 */
	readonly algorithm: AssemblyAlgorithm;
	/** 与输入版本一致的纯估算能力 */
	readonly estimator: ContextEstimatorPort;
}

/** 查询后纯组装的独占实例；不写Session、Artifact或Run，不产生回执。 */
export class ContextEngine {
	readonly #dependencies: ContextEngineDependencies;
	/** 能力在请求进入前绑定可信作用域；同实例禁止并发或重入。 */
	constructor(dependencies: ContextEngineDependencies) {
		this.#dependencies = dependencies;
	}
	/** 整次异步调用退出才可复用实例；收到取消不提前释放在途读取。 */
	async assemble(input: AssemblyBasis, signal: AbortSignal): Promise<AssemblyCandidate> {
		try {
			checkContextCancellation(signal);
			validateBasis(input);
			const basis = freezeDecision(structuredClone(input));
			const { algorithm, estimator, reader, artifacts } = this.#dependencies;
			requireContext(
				basis.selectionVersion ===
					flowId("ctx-alg", { algorithmId: algorithm.algorithmId, version: algorithm.version }),
				"BINDING_MISMATCH",
			);
			requireContext(
				basis.estimatorVersion === estimator.version &&
					basis.formatVersion === estimator.formatVersion &&
					basis.modelAdapterVersion === estimator.modelAdapterVersion,
				"BINDING_MISMATCH",
			);
			const sources = await collectSources(basis, reader, artifacts, signal);
			checkContextCancellation(signal);
			const organized = organizeContext(basis, sources);
			const freezer = new FrameFreezer({ basis, sources, organized }, estimator);
			const policy = prepareSelectionPolicy(basis, organized);
			const algorithmInput = Object.freeze({
				units: organized.units,
				dependencies: organized.dependencies,
				historyRecords: organized.historyRecords,
				...freezeDecision(policy),
				limits: basis.limits,
				estimateSelection: (refs: readonly string[]) => freezer.estimateSelection(refs),
			});
			const selection = algorithm.select(algorithmInput);
			checkContextCancellation(signal);
			return freezer.freeze(algorithmInput, selection);
		} catch (error) {
			if (error instanceof ContextAssemblyError) throw error;
			throw new ContextAssemblyError("SCHEMA_INVALID", error);
		}
	}
}
