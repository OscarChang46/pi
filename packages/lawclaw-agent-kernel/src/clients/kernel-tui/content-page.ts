import type { TuiContentClient, TuiContentPage } from "../../contracts/kernel-tui.ts";

/** 正文分页不与实时Run视图共享写入目标。 */
export interface ContentPageState {
	/** 服务公开正文引用；视图关闭时为null。 */
	readonly contentRef: string | null;

	/** 当前已确认页；加载首块前或关闭后为null。 */
	readonly page: TuiContentPage | null;

	/** 当前视图是否已有查询在途，防止重复翻页。 */
	readonly loading: boolean;

	/** 当前失败原因；null表示没有错误，不构造成功默认值。 */
	readonly error: unknown;
}

/** 一次只保留一个正文块；返回Run后释放，不维护历史页缓存。 */
export class ContentPage {
	readonly #client: TuiContentClient;
	readonly #publish: (state: ContentPageState) => void;
	#state: ContentPageState = { contentRef: null, page: null, loading: false, error: null };
	#query: AbortController | null = null;
	#expired = false;

	/** 注入已完成权限和协议验证的内容读取端口。 */
	constructor(client: TuiContentClient, publish: (state: ContentPageState) => void) {
		this.#client = client;
		this.#publish = publish;
	}

	/** 打开首块；替换目标会中止旧查询。 */
	async open(contentRef: string): Promise<void> {
		this.close();
		this.#state = { contentRef, page: null, loading: false, error: null };
		await this.#read(null);
	}

	/** 只在有下一块且无查询在途时读取；重复操作不发请求。 */
	async next(): Promise<void> {
		if (!this.#query && !this.#expired && this.#state.page?.nextCursor) {
			await this.#read(this.#state.page.nextCursor);
		}
	}

	/** /back或切会话只释放本视图，不影响Run订阅。 */
	close(): void {
		this.#query?.abort();
		this.#query = null;
		this.#expired = false;
		this.#state = { contentRef: null, page: null, loading: false, error: null };
		this.#publish(this.#state);
	}

	async #read(cursor: string | null): Promise<void> {
		const contentRef = this.#state.contentRef;
		if (!contentRef) return;
		const query = new AbortController();
		this.#query = query;
		this.#state = { ...this.#state, loading: true, error: null };
		this.#publish(this.#state);
		try {
			const page = await this.#client.getContent(contentRef, cursor, query.signal);
			if (query.signal.aborted) return;
			if (page.contentRef !== contentRef || (cursor !== null && page.revision !== this.#state.page?.revision)) {
				this.#expired = true;
				throw new Error("TUI_CONTENT_VERSION_CHANGED");
			}
			const expectedOffset =
				cursor === null ? 0 : (this.#state.page?.offset ?? 0) + Array.from(this.#state.page?.text ?? "").length;
			if (page.offset !== expectedOffset) throw new Error("TUI_CONTENT_OFFSET_MISMATCH");
			this.#state = { contentRef, page, loading: false, error: null };
		} catch (error) {
			if (query.signal.aborted) return;
			this.#state = { ...this.#state, loading: false, error };
		} finally {
			if (this.#query === query) {
				this.#query = null;
				this.#publish(this.#state);
			}
		}
	}
}
