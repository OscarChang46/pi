import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type {
	AgentExecutionBudget,
	ContextItem,
	DelegationPolicy,
	ToolDescriptor,
	ToolPolicy,
} from "../contracts/index.ts";

// Bootstrap 上限无法从尚未读取的配置获得，并防止配置文件自身造成无界内存使用。
const MAX_CONFIG_BYTES = 256 * 1024;
const MAX_PROMPT_CATALOG_BYTES = 256 * 1024;
const DEFAULT_CONFIG_FILE = fileURLToPath(new URL("../../config/agent-kernel.yaml", import.meta.url));

/** 模型目录来源；faux 用于确定性测试，builtin 使用 Pi 内置 Provider 目录。 */
export type ModelSource = "faux" | "builtin";

/** Composition Root 使用的模型选择，不包含凭据。 */
export interface ModelSelectionConfig {
	/** 模型来源。 */
	readonly source: ModelSource;
	/** Pi Provider 稳定标识。 */
	readonly providerId: string;
	/** Provider 模型目录中的模型标识。 */
	readonly modelId: string;
}

/** 系统提示词目录及角色 Prompt ID。 */
export interface PromptSelectionConfig {
	/** 相对主配置文件或绝对路径的 Prompt Catalog。 */
	readonly catalogFile: string;
	/** Agent Kernel 主 Agent 的 Prompt ID。 */
	readonly agentSystemPromptId: string;
	/** Pi CLI 安全附录的 Prompt ID。 */
	readonly cliSafetyAppendixId: string;
	/** 单层只读子 Agent 的 Prompt ID。 */
	readonly childAgentSystemPromptId: string;
}

/** ContextEngine 的保守 Token 估算参数。 */
export interface ContextEngineConfig {
	/** 一个 Token 对应的估算字符数。 */
	readonly estimatedCharactersPerToken: number;
	/** 系统提示词和目标之外的固定协议开销。 */
	readonly fixedPromptOverheadTokens: number;
	/** 工具消息或工具调用的协议开销。 */
	readonly messageOverheadTokens: number;
	/** 单个 ContextItem 的包装开销。 */
	readonly contextItemOverheadTokens: number;
}

/** ToolCoordinator 的目录容量配置。 */
export interface ToolRuntimeConfig {
	/** 单个 Runtime 可注册的最大工具数。 */
	readonly maxRegisteredTools: number;
}

/** 控制入口的会话和关联 Run 容量配置；键名沿用现有配置。 */
export interface AgentObjectModelConfig {
	/** 控制入口在内存中最多管理的 Session 数。 */
	readonly maxSessions: number;
	/** 单个 Session 最多关联的 Run 数；Run 由独立目录持有。 */
	readonly maxRunsPerSession: number;
}

/** DelegationEngine 和委派工具配置。 */
export interface DelegationEngineConfig {
	/** 内存中允许跟踪的父 Run 数量。 */
	readonly maxTrackedParents: number;
	/** 委派工具描述允许返回的最大字节数。 */
	readonly delegationToolMaxResultBytes: number;
}

/** PiAgentAdapter 私有状态配置。 */
export interface PiAdapterConfig {
	/** Adapter 私有原生消息引用缓存上限。 */
	readonly maxPrivateMessages: number;
	/** 单次 Pi 模型 Turn 的底层重试次数。 */
	readonly maxRetries: number;
}

/** Kernel 内部组件的可调运行配置。 */
export interface KernelRuntimeConfig {
	/** 控制入口会话与 Run 关联数量的容量上限。 */
	readonly objectModel: AgentObjectModelConfig;
	/** Context 估算参数。 */
	readonly context: ContextEngineConfig;
	/** 工具目录参数。 */
	readonly toolRuntime: ToolRuntimeConfig;
	/** 技术委派参数。 */
	readonly delegation: DelegationEngineConfig;
	/** 单次 Run 请求不能突破的配置上限。 */
	readonly runLimits: AgentExecutionBudget;
	/** Pi Adapter 缓存和重试参数。 */
	readonly piAdapter: PiAdapterConfig;
}

