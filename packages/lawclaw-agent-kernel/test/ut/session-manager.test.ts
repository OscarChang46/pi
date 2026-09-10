import assert from "node:assert/strict";
import { test } from "node:test";
import { KernelError } from "../../src/contracts/errors.ts";
import { AgentSession } from "../../src/control/session-manager/agent-session.ts";

function reserve(session: AgentSession, runId: string) {
	return session.reserveRun({
		runId,
		reserveCommandId: `reserve:${runId}`,
		admissionCommandId: `admit:${runId}`,
		payloadDigest: `digest:${runId}`,
	});
}

test("[AK-SESSION-001] Session 同时只允许一个当前 Run 绑定", () => {
	const session = new AgentSession("session:1", "tenant:1", "agent:1");
	const first = reserve(session, "run:1");

	assert.equal(first.state, "RESERVED");
	assert.throws(
		() => reserve(session, "run:2"),
		(error: unknown) => error instanceof KernelError && error.code === "SESSION_RUN_ACTIVE",
	);
	assert.equal(session.activeRunBinding?.runId, "run:1");
});

test("[AK-SESSION-002] UNKNOWN 保持占槽，原受理确认后才能进入 ACTIVE", () => {
	const session = new AgentSession("session:1", "tenant:1", "agent:1");
	const reserved = reserve(session, "run:1");

	const unknown = session.markRunAdmissionUnknown("run:1", reserved.bindingVersion);
	assert.equal(unknown.state, "SUBMIT_UNKNOWN");
	assert.throws(
		() => reserve(session, "run:2"),
		(error: unknown) => error instanceof KernelError && error.code === "SESSION_RUN_ACTIVE",
	);
	const active = session.confirmRunAdmission("run:1", reserved.bindingVersion, "receipt:admitted");
	assert.equal(active.state, "ACTIVE");
	assert.equal(active.stateVersion, 3);
});

test("[AK-SESSION-003] 迟到终态不能释放后续 Run 的新代次绑定", () => {
	const session = new AgentSession("session:1", "tenant:1", "agent:1");
	const first = reserve(session, "run:1");
	session.confirmRunAdmission("run:1", first.bindingVersion, "receipt:run:1:admitted");
	session.beginRunRelease("run:1", first.bindingVersion, "receipt:run:1:terminal");
	session.finalizeRunRelease("run:1", first.bindingVersion);

	const second = reserve(session, "run:2");
	assert.equal(second.bindingVersion, first.bindingVersion + 1);
	assert.throws(() => session.beginRunRelease("run:1", first.bindingVersion, "receipt:run:1:late"));
	assert.equal(session.activeRunBinding?.runId, "run:2");
	assert.equal(session.activeRunBinding?.bindingVersion, second.bindingVersion);
});
