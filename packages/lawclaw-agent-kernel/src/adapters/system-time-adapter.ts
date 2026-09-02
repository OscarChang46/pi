import { performance } from "node:perf_hooks";
import {
	KernelError,
	type TimeContext,
	type TimePoint,
	type TimePort,
	type ZonedDateTimeView,
} from "../contracts/index.ts";

const STRICT_UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** 将 epoch 毫秒转换为不可变的规范化 UTC 时间点。 */
function pointFromEpoch(epochMilliseconds: number): TimePoint {
	if (!Number.isSafeInteger(epochMilliseconds)) {
		throw new KernelError("CONTEXT_INVALID", "时间点超出可表示范围。");
	}
	const date = new Date(epochMilliseconds);
	if (Number.isNaN(date.getTime())) {
		throw new KernelError("CONTEXT_INVALID", "时间点超出可表示范围。");
	}
	return Object.freeze({ epochMilliseconds, isoUtc: date.toISOString() });
}

/**
 * 基于 ECMAScript Date/Intl 的系统时间基础设施适配器。
 *
 * 该类是唯一允许直接读取主机时钟和 IANA 时区数据库的生产组件；Kernel 只依赖 TimePort。
 */
export class SystemTimeAdapter implements TimePort {
	/** 返回当前系统时钟对应的 UTC 时间点。 */
	public now(): TimePoint {
		return pointFromEpoch(Date.now());
	}

	/** 返回不受系统墙上时钟回拨影响的进程内单调时间。 */
	public monotonicMilliseconds(): number {
		return performance.now();
	}

	/** 严格解析带毫秒且以 Z 结尾的 UTC 时间；拒绝本地时间和隐式偏移。 */
	public parseIsoUtc(value: string): TimePoint | undefined {
		if (!STRICT_UTC_INSTANT.test(value)) return undefined;
		const epochMilliseconds = Date.parse(value);
		if (!Number.isSafeInteger(epochMilliseconds)) return undefined;
		const point = pointFromEpoch(epochMilliseconds);
		return point.isoUtc === value ? point : undefined;
	}

	/** 在 UTC 时间轴上执行毫秒加法；不引入夏令时或日历歧义。 */
	public addMilliseconds(base: TimePoint, deltaMilliseconds: number): TimePoint {
		this.#assertConsistentPoint(base);
		if (!Number.isSafeInteger(deltaMilliseconds)) {
			throw new KernelError("CONTEXT_INVALID", "时间增量必须为安全整数毫秒。");
		}
		return pointFromEpoch(base.epochMilliseconds + deltaMilliseconds);
	}

	/** 检查 IANA 时区是否能被当前运行时解析。 */
	public isTimeZoneSupported(timeZone: string): boolean {
		try {
			new Intl.DateTimeFormat("en", { timeZone }).format(0);
			return timeZone.includes("/") || timeZone === "UTC";
		} catch {
			return false;
		}
	}

	/** 检查 BCP 47 语言标签是否能被当前运行时解析。 */
	public isLocaleSupported(locale: string): boolean {
		try {
			return Intl.DateTimeFormat.supportedLocalesOf([locale]).length === 1;
		} catch {
			return false;
		}
	}

	/** 生成显式时区下的展示投影；原始 UTC 时间点保持不变。 */
	public toZonedDateTime(point: TimePoint, context: TimeContext): ZonedDateTimeView {
		this.#assertConsistentPoint(point);
		if (!this.isTimeZoneSupported(context.timeZone) || !this.isLocaleSupported(context.locale)) {
			throw new KernelError("CONTEXT_INVALID", "TimeContext 的 IANA 时区或语言标签不受支持。");
		}

		const stableFormatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: context.timeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hourCycle: "h23",
			timeZoneName: "longOffset",
		});
		const parts = Object.fromEntries(
			stableFormatter
				.formatToParts(point.epochMilliseconds)
				.filter((part) => part.type !== "literal")
				.map((part) => [part.type, part.value]),
		);
		const localDateTime = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.${String(point.epochMilliseconds % 1_000).padStart(3, "0")}`;
		const localizedText = new Intl.DateTimeFormat(context.locale, {
			timeZone: context.timeZone,
			dateStyle: "medium",
			timeStyle: "long",
		}).format(point.epochMilliseconds);

		return Object.freeze({
			instant: point,
			timeZone: context.timeZone,
			utcOffset: parts.timeZoneName ?? "GMT",
			localDateTime,
			localizedText,
		});
	}

	/** 拒绝 isoUtc 与 epochMilliseconds 表达不同瞬间的伪造时间点。 */
	#assertConsistentPoint(point: TimePoint): void {
		const normalized = this.parseIsoUtc(point.isoUtc);
		if (!normalized || normalized.epochMilliseconds !== point.epochMilliseconds) {
			throw new KernelError("CONTEXT_INVALID", "TimePoint 的 UTC 字符串与 Epoch 毫秒不一致。");
		}
	}
}
