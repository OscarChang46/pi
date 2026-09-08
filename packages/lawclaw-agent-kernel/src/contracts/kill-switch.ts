import type { RequestContext } from "./types.ts";

/** 紧急停止作用域的判别联合；上级停止覆盖对应下级，不扩大正常权限。 */
export type KillSwitchScope =
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */ readonly kind: "GLOBAL";
	  }
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "RUNTIME";
			/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
			readonly runtimeId: string;
	  }
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "TENANT";
			/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
			readonly runtimeId: string;
			/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
			readonly tenantId: string;
	  }
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "AGENT";
			/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
			readonly runtimeId: string;
			/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
			readonly tenantId: string;
			/** Agent 的稳定技术标识；不承载业务角色解释。 */
			readonly agentId: string;
	  }
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "SESSION";
			/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
			readonly runtimeId: string;
			/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
			readonly tenantId: string;
			/** 关联技术会话的稳定标识；不代表 Run 状态所有权。 */
			readonly sessionId: string;
	  }
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "RUN";
			/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
			readonly runtimeId: string;
			/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
			readonly tenantId: string;
			/** 独立技术 Run 的稳定标识；必须与本次执行关联一致。 */
			readonly runId: string;
	  }
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "TOOL";
			/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
			readonly runtimeId: string;
			/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
			readonly tenantId: string;
			/** 工具目录中的稳定名称；未注册或未经授权的名称不得执行。 */
			readonly toolName: string;
	  }
	| {
			/** 当前联合分支的判别值；调用方必须按分支处理对应字段。 */
			readonly kind: "TOOL_CALL";
			/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
			readonly runtimeId: string;
			/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
			readonly tenantId: string;
			/** 单次工具调用关联标识，必须与模型候选和授权一致。 */
			readonly toolCallId: string;
	  };

/** 一次检查的完整身份投影；所有已知层级都会参与紧急停止判定。 */
export interface KillSwitchTarget {
	/** 本地执行作用域标识；用于停止与权限绑定，不表示 Session 所属进程。 */
	readonly runtimeId: string;
	/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
	readonly tenantId: string;
	/** Agent 的稳定技术标识；不承载业务角色解释。 未提供时不添加该层级约束。 */
	readonly agentId?: string;
	/** 关联技术会话的稳定标识；不代表 Run 状态所有权。 未提供时不添加该层级约束。 */
	readonly sessionId?: string;
	/** 独立技术 Run 的稳定标识；必须与本次执行关联一致。 未提供时不添加该层级约束。 */
	readonly runId?: string;
	/** 工具目录中的稳定名称；未注册或未经授权的名称不得执行。 未提供时不添加该层级约束。 */
	readonly toolName?: string;
	/** 单次工具调用关联标识，必须与模型候选和授权一致。 未提供时不添加该层级约束。 */
	readonly toolCallId?: string;
}

/** 启用紧急停止时的非敏感原因和操作来源；不承载权限授予。 */
export interface KillSwitchCommand {
	/** 稳定原因码；供技术判断及审计使用，不依赖展示文案。 */
	readonly reasonCode: string;
	/** 触发操作的外部可信引用，不包含姓名或凭据正文。 */
	readonly operatorRef: string;
}

/** 已生效的停止记录；只阻断对应作用域，不能授予权限。 */
export interface ActiveKillSwitch {
	/** 该记录唯一约束的停止作用域。 */
	readonly scope: KillSwitchScope;
	/** 稳定原因码；供技术判断及审计使用，不依赖展示文案。 */
	readonly reasonCode: string;
	/** 触发操作的外部可信引用，不包含姓名或凭据正文。 */
	readonly operatorRef: string;
	/** 停止首次生效的 ISO-8601 UTC 时间。 */
	readonly activatedAt: string;
}

/** 一个 epoch 下的不可变判定；active 为 true 时调用方必须拒绝或终止动作。 */
export interface KillSwitchSnapshot {
	/** 停止状态的单调版本号；幂等重复操作不增加版本。 */
	readonly epoch: number;
	/** 是否命中停止记录；为 true 时必须阻断或终止。 */
	readonly active: boolean;
	/** 本次检查的 ISO-8601 UTC 时间。 */
	readonly checkedAt: string;
	/** 本次检查涵盖的作用域快照，按层次顺序排列。 */
	readonly checkedScopes: readonly KillSwitchScope[];
	/** 命中的停止记录；空集合表示未命中。 */
	readonly blockers: readonly ActiveKillSwitch[];
}

/** 启停操作结果；区分实际变化与幂等重复请求。 */
export interface KillSwitchChange {
	/** 本次操作是否实际改变停止状态。 */
	readonly changed: boolean;
	/** 操作完成后的不可变停止快照。 */
	readonly snapshot: KillSwitchSnapshot;
}

/** 运行路径只读紧急停止端口；不允许调用方启停策略。 */
export interface KillSwitchPort {
	/** 检查目标作用域；active 为 true 时必须阻断。 */
	check(context: RequestContext, target: KillSwitchTarget): KillSwitchSnapshot;
	/** 订阅停止状态；signal 取消后实现必须清理订阅。 */
	watch(context: RequestContext, target: KillSwitchTarget, signal: AbortSignal): AsyncIterable<KillSwitchSnapshot>;
}
