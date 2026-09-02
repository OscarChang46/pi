import { SystemTimeAdapter } from "../src/adapters/index.ts";
import type { RequestContext } from "../src/contracts/index.ts";

/** 测试共用的真实时间适配器；需要确定时钟的用例应自行注入 Fake TimePort。 */
export const testTimePort = new SystemTimeAdapter();

/** 为单元测试创建短时有效、非生产的可信上下文。 */
export function testContext(): RequestContext {
	const now = testTimePort.now();
	return {
		tenant: {
			tenantId: "tenant-test",
			subjectId: "subject-test",
			authorizationSnapshot: "snapshot-test",
			issuedAt: testTimePort.addMilliseconds(now, -1_000).isoUtc,
			expiresAt: testTimePort.addMilliseconds(now, 60_000).isoUtc,
			contextVersion: "1",
		},
		operation: {
			traceId: "trace-test",
			spanId: "span-test",
			correlationId: "correlation-test",
			deadlineAt: testTimePort.addMilliseconds(now, 30_000).isoUtc,
			requestStartedAt: now.isoUtc,
		},
		time: { timeZone: "Asia/Shanghai", locale: "zh-CN" },
	};
}
