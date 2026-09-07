import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAgentKernel, createRequestContext, createRunCommand } from "../../src/application/composition-root.ts";
import { assertEventSequence } from "../support/harness.ts";

test("[AK-FLOW-001] Pi Adapter、Kernel Loop、只读工具和单层委派形成完整纵切", async () => {
	const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
	const workspace = path.join(projectRoot, "sample-workspace");
	const kernel = await createAgentKernel(workspace);
	const result = await kernel.run(createRequestContext(), createRunCommand(workspace));

	assert.equal(result.status, "completed");
	assert.equal(result.turns, 3);
	assert.equal(result.toolCalls, 2);
	assert.match(result.output, /均已贯通/u);
	assert.ok(result.events.some((event) => event.type === "ChildRunStarted"));
	assert.ok(result.events.some((event) => event.type === "ChildRunCompleted"));
	assertEventSequence(result.events);
	assert.equal(kernel.sessions.length, 1);
	const session = kernel.sessions[0];
	assert.equal(session?.sessionId, result.events[0]?.data.sessionId);
	assert.equal(session?.runIds.length, 1);
	const run = kernel.getRun(result.runId);
	assert.equal(run?.status, "COMPLETED");
	assert.equal(run?.loops.length, result.turns);
	assert.deepEqual(
		run?.loops.map((loop) => [loop.ordinal, loop.status]),
		[
			[1, "COMPLETED"],
			[2, "COMPLETED"],
			[3, "COMPLETED"],
		],
	);
});
