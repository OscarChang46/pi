import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	type DelegationProviderPort,
	type DelegationRequest,
	type DelegationResult,
	KernelError,
	type RequestContext,
} from "../../contracts/index.ts";

function assistantText(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const record = value as Record<string, unknown>;
	const message = record.message;
	if (typeof message !== "object" || message === null) return undefined;
	const typedMessage = message as Record<string, unknown>;
	if (typedMessage.role !== "assistant" || !Array.isArray(typedMessage.content)) return undefined;
	const parts = typedMessage.content.flatMap((block) => {
		if (typeof block !== "object" || block === null) return [];
		const typedBlock = block as Record<string, unknown>;
		return typedBlock.type === "text" && typeof typedBlock.text === "string" ? [typedBlock.text] : [];
	});
	return parts.join("");
}

/**
 * 通过项目内固定版本 Pi CLI 执行单层子 Agent 的基础设施 Adapter。
 *
 * 传输：使用 JSONL RPC 从 stdin 发送任务，任务正文不会出现在进程参数中。
 * 隔离：关闭内置工具和自动资源发现，只显式加载 LawClaw 只读扩展。
 * 韧性：标准输出、执行时间、深度和取消均有界；不把 stderr 或凭据返回给父 Agent。
 */
export class PiCliDelegationProvider implements DelegationProviderPort {
	readonly #cliExecutable: string;
	readonly #cliEntry: string;
	readonly #extensionPath: string;
	readonly #childSystemPrompt: string;
	readonly #options: {
		/** 是否禁止 Pi CLI 启动时刷新远程资源目录。 */
		readonly offline: boolean;
		/** 子进程标准输出的最大累计字节数。 */
		readonly maxRpcStdoutBytes: number;
		/** SIGTERM 后等待 SIGKILL 的宽限时间，单位毫秒。 */
		readonly killGraceMs: number;
	};

	/** 注入 CLI 路径、扩展、子提示词和有界进程配置；构造时不启动进程。 */
	public constructor(
		cliExecutable: string,
		cliEntry: string,
		extensionPath: string,
		childSystemPrompt: string,
		options: {
			readonly offline: boolean;
			readonly maxRpcStdoutBytes: number;
			readonly killGraceMs: number;
		},
	) {
		this.#cliExecutable = cliExecutable;
		this.#cliEntry = cliEntry;
		this.#extensionPath = extensionPath;
		this.#childSystemPrompt = childSystemPrompt;
		this.#options = options;
	}

	/** 启动一个不可递归的 Pi CLI 子进程，并只返回最后一条助手文本摘要。 */
	public async executeChild(
		context: RequestContext,
		request: DelegationRequest,
		signal: AbortSignal,
	): Promise<DelegationResult> {
		signal.throwIfAborted();
		if (request.depth !== 0) {
			throw new KernelError("DELEGATION_NOT_ALLOWED", "Pi CLI Provider 只接受父 Run 发起的单层委派。");
		}

		const args = [
			this.#cliEntry,
			"--mode",
			"rpc",
			"--no-session",
			"--no-builtin-tools",
			"--no-extensions",
			"--no-skills",
			"--no-prompt-templates",
			"--no-context-files",
			"--extension",
			this.#extensionPath,
			"--system-prompt",
			this.#childSystemPrompt,
		];
		if (this.#options.offline) args.unshift("--offline");
		if (request.modelRef) args.push("--model", request.modelRef);

		return new Promise<DelegationResult>((resolve, reject) => {
			const child = spawn(this.#cliExecutable, args, {
				cwd: request.workspaceRoot,
				env: {
					...process.env,
					LAWCLAW_CHILD_DEPTH: "1",
					LAWCLAW_TENANT_ID: context.tenant.tenantId,
					LAWCLAW_PARENT_RUN_ID: request.parentRunId,
				},
				stdio: ["pipe", "pipe", "ignore"],
			});
			let settled = false;
			let stdoutBytes = 0;
			let pending = "";
			let finalText = "";

			const finishError = (message: string): void => {
				if (settled) return;
				settled = true;
				child.kill("SIGTERM");
				setTimeout(() => {
					if (child.exitCode === null) child.kill("SIGKILL");
				}, this.#options.killGraceMs).unref();
				reject(new KernelError("DELEGATION_LIMIT_EXCEEDED", message, true));
			};
			const onAbort = (): void => finishError("子 Agent 已取消或超时。");
			signal.addEventListener("abort", onAbort, { once: true });

			child.stdout.on("data", (chunk: Buffer) => {
				stdoutBytes += chunk.byteLength;
				if (stdoutBytes > this.#options.maxRpcStdoutBytes) {
					finishError("子 Agent RPC 输出超过上限。");
					return;
				}
				pending += chunk.toString("utf8");
				let newline = pending.indexOf("\n");
				while (newline >= 0) {
					const line = pending.slice(0, newline).replace(/\r$/u, "");
					pending = pending.slice(newline + 1);
					if (line !== "") {
						try {
							const parsed: unknown = JSON.parse(line);
							finalText = assistantText(parsed) ?? finalText;
							if (
								typeof parsed === "object" &&
								parsed !== null &&
								(parsed as Record<string, unknown>).type === "agent_end"
							) {
								child.stdin.end();
							}
						} catch {
							finishError("子 Agent 返回了无效 JSONL。 ");
							return;
						}
					}
					newline = pending.indexOf("\n");
				}
			});
			child.on("error", () => finishError("无法启动项目内 Pi CLI。"));
			child.stdin.on("error", () => finishError("无法向 Pi CLI 子 Agent 写入 JSONL 命令。"));
			child.on("close", (code) => {
				signal.removeEventListener("abort", onAbort);
				if (settled) return;
				settled = true;
				if (code !== 0 || finalText.trim() === "") {
					reject(new KernelError("DELEGATION_LIMIT_EXCEEDED", "子 Agent 未正常返回结果。", true));
					return;
				}
				resolve({ childRunId: randomUUID(), summary: finalText, status: "completed" });
			});

			child.stdin.write(`${JSON.stringify({ id: request.delegationId, type: "prompt", message: request.task })}\n`);
		});
	}
}
