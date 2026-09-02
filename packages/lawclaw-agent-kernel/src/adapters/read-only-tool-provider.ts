import { promises as fs } from "node:fs";
import path from "node:path";
import type { ReadOnlyToolConfig } from "../config/index.ts";
import {
	KernelError,
	type RequestContext,
	type TimePort,
	type ToolDescriptor,
	type ToolInvocation,
	type ToolProviderPort,
	type ToolResult,
} from "../contracts/index.ts";
import { assertRequestContext } from "../kernel/request-context-guard.ts";

function createDescriptors(limits: ReadOnlyToolConfig): readonly ToolDescriptor[] {
	const descriptors: ToolDescriptor[] = [
		{
			name: "lawclaw_list_files",
			version: "1.0.0",
			description: "列出工作区内指定目录的直接子项；不会递归、不会访问工作区外路径。",
			risk: "read_only",
			inputSchema: {
				type: "object",
				properties: { path: { type: "string", description: "相对工作区路径，默认为当前目录" } },
				additionalProperties: false,
			},
			maxResultBytes: limits.maxResultBytes,
		},
		{
			name: "lawclaw_read_text",
			version: "1.0.0",
			description: `读取工作区内不超过 ${limits.maxFileBytes} 字节的 UTF-8 文本文件；拒绝符号链接逃逸。`,
			risk: "read_only",
			inputSchema: {
				type: "object",
				properties: { path: { type: "string", description: "工作区内文件的相对路径" } },
				required: ["path"],
				additionalProperties: false,
			},
			maxResultBytes: limits.maxResultBytes,
		},
		{
			name: "lawclaw_search_text",
			version: "1.0.0",
			description: `在工作区内有界搜索文本；最多检查 ${limits.maxSearchFiles} 个文件并返回 ${limits.maxSearchMatches} 条匹配。`,
			risk: "read_only",
			inputSchema: {
				type: "object",
				properties: {
					query: { type: "string", description: "非空的普通文本查询，不作为正则表达式执行" },
					path: { type: "string", description: "相对工作区目录，默认为当前目录" },
				},
				required: ["query"],
				additionalProperties: false,
			},
			maxResultBytes: limits.maxResultBytes,
		},
	];
	return Object.freeze(descriptors);
}

function stringArgument(invocation: ToolInvocation, name: string, required: boolean): string {
	const value = invocation.arguments[name];
	if (value === undefined && !required) return ".";
	if (typeof value !== "string" || (required && value.trim() === "")) {
		throw new KernelError("TOOL_EXECUTION_FAILED", `工具参数 ${name} 必须为非空字符串。`);
	}
	return value;
}

/**
 * 首版只读文件工具 Provider。
 *
 * 安全：所有路径经过 realpath 后必须位于 workspaceRoot；遍历不跟随符号链接。
 * 韧性：文件大小、目录项、扫描文件、匹配数和结果字节全部有固定上限。
 */
export class ReadOnlyToolProvider implements ToolProviderPort {
	readonly #workspaceRoot: string;
	readonly #descriptors: readonly ToolDescriptor[];
	readonly #limits: ReadOnlyToolConfig;
	readonly #timePort: TimePort;

	private constructor(workspaceRoot: string, limits: ReadOnlyToolConfig, timePort: TimePort) {
		this.#workspaceRoot = workspaceRoot;
		this.#limits = limits;
		this.#timePort = timePort;
		this.#descriptors = createDescriptors(limits);
	}

	/** 创建绑定单一工作区和已验证扫描上限的 Provider；根目录必须已经存在。 */
	public static async create(
		workspaceRoot: string,
		limits: ReadOnlyToolConfig,
		timePort: TimePort,
	): Promise<ReadOnlyToolProvider> {
		return new ReadOnlyToolProvider(await fs.realpath(workspaceRoot), limits, timePort);
	}