/** 只读文件工具的扫描和输出参数。 */
export interface ReadOnlyToolConfig {
	/** 单个候选文件最大字节数。 */
	readonly maxFileBytes: number;
	/** 列目录最大条目数。 */
	readonly maxListEntries: number;
	/** 单次搜索最大文件数。 */
	readonly maxSearchFiles: number;
	/** 单次搜索最大文件系统条目数。 */
	readonly maxSearchEntries: number;
	/** 单次搜索最大匹配数。 */
	readonly maxSearchMatches: number;
	/** 单次工具结果最大 UTF-8 字节数。 */
	readonly maxResultBytes: number;
	/** 每条匹配最大字符数。 */
	readonly maxMatchedLineChars: number;
	/** 搜索时跳过的目录名称。 */
	readonly excludedDirectoryNames: readonly string[];
}

/** 工具 Adapter 配置集合。 */
export interface ToolsConfig {
	/** 首版只读文件工具配置。 */
	readonly readOnly: ReadOnlyToolConfig;
}

/** 本地 RequestContext 的身份和时间参数；服务模式下由 Backend 提供。 */
export interface RequestContextConfig {
	/** 本地运行租户标识。 */
	readonly tenantId: string;
	/** 本地运行主体标识。 */
	readonly subjectId: string;
	/** 本地运行授权快照引用。 */
	readonly authorizationSnapshot: string;
	/** Backend 或本地 Composition Root 明确选择的 IANA 时区标识。 */
	readonly timeZone: string;
	/** 本地化展示使用的 BCP 47 语言标签。 */
	readonly locale: string;
	/** issuedAt 相对当前时间向前偏移的毫秒数。 */
	readonly issuedAtSkewMs: number;
	/** TenantContext 有效期毫秒数。 */
	readonly tenantTtlMs: number;
	/** OperationContext 截止时间毫秒数。 */
	readonly operationDeadlineMs: number;
}

/** Pi CLI 子进程的传输参数。 */
export interface CliChildProcessConfig {
	/** 子 Agent JSONL stdout 最大字节数。 */
	readonly maxRpcStdoutBytes: number;
	/** SIGTERM 后等待 SIGKILL 的宽限毫秒数。 */
	readonly killGraceMs: number;
}

/** Pi CLI 开发入口参数。 */
export interface CliConfig {
	/** 是否禁止启动时刷新远程资源目录。 */
	readonly offline: boolean;
	/** 相对主配置文件或绝对路径的 Session 目录。 */
	readonly sessionDirectory: string;
	/** CLI 的 RequestContext 参数。 */
	readonly requestContext: RequestContextConfig;
	/** CLI 工具政策。 */
	readonly toolPolicy: ToolPolicy;
	/** CLI 技术委派政策。 */
	readonly delegationPolicy: DelegationPolicy;
	/** 子 Agent 进程参数。 */
	readonly childProcess: CliChildProcessConfig;
}

/** Faux 场景的确定性模型输出参数。 */
export interface FauxScenarioConfig {
	/** Faux 流式事件最小字符块。 */
	readonly tokenSizeMin: number;
	/** Faux 流式事件最大字符块。 */
	readonly tokenSizeMax: number;
	/** Faux 请求读取的工作区相对路径。 */
	readonly readPath: string;
	/** 读取工具前的候选文本。 */
	readonly beforeReadText: string;
	/** 委派工具前的候选文本。 */
	readonly beforeDelegationText: string;
	/** 交给子 Agent 的技术任务。 */
	readonly delegationTask: string;
	/** Fake 子 Agent 摘要前缀。 */
	readonly fakeDelegationSummaryPrefix: string;
	/** Faux 最终候选结果。 */
	readonly finalResponse: string;
}

/** 程序化 Agent Run 的目标、上下文、政策和预算。 */
export interface RunProfileConfig {
	/** 相对主配置文件或绝对路径的运行工作区。 */
	readonly workspaceRoot: string;
	/** 本地 Run 的 RequestContext 参数。 */
	readonly requestContext: RequestContextConfig;
	/** Agent Run 技术执行目标。 */
	readonly goal: string;
	/** Agent Run 初始上下文项。 */
	readonly contextItem: ContextItem;
	/** Agent Run 工具政策。 */
	readonly toolPolicy: ToolPolicy;
	/** Agent Run 技术委派政策。 */
	readonly delegationPolicy: DelegationPolicy;
	/** Agent Run 执行预算。 */
	readonly budget: AgentExecutionBudget;
	/** 无密钥确定性场景参数。 */
	readonly fauxScenario: FauxScenarioConfig;
}

