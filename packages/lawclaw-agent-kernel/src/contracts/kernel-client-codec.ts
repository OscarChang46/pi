import type {
	KernelAcceptedReceipt,
	KernelBoundaryError,
	KernelCancelReceipt,
	KernelCommandRecord,
	KernelConversationReceipt,
	KernelInitialization,
	KernelPage,
	KernelPublicMessage,
	KernelRunView,
	KernelSelection,
	KernelSessionAnchor,
	KernelSessionView,
} from "./kernel-client.ts";
import type { TuiContentPage, TuiStreamEvent } from "./kernel-tui.ts";

/** 外部协议不满足封闭结构时停止消费，不填补默认成功值。 */
export class KernelProtocolError extends Error {
	/** 构造不包含输入正文的稳定协议错误。 */
	constructor() {
		super("KERNEL_PROTOCOL_INVALID");
	}
}

/** 有界 JSON 读取；拒绝重复对象键及过深输入，避免摘要与解码看到不同载荷。 */
export function parseKernelJson(body: string, maxBytes = 65536): unknown {
	if (Buffer.byteLength(body) > maxBytes) throw new KernelProtocolError();
	const value: unknown = JSON.parse(body);
	const stack: { keys: Set<string> | null; expectingKey: boolean }[] = [];
	for (const match of body.matchAll(/"(?:[^"\\]|\\.)*"|[{}[\],:]/gu)) {
		const token = match[0];
		if (token === "{" || token === "[") {
			stack.push({ keys: token === "{" ? new Set() : null, expectingKey: token === "{" });
			if (stack.length > 32) throw new KernelProtocolError();
		} else if (token === "}" || token === "]") stack.pop();
		else {
			const current = stack.at(-1);
			if (!current?.keys) continue;
			if (token === ",") current.expectingKey = true;
			else if (token === ":") current.expectingKey = false;
			else if (current.expectingKey) {
				const key: string = JSON.parse(token);
				if (current.keys.has(key)) throw new KernelProtocolError();
				current.keys.add(key);
			}
		}
	}
	return value;
}

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new KernelProtocolError();
	if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key)))
		throw new KernelProtocolError();
	return value as Record<string, unknown>;
}
function text(value: unknown, maxBytes = 128): string {
	if (typeof value !== "string" || Buffer.byteLength(value) > maxBytes) throw new KernelProtocolError();
	return value;
}
function ref(value: unknown): string {
	const result = text(value);
	if (!result.length) throw new KernelProtocolError();
	return result;
}
function number(value: unknown): number {
	if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new KernelProtocolError();
	return value;
}
function boolean(value: unknown): boolean {
	if (typeof value !== "boolean") throw new KernelProtocolError();
	return value;
}
function nullable<T>(value: unknown, decode: (value: unknown) => T): T | null {
	return value === null ? null : decode(value);
}
function selection(value: unknown): KernelSelection {
	const item = object(value, ["agentId", "modelId"]);
	return { agentId: ref(item.agentId), modelId: nullable(item.modelId, ref) };
}
function anchor(value: unknown): KernelSessionAnchor {
	const item = object(value, ["sessionId", "version", "headRef"]);
	return { sessionId: ref(item.sessionId), version: number(item.version), headRef: ref(item.headRef) };
}
function message(value: unknown): KernelPublicMessage {
	const item = object(value, ["messageId", "runId", "role", "text", "revision", "contentRef"]);
	if (item.role !== "user" && item.role !== "assistant") throw new KernelProtocolError();
	return {
		messageId: ref(item.messageId),
		runId: ref(item.runId),
		role: item.role,
		text: text(item.text, 8192),
		revision: number(item.revision),
		contentRef: nullable(item.contentRef, ref),
	};
}
function page<T>(value: unknown, decode: (value: unknown) => T): KernelPage<T> {
	const item = object(value, ["items", "nextCursor", "snapshotRef"]);
	if (!Array.isArray(item.items) || item.items.length > 64) throw new KernelProtocolError();
	return {
		items: item.items.map(decode),
		nextCursor: nullable(item.nextCursor, ref),
		snapshotRef: ref(item.snapshotRef),
	};
}

