import { Buffer } from "node:buffer";
import {
	KernelError,
	type RequestContext,
	type SandboxHandle,
	type SandboxPort,
	type ToolDescriptor,
	type ToolProviderPort,
	type ToolResult,
} from "../contracts/index.ts";
import type { AuthorizedToolCall, ToolExecutionPort } from "../contracts/tool-runtime.ts";
import type { SandboxPlanner } from "./sandbox-planner.ts";

/** 一次性只读执行适配；仅供工具守卫调用，不判定权限、不重试副作用。 */
export class ToolExecutor implements ToolExecutionPort {
	readonly #providers: readonly ToolProviderPort[];
	readonly #planner: SandboxPlanner;
	readonly #sandbox: SandboxPort;
	readonly #providersByName = new Map<string, { provider: ToolProviderPort; descriptor: ToolDescriptor }>();
	/** 装配已有 Provider 与沙箱机制；实例由应用装配入口创建。 */
	constructor(providers: readonly ToolProviderPort[], planner: SandboxPlanner, sandbox: SandboxPort) {
		this.#providers = providers;
		this.#planner = planner;
		this.#sandbox = sandbox;
	}
	/** 汇集 Provider 描述；重复注册直接失败，不决定模型可见范围。 */
	async describe(context: RequestContext): Promise<readonly ToolDescriptor[]> {
		const entries = new Map<string, { provider: ToolProviderPort; descriptor: ToolDescriptor }>();
		for (const provider of this.#providers)
			for (const descriptor of await provider.describe(context)) {
				if (entries.has(descriptor.name)) throw new KernelError("TOOL_NOT_ALLOWED", "工具 Provider 名称重复。");
				entries.set(descriptor.name, { provider, descriptor });
			}
		this.#providersByName.clear();
		for (const [name, entry] of entries) this.#providersByName.set(name, entry);
		return [...entries.values()].map((entry) => entry.descriptor);
	}
	/** 执行已检查调用，尊重取消与超时；沙箱创建成功后始终在 finally 回收。 */
	async execute(context: RequestContext, request: AuthorizedToolCall, signal: AbortSignal): Promise<ToolResult> {
		signal.throwIfAborted();
		const { invocation, grant } = request;
		const entry = this.#providersByName.get(invocation.toolName);
		if (!entry) throw new KernelError("TOOL_NOT_ALLOWED", "执行 Provider 未注册。");
		const { provider, descriptor } = entry;
		const sandboxRequest = this.#planner.plan(context, grant, {
			profileRef: "in-process-read-only/v1",
			resources: grant.resourceGrants,
			egress: grant.egressGrants.map((grant) => ({ ...grant, protocol: "tcp" as const })),
			secrets: grant.secretGrants,
			budget: {
				wallClockMs: grant.budget.timeoutMs,
				maxOutputBytes: grant.budget.maxResultBytes,
				maxOpenFiles: 32,
				maxProcesses: 1,
				writableScratchQuotaBytes: 0,
			},
			allowChildProcesses: false,
			requiresOsProcessIsolation: descriptor.risk !== "read_only",
		});
		const timeoutSignal = AbortSignal.timeout(grant.budget.timeoutMs);

		const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
		let sandbox: SandboxHandle | undefined;
		let terminationReason: "completed" | "provider_failed" | "kill_switch" | "deadline_exceeded" | "cancelled" =
			"completed";
		try {
			sandbox = await this.#sandbox.create(context, sandboxRequest, combinedSignal);
			combinedSignal.throwIfAborted();
			{
				const result = await provider.execute(
					context,
					invocation,
					sandbox,
					AbortSignal.any([combinedSignal, sandbox.executionSignal]),
				);
				// Provider 可能不配合取消；迟到成功不能覆盖已取消的执行事实。
				combinedSignal.throwIfAborted();
				sandbox.executionSignal.throwIfAborted();
				const resultBytes = Buffer.byteLength(result.text, "utf8");
				if (resultBytes > descriptor.maxResultBytes) {
					throw new KernelError("TOOL_RESULT_TOO_LARGE", "工具结果超过描述符声明的上限。", false, {
						resultBytes,
						maxResultBytes: descriptor.maxResultBytes,
					});
				}
				return result;
			}
		} catch (error) {
			terminationReason =
				signal.aborted && signal.reason === "kill_switch"
					? "kill_switch"
					: timeoutSignal.aborted
						? "deadline_exceeded"
						: signal.aborted
							? "cancelled"
							: "provider_failed";
			if (error instanceof KernelError) throw error;
			throw new KernelError("TOOL_EXECUTION_FAILED", "工具 Provider 或安全执行链失败。", true);
		} finally {
			if (sandbox) await this.#sandbox.terminate(context, sandbox, terminationReason);
		}
	}
}
