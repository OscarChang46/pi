import type { RequestContext, ToolDescriptor, ToolPolicy } from "./types.ts";

/** 现有技术授权拒绝原因；需要人工确认时当前实现失败关闭。 */
export type PermissionDenialReasonCode =
	| "PERMISSION_CONTEXT_INVALID"
	| "PERMISSION_TOOL_NOT_ALLOWED"
	| "PERMISSION_RESOURCE_OUT_OF_SCOPE"
	| "PERMISSION_EGRESS_NOT_ALLOWED"
	| "PERMISSION_SECRET_NOT_ALLOWED"
	| "PERMISSION_BUDGET_EXCEEDED"
	| "PERMISSION_POLICY_MISSING"
	| "PERMISSION_GRANT_EXPIRED"
	| "PERMISSION_GRANT_STALE"
	| "HUMAN_CONFIRMATION_UNSUPPORTED";

/** 文件资源访问声明；必须属于每一层权限上限的交集。 */
export interface ResourceClaim {
	/** 不透明资源标识；不得用它绕过 Provider 的真实路径检查。 */
	readonly resourceId: string;
	/** 请求或获授的最大访问方式；read 不包含 write。 */
	readonly access: "read" | "write";
}

/** 精确网络出口声明；不允许隐式扩大目标范围。 */
export interface EgressClaim {
	/** 精确目标主机，不含通配符。 */
	readonly host: string;
	/** 目标端口整数，合法范围为 1–65535。 */
	readonly port: number;
}

/** Secret 引用声明；只携带句柄，不包含密钥正文。 */
export interface SecretClaim {
	/** 由外部机制解释的 Secret 句柄标识。 */
	readonly secretId: string;
}

/** 工具执行的时间与输出预算；不得超过上游授权。 */
export interface ToolBudget {
	/** 单次执行的最大墙钟时间，单位毫秒。 */
	readonly timeoutMs: number;
	/** 工具结果的最大 UTF-8 字节数。 */
	readonly maxResultBytes: number;
}

/** 一层权限上限。所有层都必须显式允许，后出现的层不能覆盖前一层。 */
export interface PermissionCeiling {
	/** 工具名称、风险与调用预算白名单；未明确允许的能力拒绝。 */
	readonly toolPolicy: ToolPolicy;
	/** 允许或请求的文件资源集合；实际执行必须满足授权子集约束。 */
	readonly resources: readonly ResourceClaim[];
	/** 允许或请求的精确出口集合；空集合表示无网络授权。 */
	readonly egress: readonly EgressClaim[];
	/** 允许或请求的 Secret 句柄集合；空集合表示无 Secret 授权。 */
	readonly secrets: readonly SecretClaim[];
	/** 本边界的有界资源预算，执行时不得突破上游限制。 */
	readonly budget: ToolBudget;
}

/** 权限判定所需的冻结 Run 投影；不保存或推进 Run 权威状态。 */
export interface FrozenAgentRunScope {
	/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
	readonly tenantId: string;
	/** 可信上下文中的主体引用；仅用于授权快照匹配，不查询用户目录。 */
	readonly subjectId: string;
	/** Agent 的稳定技术标识；不承载业务角色解释。 */
	readonly agentId: string;
	/** 关联技术会话的稳定标识；不代表 Run 状态所有权。 */
	readonly sessionId: string;
	/** 独立技术 Run 的稳定标识；必须与本次执行关联一致。 */
	readonly runId: string;
	/** 已编译技术策略的稳定版本引用，必须与快照匹配。 */
	readonly policySnapshotId: string;
	/** 本次操作的绝对截止时间，采用 ISO-8601 UTC。 */
	readonly deadlineAt: string;
	/** 权限判定时冻结的工具描述，不包含 Provider 实例。 */
	readonly descriptor: ToolDescriptor;
	/** 本地执行作用域的权限上限；下层只能进一步收窄。 */
	readonly runtimeCeiling: PermissionCeiling;
	/** 关联会话的权限上限；与其他上限取交集。 */
	readonly sessionCeiling: PermissionCeiling;
	/** 当前 Run 的权限上限；不能覆盖上游限制。 */
	readonly runCeiling: PermissionCeiling;
}

