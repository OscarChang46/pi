import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { decodeCandidate, encodeCandidate } from "../../src/contracts/control/context-engine/candidate-codec.ts";
import type { ArtifactRef } from "../../src/contracts/flow-engine.ts";
import { createContextAssembler } from "../../src/index.ts";
import { ScopedContextArtifactReader } from "../../src/infrastructure/adapters/context-artifact-reader.ts";
import { SqliteFlowArtifacts } from "../../src/infrastructure/adapters/sqlite-flow-artifacts.ts";
import { AgentRunDatabase } from "../../src/infrastructure/state-storage/adapters/run-registry/agent-run-database.ts";
import { contextFixture } from "../support/context-assembly.ts";
import { temporaryWorkspace } from "../support/harness.ts";

test("[AK-CTX-401] 公开组装入口的完整候选经关闭重开SQLite后保持不变", async (context) => {
	const fixture = contextFixture(context);
	const candidate = await createContextAssembler(
		{
			artifacts: fixture.artifacts,
			reader: {
				async read() {
					assert.fail("首次不得查询历史");
				},
			},
		},
		"causal-budget",
	).assemble(fixture.basis, new AbortController().signal);
	const directory = await temporaryWorkspace(context);
	const file = path.join(directory, "context.sqlite");
	const writer = new AgentRunDatabase(file);
	let reference: ArtifactRef;
	try {
		reference = new SqliteFlowArtifacts(writer, "context-system").put(encodeCandidate(candidate));
	} finally {
		writer.close();
	}
	const reader = new AgentRunDatabase(file);
	try {
		const artifacts = new ScopedContextArtifactReader(
			new SqliteFlowArtifacts(reader, "context-system"),
			async () => {},
		);
		const restored = decodeCandidate(await artifacts.read(reference, new AbortController().signal), candidate);
		assert.deepEqual(restored, candidate);
		assert.equal(candidate.payload.task, "比较A与B\n保留否定词");
		assert.deepEqual(Object.keys(candidate.payload).sort(), [
			"materials",
			"memory",
			"messages",
			"system",
			"task",
			"tools",
		]);
	} finally {
		reader.close();
	}
});
