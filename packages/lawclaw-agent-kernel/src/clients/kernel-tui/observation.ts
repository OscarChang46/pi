import type { TuiObservationClient, TuiRunSnapshot, TuiStreamEvent } from "../../contracts/kernel-tui.ts";
import { applyLiveText, type LiveText } from "./live-text.ts";

const REFRESH_INTERVAL_MS = 250;
const MAX_STALE_REFRESHES = 3;

/** 观察模块需要的定时器；回调必须异步执行，返回幂等取消函数。 */
export type ScheduleTuiRefresh = (callback: () => void, delayMs: number) => () => void;

/** 一个前台Run的可重建投影；服务快照始终是权威。 */
export interface TuiObservation<T extends TuiRunSnapshot> {
	/** 当前前台观察阶段，不复制服务端执行状态机。 */
	readonly phase: "loading" | "live" | "stale";

	/** 当前权威查询结果；首次加载前为null。 */
	readonly snapshot: T | null;

	/** 已观察的最高连续事件序号。 */
	readonly cursor: number;

	/** 前台或订阅代次；旧回调不得更新新视图。 */
	readonly generation: number;

	/** 可丢弃的临时文本，不写入持久恢复记录。 */
	readonly liveText: LiveText | null;

	/** 当前失败原因；null表示没有错误，不构造成功默认值。 */
	readonly error: unknown;
}

/** 单前台观察器；不保存后台会话，不自动重放任何写命令。 */
export class RunObservation<T extends TuiRunSnapshot> {
	readonly #client: TuiObservationClient<T>;
	readonly #publish: (state: TuiObservation<T>) => void;
	readonly #schedule: ScheduleTuiRefresh;
	#state: TuiObservation<T> = {
		phase: "loading",
		snapshot: null,
		cursor: 0,
		generation: 0,
		liveText: null,
		error: null,
	};
	#runId: string | null = null;
	#query: AbortController | null = null;
	#stream: AbortController | null = null;
	#cancelTimer: (() => void) | null = null;
	#staleRefreshes = 0;
	#disposed = false;

	/** publish同步通知界面；端口实现不得绕过signal隔离旧订阅。 */
	constructor(
		client: TuiObservationClient<T>,
		publish: (state: TuiObservation<T>) => void,
		schedule: ScheduleTuiRefresh = scheduleRefresh,
	) {
		this.#client = client;
		this.#publish = publish;
		this.#schedule = schedule;
	}

	/** 关闭旧视图后查询；旧请求即使忽略abort返回，也不会污染新视图。 */
	observe(runId: string): void {
		if (this.#disposed) throw new Error("TUI_OBSERVATION_CLOSED");
		this.#stopIo();
		this.#runId = runId;
		this.#staleRefreshes = 0;
		this.#state = {
			phase: "loading",
			snapshot: null,
			cursor: 0,
			generation: this.#state.generation + 1,
			liveText: null,
			error: null,
		};
		this.#publish(this.#state);
		void this.#refresh();
	}

	/** /status重新同步当前目标，失败计数从零开始。 */
	retry(): void {
		if (this.#runId) this.observe(this.#runId);
	}

	/** 释放查询、订阅和定时器，不取消服务任务。 */
	dispose(): void {
		this.#disposed = true;
		this.#stopIo();
	}

	async #refresh(): Promise<void> {
		if (this.#query || !this.#runId || this.#disposed) return;
		const query = new AbortController();
		this.#query = query;
		try {
			const snapshot = await this.#client.getRun(this.#runId, query.signal);
			if (query.signal.aborted || this.#disposed) return;
			if (snapshot.runId !== this.#runId) throw new Error("TUI_RUN_ID_MISMATCH");
			this.#install(snapshot);
		} catch (error) {
			if (!query.signal.aborted && !this.#disposed) this.#fail(error);
		} finally {
			if (this.#query === query) {
				this.#query = null;
				if (
					this.#state.phase === "live" &&
					this.#state.snapshot &&
					this.#state.snapshot.eventSequence < this.#state.cursor
				)
					this.#queueRefresh();
			}
		}
	}

	#install(snapshot: T): void {
		const previous = this.#state.snapshot;
		if (previous && snapshot.version < previous.version) {
			throw new Error("TUI_SNAPSHOT_REGRESSED");
		}
		this.#staleRefreshes = snapshot.eventSequence < this.#state.cursor ? this.#staleRefreshes + 1 : 0;
		if (this.#staleRefreshes >= MAX_STALE_REFRESHES) throw new Error("TUI_SNAPSHOT_NOT_CAUGHT_UP");
		const restart =
			!previous || previous.outputRevision !== snapshot.outputRevision || previous.attemptId !== snapshot.attemptId;
		const terminal = ["completed", "failed", "cancelled"].includes(snapshot.state);
		if (restart || terminal) {
			this.#stream?.abort();
			this.#stream = null;
		}
		this.#state = {
			phase: "live",
			snapshot,
			cursor: Math.max(this.#state.cursor, snapshot.eventSequence),
			generation: this.#state.generation + (restart ? 1 : 0),
			liveText: restart || terminal ? null : this.#state.liveText,
			error: null,
		};
		this.#publish(this.#state);
		if (restart && !terminal) this.#subscribe(snapshot);
	}

	#subscribe(snapshot: T): void {
		const stream = new AbortController();
		this.#stream = stream;
		this.#client.subscribe(
			snapshot.runId,
			snapshot.eventSequence,
			stream.signal,
			(event) => {
				if (!stream.signal.aborted && !this.#disposed) this.#notice(event);
			},
			(error) => {
				if (!stream.signal.aborted && !this.#disposed) this.#fail(error);
			},
		);
	}

	#notice(event: TuiStreamEvent): void {
		if (event.runId !== this.#runId) {
			this.#fail(new Error("TUI_RUN_ID_MISMATCH"));
			return;
		}
		if (event.kind === "text.start" || event.kind === "text.delta" || event.kind === "text.end") {
			if (!this.#state.snapshot) return;
			const result = applyLiveText(this.#state.liveText, event, this.#state.snapshot);
			if (result.kind === "resync") this.retry();
			else {
				this.#state = { ...this.#state, liveText: result.value };
				this.#publish(this.#state);
			}
			return;
		}
		if (event.sequence <= this.#state.cursor) return;
		if (event.sequence !== this.#state.cursor + 1) {
			// 只重取快照，不缓存当前事件或等待缺失序号。
			this.retry();
			return;
		}
		this.#state = { ...this.#state, cursor: event.sequence };
		this.#queueRefresh();
	}

	#queueRefresh(): void {
		if (this.#cancelTimer || this.#disposed) return;
		this.#cancelTimer = this.#schedule(() => {
			this.#cancelTimer = null;
			void this.#refresh();
		}, REFRESH_INTERVAL_MS);
	}

	#fail(error: unknown): void {
		this.#query?.abort();
		this.#query = null;
		this.#stream?.abort();
		this.#cancelTimer?.();
		this.#cancelTimer = null;
		this.#state = { ...this.#state, phase: "stale", liveText: null, error };
		this.#publish(this.#state);
	}

	#stopIo(): void {
		this.#query?.abort();
		this.#query = null;
		this.#stream?.abort();
		this.#stream = null;
		this.#cancelTimer?.();
		this.#cancelTimer = null;
	}
}

function scheduleRefresh(callback: () => void, delayMs: number): () => void {
	const timer = setTimeout(callback, delayMs);
	return () => clearTimeout(timer);
}