/** 由控制层提交的不可变动作提案；只请求判定，不执行工具。 */
export interface PermissionApprovalRequest {
	/** 单次工具调用关联标识，必须与模型候选和授权一致。 */
	readonly toolCallId: string;
	/** 工具目录中的稳定名称；未注册或未经授权的名称不得执行。 */
	readonly toolName: string;
	/** 工具契约版本，必须与目录描述和授权保持一致。 */
	readonly toolVersion: string;
	/** 完整工具描述的 SHA-256 摘要，用于拒绝授权后描述变化。 */
	readonly toolDescriptorHash: string;
	/** 规范化参数的 SHA-256 摘要，用于拒绝授权后参数变化。 */
	readonly argumentsHash: string;
	/** 本次调用请求的文件资源访问集合。 */
	readonly resourceClaims: readonly ResourceClaim[];
	/** 本次调用请求的精确网络出口；默认空集合。 */
	readonly requestedEgress: readonly EgressClaim[];
	/** 本次调用请求的 Secret 句柄；不包含正文。 */
	readonly requestedSecrets: readonly SecretClaim[];
	/** 本次调用请求的执行毫秒数与结果字节上限。 */
	readonly requestedBudget: ToolBudget;
}

/** 外部编译的技术策略快照；安全服务只消费，不解释业务身份规则。 */
export interface PolicySnapshot {
	/** 快照的稳定版本引用；不能用展示名称代替。 */
	readonly snapshotId: string;
	/** 策略撤销版本；变化后已有 Grant 必须重新验证。 */
	readonly policyEpoch: number;
	/** 快照授予的最大能力集合，参与权限交集。 */
	readonly ceiling: PermissionCeiling;
	/** 是否要求人工确认；未提供时视为无此要求，当前实现对 true 返回拒绝。 */
	readonly requiresHumanConfirmation?: boolean;
}

/** 主体在当前隔离作用域中的已编译授权快照。 */
export interface AuthorizationSnapshot {
	/** 快照的稳定版本引用；不能用展示名称代替。 */
	readonly snapshotId: string;
	/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
	readonly tenantId: string;
	/** 可信上下文中的主体引用；仅用于授权快照匹配，不查询用户目录。 */
	readonly subjectId: string;
	/** 主体授权撤销版本；变化后旧 Grant 失效。 */
	readonly authorizationEpoch: number;
	/** 快照授予的最大能力集合，参与权限交集。 */
	readonly ceiling: PermissionCeiling;
}

/** 安全服务读取已编译技术策略的端口；缺失或失败必须关闭授权。 */
export interface PolicySnapshotPort {
	/** 读取指定引用的授权快照；尊重取消，未知或跨作用域引用抛出稳定错误。 */
	get(context: RequestContext, snapshotId: string, signal: AbortSignal): Promise<PolicySnapshot>;
	/** 读取当前撤销版本；尊重取消，读取失败不得继续执行。 */
	currentEpoch(context: RequestContext, snapshotId: string, signal: AbortSignal): Promise<number>;
}

/** 安全服务读取已编译主体授权的端口；不提供认证或 RBAC 接口。 */
export interface AuthorizationSnapshotPort {
	/** 读取指定引用的授权快照；尊重取消，未知或跨作用域引用抛出稳定错误。 */
	get(context: RequestContext, subjectId: string, signal: AbortSignal): Promise<AuthorizationSnapshot>;
	/** 读取当前撤销版本；尊重取消，读取失败不得继续执行。 */
	currentEpoch(context: RequestContext, subjectId: string, signal: AbortSignal): Promise<number>;
}