	/** 返回固定、版本化的三个只读工具描述。 */
	public async describe(context: RequestContext): Promise<readonly ToolDescriptor[]> {
		assertRequestContext(context, this.#timePort);
		return this.#descriptors;
	}

	/** 执行已经授权的只读调用；未知工具和越界路径默认拒绝。 */
	public async execute(context: RequestContext, invocation: ToolInvocation, signal: AbortSignal): Promise<ToolResult> {
		assertRequestContext(context, this.#timePort);
		signal.throwIfAborted();
		switch (invocation.toolName) {
			case "lawclaw_list_files":
				return this.#listFiles(stringArgument(invocation, "path", false), signal);
			case "lawclaw_read_text":
				return this.#readText(stringArgument(invocation, "path", true), signal);
			case "lawclaw_search_text":
				return this.#searchText(
					stringArgument(invocation, "query", true),
					stringArgument(invocation, "path", false),
					signal,
				);
			default:
				throw new KernelError("TOOL_NOT_ALLOWED", "只读 Provider 不认识该工具。", false, {
					toolName: invocation.toolName,
				});
		}
	}

	async #resolveInside(requestedPath: string): Promise<string> {
		const candidate = path.resolve(this.#workspaceRoot, requestedPath);
		let realPath: string;
		try {
			realPath = await fs.realpath(candidate);
		} catch {
			throw new KernelError("TOOL_EXECUTION_FAILED", "目标路径不存在或不可读取。");
		}
		const relative = path.relative(this.#workspaceRoot, realPath);
		if (relative.startsWith("..") || path.isAbsolute(relative)) {
			throw new KernelError("PATH_OUTSIDE_WORKSPACE", "拒绝访问工作区之外的路径。");
		}
		return realPath;
	}

	async #listFiles(requestedPath: string, signal: AbortSignal): Promise<ToolResult> {
		const directory = await this.#resolveInside(requestedPath);
		signal.throwIfAborted();
		const entries: string[] = [];
		const handle = await fs.opendir(directory);
		for await (const entry of handle) {
			signal.throwIfAborted();
			if (entries.length >= this.#limits.maxListEntries) break;
			entries.push(`${entry.isDirectory() ? "目录" : entry.isSymbolicLink() ? "链接" : "文件"}\t${entry.name}`);
		}
		entries.sort();
		return {
			text: entries.join("\n") || "（空目录）",
			isError: false,
			metadata: { entryCount: entries.length, truncated: entries.length >= this.#limits.maxListEntries },
		};
	}

	async #readText(requestedPath: string, signal: AbortSignal): Promise<ToolResult> {
		const filePath = await this.#resolveInside(requestedPath);
		const stat = await fs.stat(filePath);
		if (!stat.isFile() || stat.size > this.#limits.maxFileBytes) {
			throw new KernelError("TOOL_EXECUTION_FAILED", "目标不是文本文件或超过配置的文件大小上限。", false, {
				size: stat.size,
			});
		}
		signal.throwIfAborted();
		const text = await fs.readFile(filePath, "utf8");
		const buffer = Buffer.from(text, "utf8");
		const clipped =
			buffer.byteLength > this.#limits.maxResultBytes
				? buffer.subarray(0, this.#limits.maxResultBytes).toString("utf8")
				: text;
		return {
			text: clipped,
			isError: false,
			metadata: { bytes: stat.size, truncated: buffer.byteLength > this.#limits.maxResultBytes },
		};
	}

	async #searchText(query: string, requestedPath: string, signal: AbortSignal): Promise<ToolResult> {
		const root = await this.#resolveInside(requestedPath);
		const pending = [root];
		const matches: string[] = [];
		let checkedFiles = 0;
		let visitedEntries = 0;
		const needle = query.toLocaleLowerCase();

		while (
			pending.length > 0 &&
			checkedFiles < this.#limits.maxSearchFiles &&
			matches.length < this.#limits.maxSearchMatches &&
			visitedEntries < this.#limits.maxSearchEntries
		) {
			signal.throwIfAborted();
			const current = pending.pop();
			if (!current) break;
			visitedEntries += 1;
			const stat = await fs.lstat(current);
			if (stat.isSymbolicLink()) continue;
			if (stat.isDirectory()) {
				if (this.#limits.excludedDirectoryNames.includes(path.basename(current))) continue;
				const children: string[] = [];
				const handle = await fs.opendir(current);
				for await (const entry of handle) {
					if (visitedEntries + pending.length + children.length >= this.#limits.maxSearchEntries) break;
					children.push(entry.name);
				}
				for (const child of children.reverse()) pending.push(path.join(current, child));
				continue;
			}
			if (!stat.isFile() || stat.size > this.#limits.maxFileBytes) continue;
			checkedFiles += 1;
			let text: string;
			try {
				text = await fs.readFile(current, "utf8");
			} catch {
				continue;
			}
			const lines = text.split(/\r?\n/u);
			for (let index = 0; index < lines.length && matches.length < this.#limits.maxSearchMatches; index += 1) {
				const line = lines[index] ?? "";
				if (line.toLocaleLowerCase().includes(needle)) {
					matches.push(
						`${path.relative(this.#workspaceRoot, current)}:${index + 1}:${line.slice(0, this.#limits.maxMatchedLineChars)}`,
					);
				}
			}
		}

		const text = matches.join("\n") || "未找到匹配。";
		return {
			text,
			isError: false,
			metadata: {
				checkedFiles,
				visitedEntries,
				matchCount: matches.length,
				truncated:
					checkedFiles >= this.#limits.maxSearchFiles ||
					matches.length >= this.#limits.maxSearchMatches ||
					visitedEntries >= this.#limits.maxSearchEntries,
			},
		};
	}
}
