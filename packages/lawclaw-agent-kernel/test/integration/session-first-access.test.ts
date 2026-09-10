import assert from "node:assert/strict";
import { test } from "node:test";
import { createContextAssembler } from "../../src/application/context-assembly-composition.ts";
import { RootSessionPreparationCoordinator } from "../../src/application/root-session-preparation.ts";
import type { SessionCreationIntent } from "../../src/contracts/control/context-engine/assembly-contract.ts";
import { AgentSystem } from "../../src/control/agent-system.ts";
import { createReadOnlyPermissionCeiling } from "../../src/control/permission-scope.ts";
import { RunRegistry } from "../../src/control/run-registry/run-registry.ts";
import { contextFixture } from "../support/context-assembly.ts";
import { testContext } from "../support/test-context.ts";
import { TwoLoopExecutor } from "../support/two-loop-executor.ts";

const intent: SessionCreationIntent = {
	logicalKey: "logical:first-access",
	agentDefinitionRef: "agent-definition:1",
	contextPolicyRef: "context-policy:1",
	parent: null,
};

function createSystem(): AgentSystem {
	const toolPolicy = {
		allowedToolNames: [],
		allowedRisks: [],
		maxCalls: 1,
		perCallTimeoutMs: 1_000,
		maxArgumentsBytes: 1_024,
	} as const;
	return new AgentSystem(
		"runtime:test",
		"agent:test",
		new TwoLoopExecutor(),
		{ maxSessions: 2 },
		createReadOnlyPermissionCeiling(toolPolicy, "workspace:test", 1_024),
		new RunRegistry(),
	);
}

test("[AK-SESSION-009] Context 候选失败时首次访问不创建 Session", async () => {
	const system = createSystem();
	const coordinator = new RootSessionPreparationCoordinator(system, system);

	await assert.rejects(
		coordinator.prepare(
			testContext(),
			{ commandId: "ensure:primary", intent },
			{
				async assemble() {
					throw new Error("candidate failed");
				},
			},
			new AbortController().signal,
		),
		/candidate failed/,
	);
	assert.equal(system.sessions.length, 0);
	assert.deepEqual(system.lookup(testContext(), intent.logicalKey), { state: "absent" });
});

test("[AK-SESSION-010] 并发赢家出现后丢弃空历史候选并按赢家锚点重新组装", async (t) => {
	const fixture = contextFixture(t);
	const system = createSystem();
	const coordinator = new RootSessionPreparationCoordinator(system, system);
	const engine = createContextAssembler(
		{
			artifacts: fixture.artifacts,
			reader: {
				async read() {
					return { records: [], contents: [] };
				},
			},
		},
		"causal-budget",
	);
	const sessionInputs: string[] = [];

	const prepared = await coordinator.prepare(
		testContext(),
		{ commandId: "ensure:primary", intent },
		{
			async assemble(sessionInput, signal) {
				sessionInputs.push(sessionInput.kind);
				const candidate = await engine.assemble({ ...fixture.basis, sessionInput }, signal);
				if (sessionInput.kind === "create") {
					system.ensure(testContext(), { commandId: "ensure:competitor", intent });
				}
				return candidate;
			},
		},
		new AbortController().signal,
	);

	assert.equal(prepared.created, false);
	assert.deepEqual(sessionInputs, ["create", "existing"]);
	assert.equal(prepared.sessionInput.kind, "existing");
	assert.deepEqual(prepared.sessionInput.kind === "existing" && prepared.sessionInput.anchor, prepared.anchor);
	assert.equal(system.sessions.length, 1);
});
