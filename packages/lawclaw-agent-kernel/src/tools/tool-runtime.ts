import { computeArgumentsDigest, computeToolDescriptorDigest } from "../contracts/authorization-digest.ts";
import {
	KernelError,
	type RequestContext,
	type TimePort,
	type ToolDescriptor,
	type ToolResult,
} from "../contracts/index.ts";
import type { KillSwitchPort } from "../contracts/kill-switch.ts";
import type { GrantValidationPort } from "../contracts/permissions.ts";
import { assertRequestContext } from "../contracts/request-context-guard.ts";
import type { AuthorizedToolCall, ToolExecutionPort, ToolRuntimePort } from "../contracts/tool-runtime.ts";

/** 工具目录与执行守卫；只校验已有 Grant，不进行策略判定，不实现一次性 Permit。 */
export class ToolRuntime implements ToolRuntimePort {
	readonly #execution: ToolExecutionPort;
	readonly #validation: GrantValidationPort;
	readonly #killSwitch: KillSwitchPort;
	readonly #time: TimePort;
	readonly #capacity: number;
	readonly #catalog = new Map<string, ToolDescriptor>();
	#tenantId: string | undefined;
	/** 注入受控执行与只读安全端口；capacity 是目录条目上限。 */
	constructor(
		execution: ToolExecutionPort,
		validation: GrantValidationPort,
		killSwitch: KillSwitchPort,
		time: TimePort,
		capacity: number,
	) {
		this.#execution = execution;
		this.#validation = validation;
		this.#killSwitch = killSwitch;
		this.#time = time;
		this.#capacity = capacity;
	}
	/** 注册当前作用域目录；重复名称或超出容量时失败关闭。 */
	async initialize(context: RequestContext): Promise<void> {
		assertRequestContext(context, this.#time);
		if (this.#tenantId) {
			if (this.#tenantId !== context.tenant.tenantId)
				throw new KernelError("TENANT_SCOPE_VIOLATION", "工具目录作用域不匹配。");
			return;
		}
		const catalog = new Map<string, ToolDescriptor>();
		for (const descriptor of await this.#execution.describe(context)) {
			if (catalog.has(descriptor.name) || catalog.size >= this.#capacity)
				throw new KernelError("TOOL_NOT_ALLOWED", "工具目录重复或超出容量。");
			catalog.set(descriptor.name, Object.freeze(structuredClone(descriptor)));
		}
		for (const [name, descriptor] of catalog) this.#catalog.set(name, descriptor);
		this.#tenantId = context.tenant.tenantId;
	}
	/** 返回目录快照；未初始化时拒绝调用。 */
	list(): readonly ToolDescriptor[] {
		if (!this.#tenantId) throw new KernelError("TOOL_NOT_ALLOWED", "工具目录尚未初始化。");
		return Object.freeze(structuredClone([...this.#catalog.values()]));
	}
	/** 校验调用与 Grant 绑定、时效及停止状态；执行期间传播取消，结束后关闭订阅。 */
	async execute(context: RequestContext, request: AuthorizedToolCall, signal: AbortSignal): Promise<ToolResult> {
		assertRequestContext(context, this.#time);
		signal.throwIfAborted();
		const { invocation, scope, grant } = request;
		const descriptor = this.#catalog.get(invocation.toolName);
		if (
			this.#tenantId !== context.tenant.tenantId ||
			!descriptor ||
			grant.runId !== scope.runId ||
			grant.toolCallId !== invocation.toolCallId ||
			grant.toolName !== invocation.toolName ||
			grant.toolVersion !== descriptor.version ||
			grant.toolDescriptorHash !== computeToolDescriptorDigest(descriptor) ||
			grant.argumentsHash !== computeArgumentsDigest(invocation.arguments)
		)
			throw new KernelError("TOOL_NOT_ALLOWED", "工具调用与授权绑定不一致。");
		const validation = await this.#validation.revalidate(context, grant, signal);
		if (validation.kind !== "VALID" || validation.grantDigest !== grant.grantDigest)
			throw new KernelError("TOOL_NOT_ALLOWED", "工具权限 Grant 已失效。");
		signal.throwIfAborted();
		const target = {
			runtimeId: scope.runtimeId,
			tenantId: context.tenant.tenantId,
			agentId: scope.agentId,
			sessionId: scope.sessionId,
			runId: scope.runId,
			toolName: invocation.toolName,
			toolCallId: invocation.toolCallId,
		};
		if (this.#killSwitch.check(context, target).active)
			throw new KernelError("TOOL_NOT_ALLOWED", "Kill Switch 已阻断工具动作。");
		const stopped = new AbortController();
		const watchAbort = new AbortController();
		const watching = (async () => {
			try {
				for await (const snapshot of this.#killSwitch.watch(context, target, watchAbort.signal)) {
					if (snapshot.active) {
						stopped.abort("kill_switch");
						return;
					}
				}
			} catch {
				if (!watchAbort.signal.aborted) stopped.abort("kill_switch");
			}
		})();
		try {
			return await this.#execution.execute(context, request, AbortSignal.any([signal, stopped.signal]));
		} finally {
			watchAbort.abort();
			await watching;
		}
	}
}
