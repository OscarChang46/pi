import assert from "node:assert/strict";
import { test } from "node:test";
import { KernelError } from "../../src/contracts/index.ts";
import { assertRequestContext } from "../../src/contracts/request-context-guard.ts";
import { SystemTimeAdapter } from "../../src/infrastructure/adapters/system-time-adapter.ts";
import { testContext } from "../support/test-context.ts";

const timePort = new SystemTimeAdapter();

test("[AK-TIME-001] TimePort 严格接受规范化 UTC 并拒绝隐式本地时间", () => {
	const point = timePort.parseIsoUtc("2026-09-02T08:30:00.000Z");
	assert.deepEqual(point, {
		epochMilliseconds: 1_788_337_800_000,
		isoUtc: "2026-09-02T08:30:00.000Z",
	});
	assert.equal(timePort.parseIsoUtc("2026-09-02T08:30:00+08:00"), undefined);
	assert.equal(timePort.parseIsoUtc("2026-09-02 08:30:00"), undefined);
});

test("[AK-TIME-002] TimePort 提供与墙上时间分离的进程内单调计时", () => {
	const before = timePort.monotonicMilliseconds();
	const after = timePort.monotonicMilliseconds();
	assert.ok(after >= before);
});

test("[AK-TIME-003] TimePort 拒绝两个字段不一致的伪造 TimePoint", () => {
	assert.throws(
		() =>
			timePort.toZonedDateTime(
				{ epochMilliseconds: 0, isoUtc: "2026-09-02T08:30:00.000Z" },
				{ timeZone: "Asia/Shanghai", locale: "zh-CN" },
			),
		(error: unknown) => error instanceof KernelError && error.code === "CONTEXT_INVALID",
	);
});

test("[AK-TIME-004] 同一 UTC 时间点按 IANA 时区生成不同投影且不改变原时间", () => {
	const point = timePort.parseIsoUtc("2026-09-02T08:30:00.000Z");
	assert.ok(point);
	const shanghai = timePort.toZonedDateTime(point, { timeZone: "Asia/Shanghai", locale: "zh-CN" });
	const newYork = timePort.toZonedDateTime(point, { timeZone: "America/New_York", locale: "en-US" });

	assert.equal(shanghai.instant.isoUtc, point.isoUtc);
	assert.equal(newYork.instant.isoUtc, point.isoUtc);
	assert.match(shanghai.localDateTime, /^2026-09-02T16:30:00\.000$/u);
	assert.match(newYork.localDateTime, /^2026-09-02T04:30:00\.000$/u);
});

test("[AK-TIME-005] IANA 时区转换根据瞬间正确处理夏令时偏移", () => {
	const before = timePort.parseIsoUtc("2026-03-08T06:59:59.000Z");
	const after = timePort.parseIsoUtc("2026-03-08T07:00:00.000Z");
	assert.ok(before && after);
	const context = { timeZone: "America/New_York", locale: "en-US" };

	assert.match(timePort.toZonedDateTime(before, context).utcOffset, /-05:00$/u);
	assert.match(timePort.toZonedDateTime(after, context).utcOffset, /-04:00$/u);
});

test("[AK-TIME-006] RequestContext 对未知时区默认拒绝", () => {
	const context = { ...testContext(), time: { timeZone: "Mars/Olympus", locale: "zh-CN" } };
	assert.throws(
		() => assertRequestContext(context, timePort),
		(error: unknown) => error instanceof KernelError && error.code === "CONTEXT_INVALID",
	);
});
