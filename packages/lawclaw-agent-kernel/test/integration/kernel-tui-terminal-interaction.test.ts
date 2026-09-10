import assert from "node:assert/strict";
import { test } from "node:test";
import { Editor } from "../../../tui/src/components/editor.ts";
import { TuiMainScreen } from "../../../tui/src/tui-main-screen.ts";
import { defaultEditorTheme } from "../../../tui/test/test-themes.ts";
import { VirtualTerminal } from "../../../tui/test/virtual-terminal.ts";
import { EditorAdapter, type TuiDraft } from "../../src/clients/kernel-tui/editor-adapter.ts";
import { parseTuiInput } from "../../src/clients/kernel-tui/terminal-input.ts";

test("[AK-TUI-005] 真实Pi Editor先清空时保护原文且迟到accepted不清新草稿", async (context) => {
	const editor = new Editor(new TuiMainScreen(new VirtualTerminal(80, 24)), defaultEditorTheme);
	const submissions: TuiDraft[] = [];
	const adapter = new EditorAdapter(
		editor,
		(draft) => submissions.push(draft),
		() => {},
	);
	context.after(() => adapter.dispose());
	const text = "  中文问题  ";
	adapter.handleInput(text);
	adapter.handleInput("\r");
	assert.equal(editor.getExpandedText(), text);
	await Promise.resolve();
	assert.equal(submissions[0].text, text);
	adapter.handleInput("新草稿");
	const newer = editor.getExpandedText();
	adapter.clearAccepted(submissions[0]);
	assert.equal(editor.getExpandedText(), newer);
	assert.equal(submissions.length, 1);
});

test("[AK-TUI-006] 29列只拒绝普通对话，取消和退出保持可解析", () => {
	assert.deepEqual(parseTuiInput("继续", 29), { kind: "invalid", reason: "narrow" });
	assert.deepEqual(parseTuiInput("/cancel", 29), { kind: "command", name: "cancel", argument: null });
	assert.deepEqual(parseTuiInput("/quit", 29), { kind: "command", name: "quit", argument: null });
	assert.equal(parseTuiInput("/cancel\n正文", 80).kind, "conversation");
	assert.deepEqual(parseTuiInput("//cancel", 80), { kind: "conversation", text: "/cancel" });
});

test("[AK-TUI-007] 真实Pi bracketed paste不产生提交", async (context) => {
	const editor = new Editor(new TuiMainScreen(new VirtualTerminal(80, 24)), defaultEditorTheme);
	const submissions: TuiDraft[] = [];
	const adapter = new EditorAdapter(
		editor,
		(draft) => submissions.push(draft),
		() => {},
	);
	context.after(() => adapter.dispose());
	adapter.handleInput("\u001b[200~正文\n/cancel\u001b[201~");
	await Promise.resolve();
	assert.equal(editor.getExpandedText(), "正文\n/cancel");
	assert.equal(submissions.length, 0);
});
