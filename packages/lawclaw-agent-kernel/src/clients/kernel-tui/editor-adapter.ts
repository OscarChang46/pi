/** Pi Editor公开接口的最小结构类型；装配时传入真实Editor。 */
export interface TuiEditor {
	/** 返回展开粘贴内容后的正文。 */
	getExpandedText(): string;

	/** 程序化替换编辑内容，会触发onChange。 */
	setText(text: string): void;

	/** 由Pi处理补全、粘贴及编辑；本适配不重复解释编辑键。 */
	handleInput(input: string): void;

	/** 编辑内容变化通知；程序化修改由适配器抑制计数。 */
	onChange?: (text: string) => void;

	/** Pi先清空再调用；应用使用预先保存的正文。 */
	onSubmit?: (text: string) => void;
}

/** 单份内存草稿；revision只随用户编辑递增。 */
export interface TuiDraft {
	/** 当前有界正文，保留用户空白；渲染前仍需清洗。 */
	readonly text: string;

	/** 正文或草稿版本；用于拒绝异步旧结果。 */
	readonly revision: number;
}

/** 保护Pi提交清空之前的正文；不依赖私有字段，不承诺恢复undo历史。 */
export class EditorAdapter {
	readonly #editor: TuiEditor;
	readonly #submit: (draft: TuiDraft) => void;
	readonly #changed: (draft: TuiDraft) => void;
	#draft: TuiDraft;
	#programmatic = false;
	#turn: {
		/** 输入处理之前保存的草稿，不使用Pi已清空的内容。 */
		readonly before: TuiDraft;
		/** 本轮输入是否触发真正提交回调。 */
		submitted: boolean;
		/** 本轮输入是否改变了编辑内容。 */
		changed: boolean;
	} | null = null;
	#closed = false;

	/** 独占onChange/onSubmit直到dispose；提交用例在恢复编辑器之后的微任务执行。 */
	constructor(editor: TuiEditor, submit: (draft: TuiDraft) => void, changed: (draft: TuiDraft) => void) {
		if (editor.onChange || editor.onSubmit) throw new Error("TUI_EDITOR_CALLBACK_ALREADY_OWNED");
		this.#editor = editor;
		this.#submit = submit;
		this.#changed = changed;
		this.#draft = { text: editor.getExpandedText(), revision: 0 };
		editor.onChange = () => {
			if (this.#programmatic || this.#closed) return;
			if (this.#turn) this.#turn.changed = true;
			else this.#readUserEdit();
		};
		editor.onSubmit = () => {
			if (!this.#turn) throw new Error("TUI_EDITOR_SUBMIT_OUTSIDE_INPUT");
			this.#turn.submitted = true;
		};
	}

	/** 一次转发Pi输入；补全和粘贴是否提交由Pi判断。 */
	handleInput(input: string): void {
		if (this.#closed) return;
		if (this.#turn) throw new Error("TUI_EDITOR_REENTRANT_INPUT");
		const turn = {
			before: { text: this.#editor.getExpandedText(), revision: this.#draft.revision },
			submitted: false,
			changed: false,
		};
		this.#turn = turn;
		try {
			this.#editor.handleInput(input);
		} finally {
			this.#turn = null;
			if (turn.submitted) {
				this.#write(turn.before.text);
				queueMicrotask(() => {
					if (!this.#closed) this.#submit(turn.before);
				});
			} else if (turn.changed) this.#readUserEdit();
		}
	}

	/** accepted或命令完成后仅清除相同revision与正文；迟到回执保留新编辑。 */
	clearAccepted(submitted: TuiDraft): void {
		if (this.#closed || this.#draft.revision !== submitted.revision || this.#draft.text !== submitted.text) return;
		this.#write("");
		this.#draft = { text: "", revision: this.#draft.revision };
		this.#changed(this.#draft);
	}

	/** 解除本适配器的回调；已经排队的提交不再执行。 */
	dispose(): void {
		this.#closed = true;
		delete this.#editor.onChange;
		delete this.#editor.onSubmit;
	}

	#readUserEdit(): void {
		this.#draft = { text: this.#editor.getExpandedText(), revision: this.#draft.revision + 1 };
		this.#changed(this.#draft);
	}

	#write(text: string): void {
		this.#programmatic = true;
		try {
			this.#editor.setText(text);
		} finally {
			this.#programmatic = false;
		}
	}
}