/** 严格、版本化且重启生效的 Agent Kernel 运行配置。 */
export interface RuntimeConfig {
	/** 配置 Schema 主版本。 */
	readonly schemaVersion: "1";
	/** 模型装配选择。 */
	readonly model: ModelSelectionConfig;
	/** Prompt Catalog 映射。 */
	readonly prompts: PromptSelectionConfig;
	/** Kernel 内部运行参数。 */
	readonly kernel: KernelRuntimeConfig;
	/** 工具 Adapter 参数。 */
	readonly tools: ToolsConfig;
	/** Pi CLI 参数。 */
	readonly cli: CliConfig;
	/** 程序化 Agent Run 参数。 */
	readonly runtime: RunProfileConfig;
}

/** 配置加载失败；错误消息不得包含 Prompt 正文或凭据。 */
export class RuntimeConfigurationError extends Error {
	/** 创建配置错误；message 必须为不含配置正文或凭据的安全摘要。 */
	public constructor(message: string) {
		super(message);
		this.name = "RuntimeConfigurationError";
	}
}

/** 只读系统提示词目录。 */
export class PromptCatalog {
	readonly #prompts: ReadonlyMap<string, string>;

	/** 复制提示词映射作为只读目录；调用方后续修改原 Map 不影响目录。 */
	public constructor(prompts: ReadonlyMap<string, string>) {
		this.#prompts = new Map(prompts);
	}

	/** 按稳定 ID 读取非空系统提示词。 */
	public require(promptId: string): string {
		const prompt = this.#prompts.get(promptId);
		if (prompt === undefined || prompt.trim() === "") {
			throw new RuntimeConfigurationError(`系统提示词 ID 未定义或内容为空：${promptId}`);
		}
		return prompt;
	}
}

/** 已解析的运行配置和 Prompt Catalog。 */
export interface RuntimeSettings {
	/** 主配置文件绝对路径。 */
	readonly configFile: string;
	/** 已验证的全部可调参数。 */
	readonly config: RuntimeConfig;
	/** 已加载的系统提示词目录。 */
	readonly promptCatalog: PromptCatalog;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown, field: string, keys: readonly string[]): Record<string, unknown> {
	if (!isRecord(value)) throw new RuntimeConfigurationError(`配置字段 ${field} 必须为对象。`);
	const unknown = Object.keys(value).filter((key) => !keys.includes(key));
	if (unknown.length > 0) {
		throw new RuntimeConfigurationError(`配置字段 ${field} 包含未知键：${unknown.sort().join(", ")}`);
	}
	return value;
}

function nonEmptyText(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new RuntimeConfigurationError(`配置字段 ${field} 必须为非空字符串。`);
	}
	return value.trim();
}

function safeInteger(
	value: unknown,
	field: string,
	limits: { readonly min?: number; readonly max?: number } = {},
): number {
	if (!Number.isSafeInteger(value)) throw new RuntimeConfigurationError(`配置字段 ${field} 必须为安全整数。`);
	const number = value as number;
	if (limits.min !== undefined && number < limits.min) {
		throw new RuntimeConfigurationError(`配置字段 ${field} 小于安全下限 ${limits.min}。`);
	}
	if (limits.max !== undefined && number > limits.max) {
		throw new RuntimeConfigurationError(`配置字段 ${field} 超过安全上限 ${limits.max}。`);
	}
	return number;
}

function strictBoolean(value: unknown, field: string): boolean {
	if (typeof value !== "boolean") throw new RuntimeConfigurationError(`配置字段 ${field} 必须为布尔值。`);
	return value;
}

function nonEmptyStringArray(value: unknown, field: string): readonly string[] {
	if (!Array.isArray(value) || value.length === 0) {
		throw new RuntimeConfigurationError(`配置字段 ${field} 必须为非空字符串数组。`);
	}
	const values = value.map((item, index) => nonEmptyText(item, `${field}[${index}]`));
	if (new Set(values).size !== values.length) throw new RuntimeConfigurationError(`配置字段 ${field} 不得重复。`);
	return Object.freeze(values);
}

