import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createAgentKernel, createRequestContext, createRunCommand } from "../src/application/composition-root.ts";

test("Pi Adapter、Kernel Loop、只读工具和单层委派形成完整纵切", async () => {
	const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
	const workspace = path.join(projectRoot, "sample-workspace");
	const kernel = await createAgentKernel(workspace);
	const result = await kernel.run(createRequestContext(), createRunCommand(workspace));

	assert.equal(result.status, "completed");
	assert.equal(result.turns, 3);
	assert.equal(result.toolCalls, 2);
	assert.match(result.output, /均已贯通/u);
	assert.ok(result.events.some((event) => event.type === "ChildRunStarted"));
	assert.ok(result.events.some((event) => event.type === "ChildRunCompleted"));
	assert.deepEqual(
		result.events.map((event) => event.seq),
		result.events.map((_, index) => index + 1),
	);
});
