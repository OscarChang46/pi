import assert from "node:assert/strict";
import { test } from "node:test";
import type { RequestContext, TimeContext, TimePoint, TimePort, ZonedDateTimeView } from "../src/contracts/index.ts";
import { InMemoryKillSwitch, type KillSwitchScope, type KillSwitchTarget } from "../src/kernel/kill-switch.ts";

class FakeTimePort implements TimePort {
	#epochMilliseconds = 1_800_000_000_000;

	public advance(milliseconds: number): void {
		this.#epochMilliseconds += milliseconds;
	}

	public now(): TimePoint {
		return this.#point(this.#epochMilliseconds);
	}

	public monotonicMilliseconds(): number {
		return this.#epochMilliseconds;
	}

	public parseIsoUtc(value: string): TimePoint | undefined {
		const parsed = Date.parse(value);
		return Number.isSafeInteger(parsed) && new Date(parsed).toISOString() === value ? this.#point(parsed) : undefined;
	}

	public addMilliseconds(base: TimePoint, deltaMilliseconds: number): TimePoint {
		return this.#point(base.epochMilliseconds + deltaMilliseconds);
	}

	public isTimeZoneSupported(timeZone: string): boolean {
		return timeZone === "Asia/Shanghai";
	}

	public isLocaleSupported(locale: string): boolean {
		return locale === "zh-CN";
	}

	public toZonedDateTime(point: TimePoint, context: TimeContext): ZonedDateTimeView {
		return {
			instant: point,
			timeZone: context.timeZone,
			utcOffset: "GMT+08:00",
			localDateTime: point.isoUtc,
			localizedText: point.isoUtc,
		};
	}

	#point(epochMilliseconds: number): TimePoint {
		return { epochMilliseconds, isoUtc: new Date(epochMilliseconds).toISOString() };
	}
}

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

test("Kill Switch 支持全部八种作用域且任一匹配项都会阻断", () => {
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

test("上层 active 会阻断下层目标但不会误伤其他租户", () => {
	const timePort = new FakeTimePort();
	const context = contextFor(timePort);
	const killSwitch = new InMemoryKillSwitch(timePort);
	killSwitch.enable(context, scopes[3], { reasonCode: "AGENT_COMPROMISED", operatorRef: "operator:2" });

	assert.equal(killSwitch.check(context, target).active, true);
	assert.equal(killSwitch.check(context, { ...target, agentId: "agent-other" }).active, false);
});

test("重复启停幂等且 epoch 只在实际状态变化时递增", () => {
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

test("watch 先返回快照并发布启停后的新 epoch", async () => {
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

test("非法、跨租户或不完整目标默认拒绝", () => {
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