function parseToolPolicy(value: unknown, field: string): ToolPolicy {
	const item = object(value, field, [
		"allowedToolNames",
		"allowedRisks",
		"maxCalls",
		"perCallTimeoutMs",
		"maxArgumentsBytes",
	]);
	const risks = nonEmptyStringArray(item.allowedRisks, `${field}.allowedRisks`);
	const validRisks: readonly ToolDescriptor["risk"][] = ["read_only", "mutating", "network", "privileged"];
	if (risks.some((risk) => !validRisks.includes(risk as ToolDescriptor["risk"]))) {
		throw new RuntimeConfigurationError(`配置字段 ${field}.allowedRisks 包含未知风险。`);
	}
	return Object.freeze({
		allowedToolNames: nonEmptyStringArray(item.allowedToolNames, `${field}.allowedToolNames`),
		allowedRisks: Object.freeze(risks as ToolDescriptor["risk"][]),
		maxCalls: safeInteger(item.maxCalls, `${field}.maxCalls`, { min: 1, max: 256 }),
		perCallTimeoutMs: safeInteger(item.perCallTimeoutMs, `${field}.perCallTimeoutMs`, { min: 1, max: 300_000 }),
		maxArgumentsBytes: safeInteger(item.maxArgumentsBytes, `${field}.maxArgumentsBytes`, { min: 1, max: 1_048_576 }),
	});
}

function parseDelegationPolicy(value: unknown, field: string): DelegationPolicy {
	const item = object(value, field, [
		"enabled",
		"maxDepth",
		"maxChildren",
		"timeoutMs",
		"maxTaskChars",
		"maxResultBytes",
	]);
	if (item.maxDepth !== 1) throw new RuntimeConfigurationError(`配置字段 ${field}.maxDepth 首版必须为 1。`);
	return Object.freeze({
		enabled: strictBoolean(item.enabled, `${field}.enabled`),
		maxDepth: 1,
		maxChildren: safeInteger(item.maxChildren, `${field}.maxChildren`, { min: 1, max: 32 }),
		timeoutMs: safeInteger(item.timeoutMs, `${field}.timeoutMs`, { min: 1, max: 900_000 }),
		maxTaskChars: safeInteger(item.maxTaskChars, `${field}.maxTaskChars`, { min: 1, max: 32_768 }),
		maxResultBytes: safeInteger(item.maxResultBytes, `${field}.maxResultBytes`, { min: 1, max: 1_048_576 }),
	});
}

function parseBudget(value: unknown, field: string): AgentExecutionBudget {
	const item = object(value, field, [
		"maxTurns",
		"maxToolCalls",
		"maxDurationMs",
		"maxInputTokens",
		"outputReserveTokens",
		"maxOutputChars",
	]);
	return Object.freeze({
		maxTurns: safeInteger(item.maxTurns, `${field}.maxTurns`, { min: 1, max: 64 }),
		maxToolCalls: safeInteger(item.maxToolCalls, `${field}.maxToolCalls`, { min: 1, max: 256 }),
		maxDurationMs: safeInteger(item.maxDurationMs, `${field}.maxDurationMs`, { min: 1, max: 900_000 }),
		maxInputTokens: safeInteger(item.maxInputTokens, `${field}.maxInputTokens`, { min: 1, max: 256_000 }),
		outputReserveTokens: safeInteger(item.outputReserveTokens, `${field}.outputReserveTokens`, {
			min: 0,
			max: 128_000,
		}),
		maxOutputChars: safeInteger(item.maxOutputChars, `${field}.maxOutputChars`, { min: 1, max: 1_000_000 }),
	});
}

