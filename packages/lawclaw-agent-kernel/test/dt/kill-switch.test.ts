import assert from "node:assert/strict";
import { test } from "node:test";
import type { RequestContext, TimePort } from "../../src/contracts/index.ts";
import type { KillSwitchScope, KillSwitchTarget } from "../../src/contracts/kill-switch.ts";
import { InMemoryKillSwitch } from "../../src/security/kill-switch.ts";

import { TestClock as FakeTimePort } from "../support/harness.ts";

const target: KillSwitchTarget = {
	runtimeId: "runtime-1",
	tenantId: "tenant-test",
	agentId: "agent-1",
	sessionId: "session-1",
	runId: "run-1",
	toolName: "read_file",
	toolCallId: "call-1",
};

const scopes: readonly KillSwitchScope[] = [
	{ kind: "GLOBAL" },
	{ kind: "RUNTIME", runtimeId: "runtime-1" },
	{ kind: "TENANT", runtimeId: "runtime-1", tenantId: "tenant-test" },
	{ kind: "AGENT", runtimeId: "runtime-1", tenantId: "tenant-test", agentId: "agent-1" },
	{ kind: "SESSION", runtimeId: "runtime-1", tenantId: "tenant-test", sessionId: "session-1" },
	{ kind: "RUN", runtimeId: "runtime-1", tenantId: "tenant-test", runId: "run-1" },
	{ kind: "TOOL", runtimeId: "runtime-1", tenantId: "tenant-test", toolName: "read_file" },
	{ kind: "TOOL_CALL", runtimeId: "runtime-1", tenantId: "tenant-test", toolCallId: "call-1" },
];

function contextFor(timePort: TimePort): RequestContext {
	const now = timePort.now();
	return {
		tenant: {
			tenantId: "tenant-test",
			subjectId: "subject-test",
			authorizationSnapshot: "snapshot-test",
			issuedAt: timePort.addMilliseconds(now, -1_000).isoUtc,
			expiresAt: timePort.addMilliseconds(now, 60_000).isoUtc,
			contextVersion: "1",
		},
		operation: {
			traceId: "trace-test",
			spanId: "span-test",
			correlationId: "correlation-test",
			deadlineAt: timePort.addMilliseconds(now, 30_000).isoUtc,
			requestStartedAt: now.isoUtc,
		},
		time: { timeZone: "Asia/Shanghai", locale: "zh-CN" },
	};
}

test("[AK-KILL-004] watch 先返回快照并发布启停后的新 epoch", async () => {
	const timePort = new FakeTimePort();
	const context = contextFor(timePort);
	const killSwitch = new InMemoryKillSwitch(timePort);
	const controller = new AbortController();
	const iterator = killSwitch.watch(context, target, controller.signal)[Symbol.asyncIterator]();

	const initial = await iterator.next();
	assert.equal(initial.value?.epoch, 0);
	assert.equal(initial.value?.active, false);
	killSwitch.enable(context, scopes[6], { reasonCode: "TOOL_DISABLED", operatorRef: "operator:5" });
	const active = await iterator.next();
	assert.equal(active.value?.epoch, 1);
	assert.equal(active.value?.active, true);
	killSwitch.disable(context, scopes[6]);
	const inactive = await iterator.next();
	assert.equal(inactive.value?.epoch, 2);
	assert.equal(inactive.value?.active, false);
	controller.abort();
	assert.equal((await iterator.next()).done, true);
});