/** 解码边界错误，禁止透出内部堆栈字段。 */
export function decodeBoundaryError(value: unknown): KernelBoundaryError {
	const item = object(value, ["code", "message", "retryable"]);
	return { code: ref(item.code), message: text(item.message, 4096), retryable: boolean(item.retryable) };
}
/** 解码初始化结果，拒绝不兼容的主协议与无效限额。 */
export function decodeInitialization(value: unknown): KernelInitialization {
	const item = object(value, [
		"hostInstanceId",
		"scopeId",
		"connectionId",
		"protocolVersion",
		"capabilities",
		"limits",
		"defaultSelection",
	]);
	if (item.protocolVersion !== "1.0" || !Array.isArray(item.capabilities) || item.capabilities.length > 32)
		throw new KernelProtocolError();
	const limits = object(item.limits, ["maxFrameBytes", "maxInflight", "maxEventWindow"]);
	const decodedLimits = {
		maxFrameBytes: number(limits.maxFrameBytes),
		maxInflight: number(limits.maxInflight),
		maxEventWindow: number(limits.maxEventWindow),
	};
	if (Object.values(decodedLimits).some((value) => value < 1)) throw new KernelProtocolError();
	return {
		hostInstanceId: ref(item.hostInstanceId),
		scopeId: ref(item.scopeId),
		connectionId: ref(item.connectionId),
		protocolVersion: "1.0",
		capabilities: item.capabilities.map(ref),
		limits: decodedLimits,
		defaultSelection: nullable(item.defaultSelection, selection),
	};
}
/** 解码 Run 权威快照；第一阶段不协商详情能力。 */
export function decodeRunView(value: unknown): KernelRunView {
	const item = object(value, [
		"runId",
		"sessionId",
		"version",
		"attemptId",
		"state",
		"cancellationRequested",
		"eventSequence",
		"outputRevision",
		"messages",
		"frozenSelection",
		"details",
		"error",
	]);
	const state = item.state;
	if (
		state !== "queued" &&
		state !== "running" &&
		state !== "waiting_approval" &&
		state !== "suspended" &&
		state !== "completed" &&
		state !== "failed" &&
		state !== "cancelled"
	)
		throw new KernelProtocolError();
	const messages = page(item.messages, message);
	const runId = ref(item.runId);
	if (messages.items.some((item) => item.runId !== runId)) throw new KernelProtocolError();
	return {
		runId,
		sessionId: ref(item.sessionId),
		version: number(item.version),
		attemptId: nullable(item.attemptId, ref),
		state,
		cancellationRequested: boolean(item.cancellationRequested),
		eventSequence: number(item.eventSequence),
		outputRevision: number(item.outputRevision),
		messages,
		frozenSelection: selection(item.frozenSelection),
		details: page(item.details, (): never => {
			throw new KernelProtocolError();
		}),
		error: nullable(item.error, decodeBoundaryError),
	};
}
/** 解码会话历史及下一轮资格；不根据 Run 终态猜测 historyReady。 */
export function decodeSessionView(value: unknown): KernelSessionView {
	const item = object(value, ["anchor", "agentId", "defaultSelection", "activeRunId", "history", "historyReady"]);
	return {
		anchor: anchor(item.anchor),
		agentId: ref(item.agentId),
		defaultSelection: selection(item.defaultSelection),
		activeRunId: nullable(item.activeRunId, ref),
		history: page(item.history, message),
		historyReady: boolean(item.historyReady),
	};
}
/** 准备与受理回执必须各自具备完整字段。 */
export function decodeConversationReceipt(value: unknown): KernelConversationReceipt {
	if (typeof value !== "object" || value === null || !("state" in value)) throw new KernelProtocolError();
	if (value.state === "preparing") {
		const item = object(value, ["commandId", "state", "sessionId", "runId"]);
		if (item.sessionId !== null || item.runId !== null) throw new KernelProtocolError();
		return { commandId: ref(item.commandId), state: "preparing", sessionId: null, runId: null };
	}
	const item = object(value, ["commandId", "state", "sessionId", "runId", "anchor", "frozenSelection"]);
	if (item.state !== "accepted") throw new KernelProtocolError();
	const result: KernelAcceptedReceipt = {
		commandId: ref(item.commandId),
		state: "accepted",
		sessionId: ref(item.sessionId),
		runId: ref(item.runId),
		anchor: anchor(item.anchor),
		frozenSelection: selection(item.frozenSelection),
	};
	if (result.sessionId !== result.anchor.sessionId) throw new KernelProtocolError();
	return result;
}
/** 取消回执内的终态必须属于原目标且确实终结。 */
export function decodeCancelReceipt(value: unknown): KernelCancelReceipt {
	const item = object(value, ["commandId", "runId", "cancellationRequested", "terminal"]);
	const result = {
		commandId: ref(item.commandId),
		runId: ref(item.runId),
		cancellationRequested: boolean(item.cancellationRequested),
		terminal: nullable(item.terminal, decodeRunView),
	};
	if (
		result.terminal &&
		(result.terminal.runId !== result.runId || !["completed", "failed", "cancelled"].includes(result.terminal.state))
	)
		throw new KernelProtocolError();
	return result;
}
/** 原命令查询不得混淆写入类别或用不同命令的回执解决 pending。 */
export function decodeCommandRecord(value: unknown): KernelCommandRecord {
	if (typeof value !== "object" || value === null || !("state" in value)) throw new KernelProtocolError();
	const item = object(value, ["operation", "commandId", "state", value.state === "rejected" ? "error" : "receipt"]);
	const commandId = ref(item.commandId);
	if (item.operation !== "submit" && item.operation !== "cancel") throw new KernelProtocolError();
	if (item.state === "rejected")
		return { operation: item.operation, commandId, state: "rejected", error: decodeBoundaryError(item.error) };
	if (item.operation === "cancel") {
		const receipt = decodeCancelReceipt(item.receipt);
		if (item.state !== "accepted" || receipt.commandId !== commandId) throw new KernelProtocolError();
		return { operation: "cancel", commandId, state: "accepted", receipt };
	}
	const receipt = decodeConversationReceipt(item.receipt);
	if (receipt.commandId !== commandId || receipt.state !== item.state) throw new KernelProtocolError();
	return receipt.state === "accepted"
		? { operation: "submit", commandId, state: "accepted", receipt }
		: { operation: "submit", commandId, state: "preparing", receipt };
}
/** 正文按 Unicode 码点偏移，页大小按 UTF-8 字节检查。 */
export function decodeContentPage(value: unknown): TuiContentPage {
	const item = object(value, ["contentRef", "revision", "offset", "text", "nextCursor"]);
	return {
		contentRef: ref(item.contentRef),
		revision: number(item.revision),
		offset: number(item.offset),
		text: text(item.text, 8192),
		nextCursor: nullable(item.nextCursor, ref),
	};
}
/** SSE 数据帧封闭解码；未知事件必须中止订阅。 */
export function decodeStreamEvent(value: unknown): TuiStreamEvent {
	if (typeof value !== "object" || value === null || !("kind" in value)) throw new KernelProtocolError();
	const kind = value.kind;
	if (kind === "text.start" || kind === "text.delta" || kind === "text.end") {
		const fields = ["kind", "runId", "attemptId", "streamId", "blockId"];
		if (kind !== "text.end")
			fields.push("baseOutputRevision", ...(kind === "text.start" ? ["prefix"] : ["offset", "text"]));
		const item = object(value, fields);
		const identity = {
			runId: ref(item.runId),
			attemptId: ref(item.attemptId),
			streamId: ref(item.streamId),
			blockId: ref(item.blockId),
		};
		if (kind === "text.end") return { ...identity, kind };
		const baseOutputRevision = number(item.baseOutputRevision);
		return kind === "text.start"
			? { ...identity, kind, baseOutputRevision, prefix: text(item.prefix, 32768) }
			: { ...identity, kind, baseOutputRevision, offset: number(item.offset), text: text(item.text, 8192) };
	}
	if (
		kind !== "run.updated" &&
		kind !== "message.committed" &&
		kind !== "tool.updated" &&
		kind !== "child.updated" &&
		kind !== "approval.updated"
	)
		throw new KernelProtocolError();
	const item = object(value, ["kind", "runId", "sequence", "version"]);
	return { kind, runId: ref(item.runId), sequence: number(item.sequence), version: number(item.version) };
}
