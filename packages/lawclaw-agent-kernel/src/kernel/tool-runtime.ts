import { Buffer } from "node:buffer";
import {
	KernelError,
	type RequestContext,
	type TimePort,
	type ToolDescriptor,
	type ToolInvocation,
	type ToolPolicy,
	type ToolProviderPort,
	type ToolResult,
} from "../contracts/index.ts";
import { assertRequestContext } from "./request-context-guard.ts";

interface RegisteredTool {
	readonly descriptor: ToolDescriptor;
	readonly provider: ToolProviderPort;
}

/**
 * Kernel 的工具政策与执行协调器。
 *
 * 注册：Provider 只提供描述与执行机制，重复工具名拒绝注册。
 * 授权：名称和风险类型必须同时命中冻结政策，未知工具默认拒绝。
 * 韧性：参数、结果和单次耗时都有上限，取消信号传播到底层 Provider。
 */
export class ToolRuntime {
	readonly #providers: readonly ToolProviderPort[];
	readonly #tools = new Map<string, RegisteredTool>();
	readonly #maxRegisteredTools: number;
	readonly #timePort: TimePort;
	#initialized = false;
	#tenantId: string | undefined;

	/** 创建具有配置化目录容量的 Runtime；Provider 列表在实例生命周期内冻结。 */
	public constructor(providers: readonly ToolProviderPort[], maxRegisteredTools: number, timePort: TimePort) {
		this.#providers = providers;
		this.#maxRegisteredTools = maxRegisteredTools;
		this.#timePort = timePort;
	}

	/** 读取 Provider 描述并建立不可歧义的工具目录；同名工具直接失败。 */
	public async initialize(context: RequestContext): Promise<void> {
		assertRequestContext(context, this.#timePort);
		if (this.#initialized) {
			if (this.#tenantId !== context.tenant.tenantId) {
				throw new KernelError("TENANT_SCOPE_VIOLATION", "工具目录不能跨租户复用。");
			}
			return;
		}
		this.#tenantId = context.tenant.tenantId;
		for (const provider of this.#providers) {
			for (const descriptor of await provider.describe(context)) {
				if (this.#tools.size >= this.#maxRegisteredTools) {
					throw new KernelError("TOOL_NOT_ALLOWED", "工具目录超过固定注册上限。", false, {
						maxRegisteredTools: this.#maxRegisteredTools,
					});
				}
				if (this.#tools.has(descriptor.name)) {
					throw new KernelError("TOOL_NOT_ALLOWED", "工具目录中存在重复名称。", false, {
						toolName: descriptor.name,
					});
				}
				this.#tools.set(descriptor.name, { descriptor, provider });
			}
		}
		this.#initialized = true;
	}

	/** 返回当前政策允许、可安全暴露给模型的工具描述快照。 */
	public listAllowed(policy: ToolPolicy): readonly ToolDescriptor[] {
		if (!this.#initialized) {
			throw new KernelError("TOOL_NOT_ALLOWED", "工具目录尚未初始化。");
		}
		return [...this.#tools.values()]
			.map((entry) => entry.descriptor)
			.filter(
				(descriptor) =>
					policy.allowedToolNames.includes(descriptor.name) && policy.allowedRisks.includes(descriptor.risk),
			)
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	/** 校验冻结政策后执行单个工具；所有失败都归一化为稳定 KernelError。 */
	public async execute(
		context: RequestContext,
		invocation: ToolInvocation,
		policy: ToolPolicy,
		signal: AbortSignal,
	): Promise<ToolResult> {
		assertRequestContext(context, this.#timePort);
		if (this.#tenantId !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "工具 Runtime 与调用租户不匹配。");
		}
		const registered = this.#tools.get(invocation.toolName);
		if (
			!registered ||
			!policy.allowedToolNames.includes(invocation.toolName) ||
			!policy.allowedRisks.includes(registered.descriptor.risk)
		) {
			throw new KernelError("TOOL_NOT_ALLOWED", "工具未注册或不在当前 Run 的允许策略内。", false, {
				toolName: invocation.toolName,
			});
		}

		const argumentsBytes = Buffer.byteLength(JSON.stringify(invocation.arguments), "utf8");
		if (argumentsBytes > policy.maxArgumentsBytes) {
			throw new KernelError("TOOL_ARGUMENTS_TOO_LARGE", "工具参数超过允许上限。", false, {
				argumentsBytes,
				maxArgumentsBytes: policy.maxArgumentsBytes,
			});
		}

		const timeoutSignal = AbortSignal.timeout(policy.perCallTimeoutMs);
		const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
		let result: ToolResult;
		try {
			result = await registered.provider.execute(context, invocation, combinedSignal);
		} catch (error) {
			if (error instanceof KernelError) throw error;
			if (combinedSignal.aborted) {
				throw new KernelError("TOOL_EXECUTION_FAILED", "工具执行已取消或超时。", true);
			}
			throw new KernelError("TOOL_EXECUTION_FAILED", "工具 Provider 执行失败。", true);
		}

		const resultBytes = Buffer.byteLength(result.text, "utf8");
		if (resultBytes > registered.descriptor.maxResultBytes) {
			throw new KernelError("TOOL_RESULT_TOO_LARGE", "工具结果超过描述符声明的上限。", false, {
				resultBytes,
				maxResultBytes: registered.descriptor.maxResultBytes,
			});
		}
		return result;
	}
}
