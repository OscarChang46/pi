/** TUI-CON-001中当前观察与正文读取需要的公开投影，不导入内核执行状态。 */
export interface TuiRunSnapshot {
	/** 服务分配的Run引用，不作为访问授权。 */
	readonly runId: string;

	/** 服务快照版本；旧版本不得覆盖当前投影。 */
	readonly version: number;

	/** 快照包含的耐久事件cut，订阅从此序号之后开始。 */
	readonly eventSequence: number;

	/** 已保存输出版本；变化时重新建立临时流。 */
	readonly outputRevision: number;

	/** 当前执行代次；尚未执行时为null。 */
	readonly attemptId: string | null;

	/** 服务公开执行状态，只有明确终态才表示任务结束。 */
	readonly state: "queued" | "running" | "waiting_approval" | "suspended" | "completed" | "failed" | "cancelled";
}

/** 耐久事件只通知快照变化，不携带终态或可重放的领域载荷。 */
export interface TuiRunNotice {
	/** 服务分配的Run引用，不作为访问授权。 */
	readonly runId: string;

	/** 目标Run内连续耐久序号；重复允许，缺口触发重建。 */
	readonly sequence: number;

	/** 服务快照版本；旧版本不得覆盖当前投影。 */
	readonly version: number;

	/** 封闭变体判别字段，不根据其他字段猜测类型。 */
	readonly kind: "run.updated" | "message.committed" | "tool.updated" | "child.updated" | "approval.updated";
}

/** 单个公开正文块；cursor由服务固定到相同内容版本。 */
export interface TuiContentPage {
	/** 服务公开正文引用；视图关闭时为null。 */
	readonly contentRef: string;

	/** 正文或草稿版本；用于拒绝异步旧结果。 */
	readonly revision: number;

	/** 当前块首字符的Unicode码点偏移，不是UTF-16下标。 */
	readonly offset: number;

	/** 当前有界正文，保留用户空白；渲染前仍需清洗。 */
	readonly text: string;

	/** 固定版本的后续页游标；null表示末页。 */
	readonly nextCursor: string | null;
}

/** 非耐久文本流身份；不占用Run事件序号。 */
export interface TuiTextIdentity {
	/** 服务分配的Run引用，不作为访问授权。 */
	readonly runId: string;

	/** 当前执行代次；尚未执行时为null。 */
	readonly attemptId: string;

	/** 临时文本流身份；不能跨订阅代次复用投影。 */
	readonly streamId: string;

	/** 当前公开文本块引用。 */
	readonly blockId: string;
}

/** start提供可重建前缀，end仅关闭文本块，不表示Run完成。 */
export type TuiTextEvent =
	| (TuiTextIdentity & {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "text.start";
			/** 临时文本所依据的持久输出版本。 */
			readonly baseOutputRevision: number;
			/** 服务提供的当前块完整前缀，最多32KiB。 */
			readonly prefix: string;
	  })
	| (TuiTextIdentity & {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "text.delta";

			/** 临时文本所依据的持久输出版本。 */
			readonly baseOutputRevision: number;

			/** 当前块首字符的Unicode码点偏移，不是UTF-16下标。 */
			readonly offset: number;

			/** 当前有界正文，保留用户空白；渲染前仍需清洗。 */
			readonly text: string;
	  })
	| (TuiTextIdentity & {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "text.end";
	  });

/** 经过传输解码的公开流消息，不包含心跳和ACK等传输帧。 */
export type TuiStreamEvent = TuiRunNotice | TuiTextEvent;

/** 可独立替身验证的观察端口；实现方须先完成协议与作用域校验。 */
export interface TuiObservationClient<T extends TuiRunSnapshot> {
	/** 返回同一cut的快照；失败抛错，不能用空快照替代。 */
	getRun(runId: string, signal: AbortSignal): Promise<T>;
	/** 订阅由signal关闭；禁止回调执行模型或工具，传输错误单独通知。 */
	subscribe(
		runId: string,
		after: number,
		signal: AbortSignal,
		notice: (event: TuiStreamEvent) => void,
		failure: (error: unknown) => void,
	): void;
}

/** 正文读取端口，供前台单页视图使用。 */
export interface TuiContentClient {
	/** null cursor读取首页；无权、过期或网络失败均抛错。 */
	getContent(contentRef: string, cursor: string | null, signal: AbortSignal): Promise<TuiContentPage>;
}

/** 本地恢复记录的可信归属；必须与initialize和Launcher结果一致。 */
export interface TuiResumeScope {
	/** Launcher确认的配置归属键。 */
	readonly profileKey: string;

	/** 服务确认的访问作用域，恢复时必须匹配。 */
	readonly scopeId: string;
}

/** 本地定位书签不是服务事实；恢复时仍须查询校验权限与最新状态。 */
export interface TuiBookmark extends TuiResumeScope {
	/** 本地记录格式版本；未知版本拒绝恢复。 */
	readonly schemaVersion: 1;

	/** 已确认Session引用；尚无会话时为null。 */
	readonly sessionId: string | null;

	/** 服务分配的Run引用，不作为访问授权。 */
	readonly runId: string | null;
}
