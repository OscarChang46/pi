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

test("[AK-KILL-001] Kill Switch 支持全部八种作用域且任一匹配项都会阻断", () => {
	for (const scope of scopes) {
		const timePort = new FakeTimePort();
		const context = contextFor(timePort);
		const killSwitch = new InMemoryKillSwitch(timePort);
		const change = killSwitch.enable(context, scope, { reasonCode: "INCIDENT", operatorRef: "operator:1" });
		assert.equal(change.changed, true);
		const snapshot = killSwitch.check(context, target);
		assert.equal(snapshot.active, true, scope.kind);
		assert.deepEqual(
			snapshot.blockers.map((blocker) => blocker.scope.kind),
			[scope.kind],
		);
	}
});

test("[AK-KILL-002] 上层 active 会阻断下层目标但不会误伤其他租户", () => {
	const timePort = new FakeTimePort();
	const context = contextFor(timePort);
	const killSwitch = new InMemoryKillSwitch(timePort);
	killSwitch.enable(context, scopes[3], { reasonCode: "AGENT_COMPROMISED", operatorRef: "operator:2" });

	assert.equal(killSwitch.check(context, target).active, true);
	assert.equal(killSwitch.check(context, { ...target, agentId: "agent-other" }).active, false);
});

test("[AK-KILL-003] 重复启停幂等且 epoch 只在实际状态变化时递增", () => {
	const timePort = new FakeTimePort();
	const context = contextFor(timePort);
	const killSwitch = new InMemoryKillSwitch(timePort);
	const command = { reasonCode: "INCIDENT", operatorRef: "operator:3" };

	const enabled = killSwitch.enable(context, scopes[5], command);
	timePort.advance(1_000);
	const enabledAgain = killSwitch.enable(context, scopes[5], { reasonCode: "REPLACEMENT", operatorRef: "operator:4" });
	const disabled = killSwitch.disable(context, scopes[5]);
	const disabledAgain = killSwitch.disable(context, scopes[5]);

	assert.equal(enabled.snapshot.epoch, 1);
	assert.equal(enabledAgain.changed, false);
	assert.equal(enabledAgain.snapshot.epoch, 1);
	assert.equal(enabledAgain.snapshot.blockers[0]?.reasonCode, "INCIDENT");
	assert.equal(disabled.snapshot.epoch, 2);
	assert.equal(disabled.snapshot.active, false);
	assert.equal(disabledAgain.changed, false);
	assert.equal(disabledAgain.snapshot.epoch, 2);
});

test("[AK-KILL-005] 非法、跨租户或不完整目标默认拒绝", () => {
	const timePort = new FakeTimePort();
	const context = contextFor(timePort);
	const killSwitch = new InMemoryKillSwitch(timePort);
	assert.throws(() => killSwitch.check(context, { ...target, tenantId: "tenant-other" }));
	assert.throws(() => killSwitch.check(context, { ...target, runtimeId: " " }));
	assert.throws(() =>
		killSwitch.check(context, {
			runtimeId: "runtime-1",
			tenantId: "tenant-test",
			toolCallId: "call-without-run",
		}),
	);
});
