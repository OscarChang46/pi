import type { ContextArtifactReader, SourceReader } from "../contracts/control/context-engine/assembly-contract.ts";
import { requireContext } from "../contracts/control/context-engine/context-error.ts";
import type {
	ContextEngineFactory,
	RuntimeContextDependencies,
} from "../contracts/control/context-engine/runtime-preparation.ts";
import { CausalBudgetAssemblyAlgorithm } from "../control/context-engine/algorithms/causal-budget-assembly-algorithm.ts";
import { PiRecentHistoryAssemblyAlgorithm } from "../control/context-engine/algorithms/pi-recent-history-assembly-algorithm.ts";
import { ContextEngine } from "../control/context-engine/context-engine.ts";
import { FrozenHistoryReader } from "../control/context-engine/frozen-history-reader.ts";
import {
	ArtifactSourceReader,
	MemorySourceReader,
	SourceReaderRegistry,
} from "../control/context-engine/source-reader-registry.ts";
import { ScopedContextArtifactReader } from "../infrastructure/adapters/context-artifact-reader.ts";
import { InMemoryContextArtifacts } from "../infrastructure/adapters/in-memory-context-artifacts.ts";
import { PiContextAdapter } from "../infrastructure/adapters/pi-context/pi-context-adapter.ts";

/** 为一次受信作用域装配独占组装器；宿主须等待调用退出再释放。 */
export function createContextAssembler(
	readers: { readonly reader: SourceReader; readonly artifacts: ContextArtifactReader },
	strategy: "causal-budget" | "pi-recent-history",
): ContextEngine {
	requireContext(strategy === "causal-budget" || strategy === "pi-recent-history");
	const adapter = new PiContextAdapter();
	const algorithm =
		strategy === "causal-budget"
			? new CausalBudgetAssemblyAlgorithm()
			: new PiRecentHistoryAssemblyAlgorithm(adapter);
	const reader = new SourceReaderRegistry({
		session: readers.reader,
		run: readers.reader,
		memory: new MemorySourceReader(readers.artifacts),
		material: new ArtifactSourceReader(readers.artifacts),
	});
	return new ContextEngine({ ...readers, reader, estimator: adapter, algorithm });
}

/** 为真实入口创建统一组装规则；每次调用的历史和 CE 实例相互隔离。 */
export function createContextEngineFactory(artifacts: ContextArtifactReader): ContextEngineFactory {
	return {
		create(sources) {
			return createContextAssembler(
				{ artifacts, reader: new FrozenHistoryReader(sources) },
				"causal-budget",
			);
		},
	};
}

/** 内存宿主专用存储，只包含本宿主已经允许交付的冻结值。 */
export function createInMemoryContextDependencies(): RuntimeContextDependencies {
	const artifacts = new InMemoryContextArtifacts();
	return {
		artifacts,
		engineFactory: createContextEngineFactory(
			new ScopedContextArtifactReader(artifacts, async (_ref, signal) => signal.throwIfAborted()),
		),
	};
}
