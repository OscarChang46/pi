import type { TestContext } from "node:test";
import type {
	AssemblyBasis,
	ContextMessage,
	SourceReadResult,
	SourceRecord,
} from "../../src/contracts/control/context-engine/assembly-contract.ts";
import { flowId } from "../../src/contracts/flow-value.ts";
import { ScopedContextArtifactReader } from "../../src/infrastructure/adapters/context-artifact-reader.ts";
import { SqliteFlowArtifacts } from "../../src/infrastructure/adapters/sqlite-flow-artifacts.ts";
import { AgentRunDatabase } from "../../src/infrastructure/state-storage/adapters/run-registry/agent-run-database.ts";

export function contextFixture(test: TestContext) {
	const database = new AgentRunDatabase(":memory:");
	test.after(() => database.close());
	const store = new SqliteFlowArtifacts(database, "context-test");
	const artifacts = new ScopedContextArtifactReader(store, async () => {});
	const basis: AssemblyBasis = {
		runInput: { kind: "initial", preparationId: "prepare:1", plannedRunId: "agent:1" },
		sessionInput: {
			kind: "create",
			intent: {
				logicalKey: "session:1",
				agentDefinitionRef: "agent:def",
				contextPolicyRef: "policy:1",
				parent: null,
			},
		},
		systemRef: store.put({ schemaVersion: "ctx-text-1", text: "系统规则" }),
		taskRef: store.put({ schemaVersion: "ctx-text-1", text: "比较A与B\n保留否定词" }),
		toolsRef: store.put({ schemaVersion: "ctx-tools-1", tools: [] }),
		materials: [],
		memory: [],
		requirements: [],
		parentContext: null,
		expectedChildObservations: [],
		limits: {
			inputTokenLimit: 10000,
			modelWindowTokens: 20000,
			outputReserveTokens: 1000,
			estimatorMarginTokens: 100,
			maxBytes: 100000,
			maxWorkingBytes: 200000,
			maxCandidateBytes: 200000,
			maxSources: 16,
			maxRecords: 100,
			maxEdges: 100,
		},
		configVersion: "config:1",
		selectionVersion: flowId("ctx-alg", { algorithmId: "causal-budget", version: "v1" }),
		estimatorVersion: "pi-estimate-1",
		modelWindowVersion: "window:1",
		formatVersion: "ctx-input-1",
		modelAdapterVersion: "pi-context-1",
		envelopeRef: "envelope:1",
		authorizationEpoch: 0,
	};
	const record = (agentRunId: string, event: string, sequence: number, message: ContextMessage): SourceRecord => {
		const identity = {
			kind: "run_event" as const,
			originAgentRunId: agentRunId,
			originEventRef: event,
			recordIndex: 0,
		};
		return {
			identity,
			recordRef: flowId("ctx-rec", identity),
			contentRef: store.put(message),
			message,
			orderKey: { sourceOrdinal: 0, sequence, recordOrdinal: 0 },
			callBindings: [],
			dependencies: [],
		};
	};
	const history = (records: readonly SourceRecord[], contents: SourceReadResult["contents"] = []) => {
		const batch = store.put({ records, contents });
		return {
			basis: {
				...basis,
				sessionInput: {
					kind: "existing" as const,
					anchor: { sessionId: "session:1", version: 7, headRef: batch.id },
				},
			},
			reader: {
				async read() {
					return store.get(batch) as SourceReadResult;
				},
			},
		};
	};
	return { basis, store, database, artifacts, record, history };
}