function parseRequestContext(value: unknown, field: string): RequestContextConfig {
	const item = object(value, field, [
		"tenantId",
		"subjectId",
		"authorizationSnapshot",
		"timeZone",
		"locale",
		"issuedAtSkewMs",
		"tenantTtlMs",
		"operationDeadlineMs",
	]);
	return Object.freeze({
		tenantId: nonEmptyText(item.tenantId, `${field}.tenantId`),
		subjectId: nonEmptyText(item.subjectId, `${field}.subjectId`),
		authorizationSnapshot: nonEmptyText(item.authorizationSnapshot, `${field}.authorizationSnapshot`),
		timeZone: nonEmptyText(item.timeZone, `${field}.timeZone`),
		locale: nonEmptyText(item.locale, `${field}.locale`),
		issuedAtSkewMs: safeInteger(item.issuedAtSkewMs, `${field}.issuedAtSkewMs`, { min: 0, max: 60_000 }),
		tenantTtlMs: safeInteger(item.tenantTtlMs, `${field}.tenantTtlMs`, { min: 1, max: 86_400_000 }),
		operationDeadlineMs: safeInteger(item.operationDeadlineMs, `${field}.operationDeadlineMs`, {
			min: 1,
			max: 900_000,
		}),
	});
}

function parseRuntimeConfig(value: unknown): RuntimeConfig {
	const root = object(value, "root", ["schemaVersion", "model", "prompts", "kernel", "tools", "cli", "runtime"]);
	if (root.schemaVersion !== "1") throw new RuntimeConfigurationError("只支持运行配置 schemaVersion=1。");

	const model = object(root.model, "model", ["source", "providerId", "modelId"]);
	if (model.source !== "faux" && model.source !== "builtin") {
		throw new RuntimeConfigurationError("配置字段 model.source 只允许 faux 或 builtin。");
	}
	const prompts = object(root.prompts, "prompts", [
		"catalogFile",
		"agentSystemPromptId",
		"cliSafetyAppendixId",
		"childAgentSystemPromptId",
	]);
	const kernel = object(root.kernel, "kernel", [
		"objectModel",
		"context",
		"toolRuntime",
		"delegation",
		"runLimits",
		"piAdapter",
	]);
	const objectModel = object(kernel.objectModel, "kernel.objectModel", ["maxSessions", "maxRunsPerSession"]);
	const context = object(kernel.context, "kernel.context", [
		"estimatedCharactersPerToken",
		"fixedPromptOverheadTokens",
		"messageOverheadTokens",
		"contextItemOverheadTokens",
	]);
	const toolRuntime = object(kernel.toolRuntime, "kernel.toolRuntime", ["maxRegisteredTools"]);
	const delegation = object(kernel.delegation, "kernel.delegation", [
		"maxTrackedParents",
		"delegationToolMaxResultBytes",
	]);
	const piAdapter = object(kernel.piAdapter, "kernel.piAdapter", ["maxPrivateMessages", "maxRetries"]);
	const tools = object(root.tools, "tools", ["readOnly"]);
	const readOnly = object(tools.readOnly, "tools.readOnly", [
		"maxFileBytes",
		"maxListEntries",
		"maxSearchFiles",
		"maxSearchEntries",
		"maxSearchMatches",
		"maxResultBytes",
		"maxMatchedLineChars",
		"excludedDirectoryNames",
	]);
	const cli = object(root.cli, "cli", [
		"offline",
		"sessionDirectory",
		"requestContext",
		"toolPolicy",
		"delegationPolicy",
		"childProcess",
	]);
	const childProcess = object(cli.childProcess, "cli.childProcess", ["maxRpcStdoutBytes", "killGraceMs"]);
	const runtime = object(root.runtime, "runtime", [
		"workspaceRoot",
		"requestContext",
		"goal",
		"contextItem",
		"toolPolicy",
		"delegationPolicy",
		"budget",
		"fauxScenario",
	]);
	const contextItem = object(runtime.contextItem, "runtime.contextItem", [
		"itemId",
		"sourceRef",
		"kind",
		"content",
		"priority",
		"required",
		"classification",
	]);
	const faux = object(runtime.fauxScenario, "runtime.fauxScenario", [
		"tokenSizeMin",
		"tokenSizeMax",
		"readPath",
		"beforeReadText",
		"beforeDelegationText",
		"delegationTask",
		"fakeDelegationSummaryPrefix",
		"finalResponse",
	]);

	const kinds: readonly ContextItem["kind"][] = [
		"goal",
		"instruction",
		"document",
		"tool_result",
		"delegation_result",
	];
	const classifications: readonly ContextItem["classification"][] = ["public", "internal", "confidential", "secret"];
	if (!kinds.includes(contextItem.kind as ContextItem["kind"]))
		throw new RuntimeConfigurationError("runtime.contextItem.kind 无效。");
	if (!classifications.includes(contextItem.classification as ContextItem["classification"]))
		throw new RuntimeConfigurationError("runtime.contextItem.classification 无效。");

	const parsed: RuntimeConfig = {
		schemaVersion: "1",
		model: Object.freeze({
			source: model.source,
			providerId: nonEmptyText(model.providerId, "model.providerId"),
			modelId: nonEmptyText(model.modelId, "model.modelId"),
		}),
		prompts: Object.freeze({
			catalogFile: nonEmptyText(prompts.catalogFile, "prompts.catalogFile"),
			agentSystemPromptId: nonEmptyText(prompts.agentSystemPromptId, "prompts.agentSystemPromptId"),
			cliSafetyAppendixId: nonEmptyText(prompts.cliSafetyAppendixId, "prompts.cliSafetyAppendixId"),
			childAgentSystemPromptId: nonEmptyText(prompts.childAgentSystemPromptId, "prompts.childAgentSystemPromptId"),
		}),
		kernel: Object.freeze({
			objectModel: Object.freeze({
				maxSessions: safeInteger(objectModel.maxSessions, "kernel.objectModel.maxSessions", {
					min: 1,
					max: 65_536,
				}),
				maxRunsPerSession: safeInteger(objectModel.maxRunsPerSession, "kernel.objectModel.maxRunsPerSession", {
					min: 1,
					max: 65_536,
				}),
			}),
			context: Object.freeze({
				estimatedCharactersPerToken: safeInteger(
					context.estimatedCharactersPerToken,
					"kernel.context.estimatedCharactersPerToken",
					{ min: 1, max: 16 },
				),
				fixedPromptOverheadTokens: safeInteger(
					context.fixedPromptOverheadTokens,
					"kernel.context.fixedPromptOverheadTokens",
					{ min: 0, max: 4096 },
				),
				messageOverheadTokens: safeInteger(context.messageOverheadTokens, "kernel.context.messageOverheadTokens", {
					min: 0,
					max: 4096,
				}),
				contextItemOverheadTokens: safeInteger(
					context.contextItemOverheadTokens,
					"kernel.context.contextItemOverheadTokens",
					{ min: 0, max: 4096 },
				),
			}),
			toolRuntime: Object.freeze({
				maxRegisteredTools: safeInteger(toolRuntime.maxRegisteredTools, "kernel.toolRuntime.maxRegisteredTools", {
					min: 1,
					max: 256,
				}),
			}),
			delegation: Object.freeze({
				maxTrackedParents: safeInteger(delegation.maxTrackedParents, "kernel.delegation.maxTrackedParents", {
					min: 1,
					max: 65_536,
				}),
				delegationToolMaxResultBytes: safeInteger(
					delegation.delegationToolMaxResultBytes,
					"kernel.delegation.delegationToolMaxResultBytes",
					{ min: 1, max: 1_048_576 },
				),
			}),
			runLimits: parseBudget(kernel.runLimits, "kernel.runLimits"),
			piAdapter: Object.freeze({
				maxPrivateMessages: safeInteger(piAdapter.maxPrivateMessages, "kernel.piAdapter.maxPrivateMessages", {
					min: 1,
					max: 65_536,
				}),
				maxRetries: safeInteger(piAdapter.maxRetries, "kernel.piAdapter.maxRetries", { min: 0, max: 3 }),
			}),
		}),
		tools: Object.freeze({
			readOnly: Object.freeze({
				maxFileBytes: safeInteger(readOnly.maxFileBytes, "tools.readOnly.maxFileBytes", {
					min: 1,
					max: 16_777_216,
				}),
				maxListEntries: safeInteger(readOnly.maxListEntries, "tools.readOnly.maxListEntries", {
					min: 1,
					max: 10_000,
				}),
				maxSearchFiles: safeInteger(readOnly.maxSearchFiles, "tools.readOnly.maxSearchFiles", {
					min: 1,
					max: 10_000,
				}),
				maxSearchEntries: safeInteger(readOnly.maxSearchEntries, "tools.readOnly.maxSearchEntries", {
					min: 1,
					max: 100_000,
				}),
				maxSearchMatches: safeInteger(readOnly.maxSearchMatches, "tools.readOnly.maxSearchMatches", {
					min: 1,
					max: 10_000,
				}),
				maxResultBytes: safeInteger(readOnly.maxResultBytes, "tools.readOnly.maxResultBytes", {
					min: 1,
					max: 1_048_576,
				}),
				maxMatchedLineChars: safeInteger(readOnly.maxMatchedLineChars, "tools.readOnly.maxMatchedLineChars", {
					min: 1,
					max: 4096,
				}),
				excludedDirectoryNames: nonEmptyStringArray(
					readOnly.excludedDirectoryNames,
					"tools.readOnly.excludedDirectoryNames",
				),
			}),
		}),
		cli: Object.freeze({
			offline: strictBoolean(cli.offline, "cli.offline"),
			sessionDirectory: nonEmptyText(cli.sessionDirectory, "cli.sessionDirectory"),
			requestContext: parseRequestContext(cli.requestContext, "cli.requestContext"),
			toolPolicy: parseToolPolicy(cli.toolPolicy, "cli.toolPolicy"),
			delegationPolicy: parseDelegationPolicy(cli.delegationPolicy, "cli.delegationPolicy"),
			childProcess: Object.freeze({
				maxRpcStdoutBytes: safeInteger(childProcess.maxRpcStdoutBytes, "cli.childProcess.maxRpcStdoutBytes", {
					min: 1,
					max: 16_777_216,
				}),
				killGraceMs: safeInteger(childProcess.killGraceMs, "cli.childProcess.killGraceMs", { min: 0, max: 30_000 }),
			}),
		}),
		runtime: Object.freeze({
			workspaceRoot: nonEmptyText(runtime.workspaceRoot, "runtime.workspaceRoot"),
			requestContext: parseRequestContext(runtime.requestContext, "runtime.requestContext"),
			goal: nonEmptyText(runtime.goal, "runtime.goal"),
			contextItem: Object.freeze({
				itemId: nonEmptyText(contextItem.itemId, "runtime.contextItem.itemId"),
				sourceRef: nonEmptyText(contextItem.sourceRef, "runtime.contextItem.sourceRef"),
				kind: contextItem.kind as ContextItem["kind"],
				content: nonEmptyText(contextItem.content, "runtime.contextItem.content"),
				priority: safeInteger(contextItem.priority, "runtime.contextItem.priority", {
					min: -1_000_000,
					max: 1_000_000,
				}),
				required: strictBoolean(contextItem.required, "runtime.contextItem.required"),
				classification: contextItem.classification as ContextItem["classification"],
			}),
			toolPolicy: parseToolPolicy(runtime.toolPolicy, "runtime.toolPolicy"),
			delegationPolicy: parseDelegationPolicy(runtime.delegationPolicy, "runtime.delegationPolicy"),
			budget: parseBudget(runtime.budget, "runtime.budget"),
			fauxScenario: Object.freeze({
				tokenSizeMin: safeInteger(faux.tokenSizeMin, "runtime.fauxScenario.tokenSizeMin", { min: 1, max: 1024 }),
				tokenSizeMax: safeInteger(faux.tokenSizeMax, "runtime.fauxScenario.tokenSizeMax", { min: 1, max: 1024 }),
				readPath: nonEmptyText(faux.readPath, "runtime.fauxScenario.readPath"),
				beforeReadText: nonEmptyText(faux.beforeReadText, "runtime.fauxScenario.beforeReadText"),
				beforeDelegationText: nonEmptyText(faux.beforeDelegationText, "runtime.fauxScenario.beforeDelegationText"),
				delegationTask: nonEmptyText(faux.delegationTask, "runtime.fauxScenario.delegationTask"),
				fakeDelegationSummaryPrefix: nonEmptyText(
					faux.fakeDelegationSummaryPrefix,
					"runtime.fauxScenario.fakeDelegationSummaryPrefix",
				),
				finalResponse: nonEmptyText(faux.finalResponse, "runtime.fauxScenario.finalResponse"),
			}),
		}),
	};

	if (
		parsed.kernel.runLimits.outputReserveTokens >= parsed.kernel.runLimits.maxInputTokens ||
		parsed.runtime.budget.outputReserveTokens >= parsed.runtime.budget.maxInputTokens
	) {
		throw new RuntimeConfigurationError("输出预留 Token 必须小于对应输入 Token 上限。");
	}
	if (
		parsed.runtime.budget.maxTurns > parsed.kernel.runLimits.maxTurns ||
		parsed.runtime.budget.maxToolCalls > parsed.kernel.runLimits.maxToolCalls ||
		parsed.runtime.budget.maxDurationMs > parsed.kernel.runLimits.maxDurationMs ||
		parsed.runtime.budget.maxInputTokens > parsed.kernel.runLimits.maxInputTokens ||
		parsed.runtime.budget.outputReserveTokens > parsed.kernel.runLimits.outputReserveTokens ||
		parsed.runtime.budget.maxOutputChars > parsed.kernel.runLimits.maxOutputChars
	) {
		throw new RuntimeConfigurationError("Agent Run 预算不得突破 kernel.runLimits。");
	}
	if (parsed.runtime.fauxScenario.tokenSizeMin > parsed.runtime.fauxScenario.tokenSizeMax) {
		throw new RuntimeConfigurationError("Faux tokenSizeMin 不得大于 tokenSizeMax。");
	}
	return Object.freeze(parsed);
}

