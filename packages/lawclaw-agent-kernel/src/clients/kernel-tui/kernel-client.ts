import { randomUUID } from "node:crypto";
import type {
	KernelBoundaryError,
	KernelConversationClient,
	KernelConversationInput,
	KernelRunView,
} from "../../contracts/kernel-client.ts";
import {
	decodeBoundaryError,
	decodeCancelReceipt,
	decodeCommandRecord,
	decodeContentPage,
	decodeConversationReceipt,
	decodeInitialization,
	decodeRunView,
	decodeSessionView,
	decodeStreamEvent,
	KernelProtocolError,
	parseKernelJson,
} from "../../contracts/kernel-client-codec.ts";
import type { TuiObservationClient, TuiStreamEvent } from "../../contracts/kernel-tui.ts";

const MAX_FRAME_BYTES = 65536;
const REQUEST_TIMEOUT_MS = 5000;
const STREAM_IDLE_MS = 30000;

/** 服务明确返回的边界错误；网络失败和解码失败不会伪装成明确拒绝。 */
export class KernelRequestError extends Error {
	/** 服务返回的安全错误详情。 */
	readonly detail: KernelBoundaryError;
	/** 原 HTTP 状态。 */
	readonly status: number;
	/** 保存明确拒绝，与网络未知区分。 */
	constructor(status: number, detail: KernelBoundaryError) {
		super(detail.message);
		this.status = status;
		this.detail = detail;
	}
}

/** 本机 HTTP/SSE 客户端；凭据不进入视图或恢复文件，写操作仅发送一次。 */
export class KernelHttpClient implements KernelConversationClient, TuiObservationClient<KernelRunView> {
	readonly #endpoint: string;
	readonly #credential: string;
	#connectionId: string | null = null;
	#hostInstanceId: string | null = null;
	#frameBytes = MAX_FRAME_BYTES;