/** 现有不可变短时 Grant；绑定参数、资源、版本和时效，不具备一次性 Permit 的原子消费能力。 */
export interface PermissionGrant {
	/** 技术判定的稳定标识，用于关联证据与授权。 */
	readonly decisionId: string;
	/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
	readonly tenantId: string;
	/** 可信上下文中的主体引用；仅用于授权快照匹配，不查询用户目录。 */
	readonly subjectId: string;
	/** 独立技术 Run 的稳定标识；必须与本次执行关联一致。 */
	readonly runId: string;
	/** 单次工具调用关联标识，必须与模型候选和授权一致。 */
	readonly toolCallId: string;
	/** 工具目录中的稳定名称；未注册或未经授权的名称不得执行。 */
	readonly toolName: string;
	/** 工具契约版本，必须与目录描述和授权保持一致。 */
	readonly toolVersion: string;
	/** 完整工具描述的 SHA-256 摘要，用于拒绝授权后描述变化。 */
	readonly toolDescriptorHash: string;
	/** 规范化参数的 SHA-256 摘要，用于拒绝授权后参数变化。 */
	readonly argumentsHash: string;
	/** 通过全部上限交集后的文件资源授权。 */
	readonly resourceGrants: readonly ResourceClaim[];
	/** 通过全部上限交集后的精确出口授权。 */
	readonly egressGrants: readonly EgressClaim[];
	/** 通过全部上限交集后的 Secret 句柄授权。 */
	readonly secretGrants: readonly SecretClaim[];
	/** 本边界的有界资源预算，执行时不得突破上游限制。 */
	readonly budget: ToolBudget;
	/** 已编译技术策略的稳定版本引用，必须与快照匹配。 */
	readonly policySnapshotId: string;
	/** 策略撤销版本；变化后已有 Grant 必须重新验证。 */
	readonly policyEpoch: number;
	/** 判定使用的主体授权快照引用。 */
	readonly authorizationSnapshotId: string;
	/** 主体授权撤销版本；变化后旧 Grant 失效。 */
	readonly authorizationEpoch: number;
	/** 授权失效的 ISO-8601 UTC 时间；到期必须拒绝。 */
	readonly expiresAt: string;
	/** Grant 内容摘要；用于一致性复核，不是数字签名或防重放凭据。 */
	readonly grantDigest: string;
}

/** 当前支持 ALLOW 或 DENY 的技术判定；尚未实现异步 Ask 流程。 */
export type PermissionDecision =
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "ALLOW";
			/** 技术判定的稳定标识，用于关联证据与授权。 */
			readonly decisionId: string;
			/** 稳定原因码；供技术判断及审计使用，不依赖展示文案。 */
			readonly reasonCode: "POLICY_ALLOWED";
			/** 仅 ALLOW 分支提供的不可变短时授权。 */
			readonly grant: PermissionGrant;
			/** 判定输入与快照的非敏感摘要；不保存原始凭据。 */
			readonly evidenceDigest: string;
			/** 技术判定发生的 ISO-8601 UTC 时间。 */
			readonly evaluatedAt: string;
	  }
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "DENY";
			/** 技术判定的稳定标识，用于关联证据与授权。 */
			readonly decisionId: string;
			/** 稳定原因码；供技术判断及审计使用，不依赖展示文案。 */
			readonly reasonCode: PermissionDenialReasonCode;
			/** 判定输入与快照的非敏感摘要；不保存原始凭据。 */
			readonly evidenceDigest: string;
			/** 技术判定发生的 ISO-8601 UTC 时间。 */
			readonly evaluatedAt: string;
	  };

/** 已有 Grant 的有效性检查结果；不产生新的权限判定。 */
export type RevalidationResult =
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "VALID";
			/** Grant 内容摘要；用于一致性复核，不是数字签名或防重放凭据。 */
			readonly grantDigest: string;
			/** 有效性复核发生的 ISO-8601 UTC 时间。 */
			readonly revalidatedAt: string;
	  }
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "INVALID";
			/** 稳定原因码；供技术判断及审计使用，不依赖展示文案。 */
			readonly reasonCode: PermissionDenialReasonCode;
			/** 有效性复核发生的 ISO-8601 UTC 时间。 */
			readonly revalidatedAt: string;
	  };

/** Kernel 内部端口；不得由 Gateway、Runtime Adapter 或 Provider 暴露。 */
export interface PermissionApprovalPort {
	/** 根据冻结作用域与动作提案计算权限交集；取消、快照缺失和人工确认要求均拒绝，不执行动作。 */
	evaluate(
		context: RequestContext,
		runScope: FrozenAgentRunScope,
		request: PermissionApprovalRequest,
		signal: AbortSignal,
	): Promise<PermissionDecision>;
	/** 复核 Grant 摘要、有效期和撤销版本；取消或状态未知时无效，不扩大或重新签发授权。 */
	revalidate(context: RequestContext, grant: PermissionGrant, signal: AbortSignal): Promise<RevalidationResult>;
}

/** 控制层可请求技术判定；不提供执行或再次授权入口。 */
export type PermissionDecisionPort = Pick<PermissionApprovalPort, "evaluate">;
/** 工具守卫只验证已有 Grant；不能发起第二次策略判定。 */
export type GrantValidationPort = Pick<PermissionApprovalPort, "revalidate">;