function readBoundedYaml(filePath: string, maxBytes: number, label: string): unknown {
	let size: number;
	try {
		size = statSync(filePath).size;
	} catch {
		throw new RuntimeConfigurationError(`${label}不存在或不可读取。`);
	}
	if (size <= 0 || size > maxBytes) throw new RuntimeConfigurationError(`${label}为空或超过安全上限。`);
	try {
		return parse(readFileSync(filePath, "utf8"));
	} catch {
		throw new RuntimeConfigurationError(`${label}不是有效 YAML。`);
	}
}

function loadPromptCatalog(filePath: string): PromptCatalog {
	const raw = readBoundedYaml(filePath, MAX_PROMPT_CATALOG_BYTES, "Prompt Catalog");
	if (!isRecord(raw)) throw new RuntimeConfigurationError("Prompt Catalog 根节点必须为对象。");
	const root = object(raw, "promptCatalog", ["schemaVersion", "prompts"]);
	if (root.schemaVersion !== "1") throw new RuntimeConfigurationError("只支持 Prompt Catalog schemaVersion=1。");
	if (!isRecord(root.prompts) || Object.keys(root.prompts).length === 0) {
		throw new RuntimeConfigurationError("promptCatalog.prompts 必须为非空对象。");
	}
	const entries = new Map<string, string>();
	for (const [promptId, value] of Object.entries(root.prompts)) {
		entries.set(nonEmptyText(promptId, "promptId"), nonEmptyText(value, `prompts.${promptId}`));
	}
	return new PromptCatalog(entries);
}

