import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AdvanceInput, RuntimePayload } from "../../src/contracts/flow-engine.ts";
import { flowDigest, flowId } from "../../src/control/flow-engine/canonical.ts";
import { isAdvanceInput } from "../../src/control/flow-engine/input-schema.ts";

const data: {
	cases: { id: string; input: unknown; expected: unknown }[];
	canonicalVectors: { value: unknown; canonical: string; digest: string }[];
} = JSON.parse(
	readFileSync(
		new URL("../../docs/design/layers/l1-control/components/flow-engine-contract-v1.examples.json", import.meta.url),
		"utf8",
	),
);

export const flowExamples = data;

export function flowInput(id = "V1"): AdvanceInput {
	const input = structuredClone(data.cases.find((c) => c.id === id)?.input);
	assert.ok(isAdvanceInput(input));
	return input;
}

export function withEvent(
	input: AdvanceInput,
	payload: RuntimePayload,
	source: AdvanceInput["event"]["source"],
	causationId: string,
): AdvanceInput {
	const eventId =
		payload.kind === "AdvanceRequested"
			? flowId("wake", { runId: input.run.runId, version: input.run.version, kind: "advance" })
			: "event-test";
	return {
		...input,
		event: {
			...input.event,
			eventId,
			source,
			causationId,
			payload,
			payloadDigest: flowDigest({ source, causationId, payload }),
		},
	};
}