	/** 仅连接字面本机地址，不跟随重定向或泄露凭据。 */
	constructor(endpoint: string, credential: string) {
		const url = new URL(endpoint);
		if (
			url.protocol !== "http:" ||
			!["127.0.0.1", "[::1]"].includes(url.hostname) ||
			url.username ||
			url.password ||
			url.search ||
			url.hash ||
			url.pathname !== "/"
		)
			throw new Error("TUI_LOCAL_ENDPOINT_REQUIRED");
		if (!credential || /[\r\n]/u.test(credential)) throw new Error("TUI_CREDENTIAL_INVALID");
		this.#endpoint = url.origin;
		this.#credential = credential;
	}
	/** 每次重连重新协商，不沿用旧宿主的连接身份。 */
	async initialize(signal: AbortSignal) {
		const value = decodeInitialization(
			await this.#request("POST", "/v1/initialize", signal, {
				supportedMajor: [1],
				requestedCapabilities: ["conversation", "stream", "commandLookup"],
			}),
		);
		for (const required of ["conversation", "stream", "commandLookup"])
			if (!value.capabilities.includes(required)) throw new Error("TUI_REQUIRED_CAPABILITY_MISSING");
		this.#connectionId = value.connectionId;
		this.#hostInstanceId = value.hostInstanceId;
		this.#frameBytes = Math.min(MAX_FRAME_BYTES, value.limits.maxFrameBytes);
		return value;
	}
	/** 一次提交；未知结果交回调用方保存并查询。 */
	async submit(commandId: string, input: KernelConversationInput, signal: AbortSignal) {
		const receipt = decodeConversationReceipt(
			await this.#request("POST", "/v1/conversation-commands", signal, input, commandId),
		);
		if (receipt.commandId !== commandId) throw new KernelProtocolError();
		return receipt;
	}
	/** 查询并核对原命令身份。 */
	async getCommand(commandId: string, signal: AbortSignal) {
		const record = decodeCommandRecord(
			await this.#request("GET", `/v1/commands/${encodeURIComponent(commandId)}`, signal),
		);
		if (record.commandId !== commandId) throw new KernelProtocolError();
		return record;
	}
	/** 查询已确认会话，拒绝身份错配。 */
	async getSession(sessionId: string, signal: AbortSignal) {
		const session = decodeSessionView(
			await this.#request("GET", `/v1/sessions/${encodeURIComponent(sessionId)}`, signal),
		);
		if (session.anchor.sessionId !== sessionId) throw new KernelProtocolError();
		return session;
	}
	/** 查询已确认 Run，不从通知推断终态。 */
	async getRun(runId: string, signal: AbortSignal) {
		const run = decodeRunView(await this.#request("GET", `/v1/runs/${encodeURIComponent(runId)}`, signal));
		if (run.runId !== runId) throw new KernelProtocolError();
		return run;
	}
	/** 请求取消一次；返回回执不代表执行停止。 */
	async cancel(commandId: string, runId: string, signal: AbortSignal) {
		const receipt = decodeCancelReceipt(
			await this.#request("POST", `/v1/runs/${encodeURIComponent(runId)}/cancel`, signal, {}, commandId),
		);
		if (receipt.commandId !== commandId || receipt.runId !== runId) throw new KernelProtocolError();
		return receipt;
	}
	/** 固定内容版本分页读取；不拼接不同版本正文。 */
	async getContent(contentRef: string, cursor: string | null, signal: AbortSignal) {
		const path = `/v1/contents/${encodeURIComponent(contentRef)}${cursor === null ? "" : `?cursor=${encodeURIComponent(cursor)}`}`;
		const page = decodeContentPage(await this.#request("GET", path, signal));
		if (page.contentRef !== contentRef) throw new KernelProtocolError();
		return page;
	}
	/** 订阅、ACK 与心跳由 signal 统一释放；断线交给连接模块恢复。 */
	subscribe(
		runId: string,
		after: number,
		signal: AbortSignal,
		notice: (event: TuiStreamEvent) => void,
		failure: (error: unknown) => void,
	): void {
		void this.#stream(runId, after, signal, notice).catch((error) => {
			if (!signal.aborted) failure(error);
		});
	}

	#headers(meta: object, method: string): Record<string, string> {
		return {
			Authorization: `Bearer ${this.#credential}`,
			...(this.#connectionId ? { "X-Lawclaw-Connection": this.#connectionId } : {}),
			...(method === "GET"
				? { "X-Lawclaw-Request-Meta": JSON.stringify(meta) }
				: { "Content-Type": "application/json" }),
		};
	}
	#meta(commandId?: string) {
		return {
			protocolVersion: "1.0",
			requestId: randomUUID(),
			traceparent: `00-${randomUUID().replaceAll("-", "")}-${randomUUID().replaceAll("-", "").slice(0, 16)}-01`,
			correlationId: commandId ?? randomUUID(),
			deadlineUtc: new Date(Date.now() + REQUEST_TIMEOUT_MS).toISOString(),
			...(commandId ? { commandId, idempotencyKey: commandId } : {}),
		};
	}
	async #request(
		method: string,
		path: string,
		signal: AbortSignal,
		input?: unknown,
		commandId?: string,
	): Promise<unknown> {
		const meta = this.#meta(commandId);
		const body = method === "GET" ? undefined : JSON.stringify({ meta, input });
		if (body && Buffer.byteLength(body) > this.#frameBytes) throw new Error("TUI_FRAME_LIMIT");
		const response = await fetch(this.#endpoint + path, {
			method,
			headers: this.#headers(meta, method),
			...(body ? { body } : {}),
			signal: AbortSignal.any([signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
			redirect: "error",
		});
		const value = await readJsonResponse(response, this.#frameBytes);
		if (!response.ok) throw decodeResponseError(response.status, value);
		return value;
	}

	async #stream(
		runId: string,
		after: number,
		signal: AbortSignal,
		notice: (event: TuiStreamEvent) => void,
	): Promise<void> {
		if (!Number.isSafeInteger(after) || after < 0) throw new KernelProtocolError();
		const controller = new AbortController();
		const combined = AbortSignal.any([signal, controller.signal]);
		let idle = setTimeout(() => controller.abort(new Error("TUI_STREAM_TIMEOUT")), STREAM_IDLE_MS);
		let ackTimer: ReturnType<typeof setTimeout> | undefined;
		let subscriptionId: string | null = null;
		let sequence = after;
		let acknowledged = after;
		let acknowledging = false;
		let ackFailure: unknown;
		const acknowledge = async () => {
			if (acknowledging || !subscriptionId || sequence === acknowledged || combined.aborted) return;
			acknowledging = true;
			const cut = sequence;
			try {
				const result = await this.#request(
					"POST",
					`/v1/subscriptions/${encodeURIComponent(subscriptionId)}/ack`,
					combined,
					{ sequence: cut },
				);
				if (
					typeof result !== "object" ||
					result === null ||
					Object.keys(result).length !== 1 ||
					!("acknowledgedSequence" in result) ||
					result.acknowledgedSequence !== cut
				)
					throw new KernelProtocolError();
				acknowledged = cut;
			} catch (error) {
				ackFailure = error;
				controller.abort(error);
			} finally {
				acknowledging = false;
				if (!combined.aborted && sequence > acknowledged && !ackTimer) {
					ackTimer = setTimeout(() => {
						ackTimer = undefined;
						void acknowledge();
					}, 250);
				}
			}
		};
		try {
			const response = await fetch(`${this.#endpoint}/v1/runs/${encodeURIComponent(runId)}/stream?after=${after}`, {
				headers: this.#headers(this.#meta(), "GET"),
				signal: combined,
				redirect: "error",
			});
			if (!response.ok)
				throw decodeResponseError(response.status, await readJsonResponse(response, this.#frameBytes));
			if (!response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body)
				throw new KernelProtocolError();
			const decoder = new TextDecoder("utf-8", { fatal: true });
			let buffer = "";
			for await (const chunk of response.body) {
				buffer += decoder.decode(chunk, { stream: true });
				buffer = buffer.replaceAll("\r\n", "\n");
				let end = buffer.indexOf("\n\n");
				while (end >= 0) {
					const frame = buffer.slice(0, end);
					buffer = buffer.slice(end + 2);
					if (Buffer.byteLength(frame) > this.#frameBytes) throw new KernelProtocolError();
					clearTimeout(idle);
					idle = setTimeout(() => controller.abort(new Error("TUI_STREAM_TIMEOUT")), STREAM_IDLE_MS);
					const data = frame
						.split("\n")
						.filter((line) => line.startsWith("data:"))
						.map((line) => line.slice(5).trimStart())
						.join("\n");
					if (data) {
						const value = parseKernelJson(data, this.#frameBytes);
						if (!subscriptionId) {
							if (
								typeof value !== "object" ||
								value === null ||
								!("kind" in value) ||
								value.kind !== "subscription.ready" ||
								!("hostInstanceId" in value) ||
								value.hostInstanceId !== this.#hostInstanceId ||
								!("subscriptionId" in value) ||
								typeof value.subscriptionId !== "string" ||
								!value.subscriptionId ||
								Buffer.byteLength(value.subscriptionId) > 128 ||
								Object.keys(value).length !== 3
							)
								throw new KernelProtocolError();
							subscriptionId = value.subscriptionId;
						} else {
							const event = decodeStreamEvent(value);
							if (event.runId !== runId) throw new KernelProtocolError();
							notice(event);
							if ("sequence" in event) {
								sequence = Math.max(sequence, event.sequence);
								if (sequence - acknowledged >= 32) void acknowledge();
								else if (!ackTimer)
									ackTimer = setTimeout(() => {
										ackTimer = undefined;
										void acknowledge();
									}, 250);
							}
						}
					}
					end = buffer.indexOf("\n\n");
				}
				if (Buffer.byteLength(buffer) > this.#frameBytes) throw new KernelProtocolError();
			}
			throw new Error("TUI_STREAM_CLOSED");
		} catch (error) {
			throw ackFailure ?? error;
		} finally {
			clearTimeout(idle);
			clearTimeout(ackTimer);
			controller.abort();
		}
	}
}

function decodeResponseError(status: number, value: unknown): KernelRequestError {
	if (typeof value !== "object" || value === null || !("error" in value) || Object.keys(value).length !== 1)
		throw new KernelProtocolError();
	return new KernelRequestError(status, decodeBoundaryError(value.error));
}

async function readJsonResponse(response: Response, limit: number): Promise<unknown> {
	if (!response.body || !response.headers.get("content-type")?.startsWith("application/json"))
		throw new KernelProtocolError();
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	try {
		while (true) {
			const chunk = await reader.read();
			if (chunk.done) break;
			bytes += chunk.value.length;
			if (bytes > limit) throw new KernelProtocolError();
			chunks.push(chunk.value);
		}
		return parseKernelJson(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), limit);
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
}
