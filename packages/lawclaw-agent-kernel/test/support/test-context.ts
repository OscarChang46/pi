import type { RequestContext, TimePort } from "../../src/contracts/index.ts";
import { TestClock } from "./harness.ts";

/** 测试共用的固定时钟；需要推进时钟的用例应创建独立 TestClock。 */
export const testTimePort = new TestClock();

/** 为单元测试创建短时有效、非生产的可信上下文。 */
export function testContext(timePort: TimePort = testTimePort): RequestContext {
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
