import type { TuiRunSnapshot, TuiTextEvent, TuiTextIdentity } from "../../contracts/kernel-tui.ts";

const MAX_LIVE_BYTES = 32 * 1024;

/** 当前block有界工作集；超限后保留身份但停止累积正文。 */
export interface LiveText extends TuiTextIdentity {
	/** 临时文本所依据的持久输出版本。 */
	readonly baseOutputRevision: number;

	/** 当前有界正文，保留用户空白；渲染前仍需清洗。 */
	readonly text: string;

	/** 下一增量的Unicode码点偏移。 */
	readonly nextOffset: number;

	/** 超过内存上限后停止累积，改用已保存分页。 */
	readonly truncated: boolean;

	/** 当前文本块已结束，不等同于Run终态。 */
	readonly ended: boolean;
}

/** null表示尚未收到start；resync表示不再尝试猜测缺失内容。 */
export type LiveTextResult =
	| {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "keep";
			/** 转换后的当前文本投影；null表示尚无start。 */
			readonly value: LiveText | null;
	  }
	| {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "resync";
	  };

/** 同代次内的纯文本转换；外层负责过滤旧订阅并在resync时换代。 */
export function applyLiveText(current: LiveText | null, event: TuiTextEvent, snapshot: TuiRunSnapshot): LiveTextResult {
	if (event.runId !== snapshot.runId) return { kind: "resync" };
	if (event.attemptId !== snapshot.attemptId) return { kind: "keep", value: current };
	if (event.kind === "text.start") {
		if (event.baseOutputRevision !== snapshot.outputRevision) return { kind: "resync" };
		if (Buffer.byteLength(event.prefix) > MAX_LIVE_BYTES) return { kind: "resync" };
		return {
			kind: "keep",
			value: {
				...event,
				text: event.prefix,
				nextOffset: Array.from(event.prefix).length,
				truncated: false,
				ended: false,
			},
		};
	}
	if (!current) return { kind: "resync" };
	if (event.streamId !== current.streamId || event.blockId !== current.blockId)
		return { kind: "keep", value: current };
	if (event.kind === "text.end") return { kind: "keep", value: { ...current, ended: true } };
	if (current.truncated || current.ended) return { kind: "keep", value: current };
	if (event.baseOutputRevision !== current.baseOutputRevision) return { kind: "resync" };
	const incoming = Array.from(event.text);
	if (event.offset < current.nextOffset) {
		const matching =
			event.offset >= 0 &&
			event.offset + incoming.length <= current.nextOffset &&
			Array.from(current.text)
				.slice(event.offset, event.offset + incoming.length)
				.join("") === event.text;
		return matching ? { kind: "keep", value: current } : { kind: "resync" };
	}
	if (event.offset !== current.nextOffset) return { kind: "resync" };
	if (Buffer.byteLength(current.text) + Buffer.byteLength(event.text) > MAX_LIVE_BYTES) {
		return { kind: "keep", value: { ...current, text: "", truncated: true } };
	}
	return {
		kind: "keep",
		value: { ...current, text: current.text + event.text, nextOffset: current.nextOffset + incoming.length },
	};
}
