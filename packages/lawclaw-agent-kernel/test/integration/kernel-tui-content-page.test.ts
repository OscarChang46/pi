import assert from "node:assert/strict";
import { test } from "node:test";
import { ContentPage, type ContentPageState } from "../../src/clients/kernel-tui/content-page.ts";
import type { TuiContentClient, TuiContentPage } from "../../src/contracts/kernel-tui.ts";

test("[AK-TUI-008] 中文码点分页，失败保留当前页，旧版本不拼接", async (context) => {
	const states: ContentPageState[] = [];
	let calls = 0;
	const client: TuiContentClient = {
		getContent: async (_ref, cursor) => {
			calls++;
			if (calls === 2) throw new Error("network");
			if (calls === 3) return { contentRef: "c", revision: 2, offset: 2, text: "新", nextCursor: null };
			assert.equal(cursor, null);
			return { contentRef: "c", revision: 1, offset: 0, text: "中😀", nextCursor: "next" };
		},
	};
	const view = new ContentPage(client, (state) => states.push(state));
	context.after(() => view.close());
	await view.open("c");
	await view.next();
	assert.equal(states.at(-1)?.page?.text, "中😀");
	await view.next();
	assert.equal(states.at(-1)?.page?.revision, 1);
	await view.next();
	assert.equal(calls, 3);
	view.close();
	assert.equal(states.at(-1)?.page, null);
});

test("[AK-TUI-009] 返回后迟到正文不能恢复已关闭页", async () => {
	const states: ContentPageState[] = [];
	const resolvers: ((page: TuiContentPage) => void)[] = [];
	const view = new ContentPage({ getContent: () => new Promise((resolve) => resolvers.push(resolve)) }, (state) =>
		states.push(state),
	);
	const pending = view.open("c");
	view.close();
	resolvers[0]({ contentRef: "c", revision: 1, offset: 0, text: "迟到", nextCursor: null });
	await pending;
	assert.equal(states.at(-1)?.contentRef, null);
});