/** 解析主配置路径；仅读取 LAWCLAW_CONFIG_FILE。 */
export function resolveRuntimeConfigFile(environment: NodeJS.ProcessEnv = process.env): string {
	const configured = environment.LAWCLAW_CONFIG_FILE?.trim();
	return path.resolve(configured && configured !== "" ? configured : DEFAULT_CONFIG_FILE);
}

/** 将配置中的相对路径按主配置文件目录解析。 */
export function resolveConfiguredPath(settings: RuntimeSettings, configuredPath: string): string {
	return path.resolve(path.dirname(settings.configFile), configuredPath);
}

/** 严格加载全部可调参数和系统提示词目录。 */
export function loadRuntimeSettings(configFile: string = resolveRuntimeConfigFile()): RuntimeSettings {
	const normalizedConfigFile = path.resolve(configFile);
	const config = parseRuntimeConfig(readBoundedYaml(normalizedConfigFile, MAX_CONFIG_BYTES, "运行配置"));
	const promptFile = path.resolve(path.dirname(normalizedConfigFile), config.prompts.catalogFile);
	const promptCatalog = loadPromptCatalog(promptFile);
	promptCatalog.require(config.prompts.agentSystemPromptId);
	promptCatalog.require(config.prompts.cliSafetyAppendixId);
	promptCatalog.require(config.prompts.childAgentSystemPromptId);
	return Object.freeze({ configFile: normalizedConfigFile, config, promptCatalog });
}
