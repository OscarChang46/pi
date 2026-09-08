import type { PermissionGrant } from "./permissions.ts";
import type { ToolExecutionScope } from "./tool-scope.ts";
import type { RequestContext, ToolDescriptor, ToolInvocation, ToolPolicy, ToolResult } from "./types.ts";

/** 已经经过控制层技术判定的调用；Grant 仍不是一次性 Permit。 */
export interface AuthorizedToolCall {
	/** 绑定授权的规范化调用；执行前需重新核对摘要。 */
	readonly invocation: ToolInvocation;
	/** 冻结身份和权限上限；执行层不得扩权。 */
	readonly scope: ToolExecutionScope;
	/** 已签发的短时授权；不具备耐久消费或重放保护。 */
	readonly grant: PermissionGrant;
}
/** 控制层访问工具目录和授权执行的唯一端口；BND-L13-001 的当前进程内子集。 */
export interface ToolRuntimePort {
	/** 初始化有界目录；同实例仅服务同一作用域。 */
	initialize(context: RequestContext): Promise<void>;
	/** 返回描述快照，不暴露 Provider 实例。 */
	list(): readonly ToolDescriptor[];
	/** 验证授权后派发执行；取消与错误沿调用链传播，不自动重试。 */
	execute(context: RequestContext, request: AuthorizedToolCall, signal: AbortSignal): Promise<ToolResult>;
}
/** 控制推进算法使用的工具协调端口，包含判定前检查。 */
export interface ToolCoordinatorPort {
	/** 初始化目录，失败时禁止继续模型调用。 */
	initialize(context: RequestContext): Promise<void>;
	/** 产生本轮模型可见的工具快照。 */
	listAllowed(context: RequestContext, policy: ToolPolicy, scope: ToolExecutionScope): readonly ToolDescriptor[];
	/** 检查停止状态，停止时抛出 KernelError。 */
	assertActive(context: RequestContext, scope: ToolExecutionScope): void;
	/** 判定并提交调用；拒绝、取消时不得进入执行层。 */
	execute(
		context: RequestContext,
		scope: ToolExecutionScope,
		invocation: ToolInvocation,
		policy: ToolPolicy,
		signal: AbortSignal,
	): Promise<ToolResult>;
}
/** 工具层调用的受控执行端口；BND-L34-001 当前只读子集。 */
export interface ToolExecutionPort {
	/** 读取已装配 Provider 的描述；不包含路由与授权策略。 */
	describe(context: RequestContext): Promise<readonly ToolDescriptor[]>;
	/** 执行守卫已验证的调用；实现负责沙箱创建、取消传播与 finally 回收。 */
	execute(context: RequestContext, request: AuthorizedToolCall, signal: AbortSignal): Promise<ToolResult>;
}
