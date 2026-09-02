import { KernelError, type RequestContext, type TimePort } from "../contracts/index.ts";
import { assertRequestContext } from "./request-context-guard.ts";

export type KillSwitchScope =
	| { readonly kind: "GLOBAL" }
	| { readonly kind: "RUNTIME"; readonly runtimeId: string }
	| { readonly kind: "TENANT"; readonly runtimeId: string; readonly tenantId: string }
	| { readonly kind: "AGENT"; readonly runtimeId: string; readonly tenantId: string; readonly agentId: string }
	| { readonly kind: "SESSION"; readonly runtimeId: string; readonly tenantId: string; readonly sessionId: string }
	| { readonly kind: "RUN"; readonly runtimeId: string; readonly tenantId: string; readonly runId: string }
	| { readonly kind: "TOOL"; readonly runtimeId: string; readonly tenantId: string; readonly toolName: string }
	| {
			readonly kind: "TOOL_CALL";
			readonly runtimeId: string;
			readonly tenantId: string;
			readonly toolCallId: string;
	  };

/** 一次检查的完整身份投影；所有已知层级都会参与紧急停止判定。 */
export interface KillSwitchTarget {
	readonly runtimeId: string;
	readonly tenantId: string;
	readonly agentId?: string;
	readonly sessionId?: string;
	readonly runId?: string;
	readonly toolName?: string;
	readonly toolCallId?: string;
}

export interface KillSwitchCommand {
	readonly reasonCode: string;
	readonly operatorRef: string;
}

export interface ActiveKillSwitch {
	readonly scope: KillSwitchScope;
	readonly reasonCode: string;
	readonly operatorRef: string;
	readonly activatedAt: string;
}

/** 一个 epoch 下的不可变判定；active 为 true 时调用方必须拒绝或终止动作。 */
export interface KillSwitchSnapshot {
	readonly epoch: number;
	readonly active: boolean;
	readonly checkedAt: string;
	readonly checkedScopes: readonly KillSwitchScope[];
	readonly blockers: readonly ActiveKillSwitch[];
}

export interface KillSwitchChange {
	readonly changed: boolean;
	readonly snapshot: KillSwitchSnapshot;
}

interface Watcher {
	readonly target: KillSwitchTarget;
	readonly pending: KillSwitchSnapshot[];
	wake: (() => void) | undefined;
}

const SCOPE_ORDER: Readonly<Record<KillSwitchScope["kind"], number>> = Object.freeze({
	GLOBAL: 0,
	RUNTIME: 1,
	TENANT: 2,
	AGENT: 3,
	SESSION: 4,
	RUN: 5,
	TOOL: 6,
	TOOL_CALL: 7,
});

/**
 * Kernel 内存中的分层紧急停止权威源。
 *
 * 启停只改变紧急拒绝状态，不修改正常授权政策。生产部署可用持久化实现替换，
 * 但必须保持相同的 epoch、幂等和失败关闭语义。
 */
export class InMemoryKillSwitch {
	readonly #activeByScope = new Map<string, ActiveKillSwitch>();
	readonly #timePort: TimePort;
	readonly #watchers = new Set<Watcher>();
	#epoch = 0;

	public constructor(timePort: TimePort) {
		this.#timePort = timePort;
	}

	/** 返回目标所有已声明层级的权威快照；任一匹配项都会令 active 为 true。 */
	public check(context: RequestContext, target: KillSwitchTarget): KillSwitchSnapshot {
		assertRequestContext(context, this.#timePort);
		const checkedScopes = this.#scopesFor(context, target);
		return this.#snapshot(checkedScopes);
	}

	/** 幂等启用一个作用域；已经启用时不改变 epoch，也不覆盖首次触发证据。 */
	public enable(context: RequestContext, scope: KillSwitchScope, command: KillSwitchCommand): KillSwitchChange {
		assertRequestContext(context, this.#timePort);
		this.#assertScope(context, scope);
		this.#assertCommand(command);
		const key = this.#scopeKey(scope);
		if (this.#activeByScope.has(key)) {
			return Object.freeze({ changed: false, snapshot: this.#snapshot([scope]) });
		}

		const active = Object.freeze({
			scope: this.#freezeScope(scope),
			reasonCode: command.reasonCode,
			operatorRef: command.operatorRef,
			activatedAt: this.#timePort.now().isoUtc,
		});
		this.#assertEpochCapacity();
		this.#activeByScope.set(key, active);
		this.#advanceEpoch();
		return Object.freeze({ changed: true, snapshot: this.#snapshot([scope]) });
	}

	/** 幂等停用一个作用域；不存在的作用域保持当前 epoch。 */
	public disable(context: RequestContext, scope: KillSwitchScope): KillSwitchChange {
		assertRequestContext(context, this.#timePort);
		this.#assertScope(context, scope);
		const key = this.#scopeKey(scope);
		if (!this.#activeByScope.has(key)) {
			return Object.freeze({ changed: false, snapshot: this.#snapshot([scope]) });
		}
		this.#assertEpochCapacity();
		this.#activeByScope.delete(key);
		this.#advanceEpoch();
		return Object.freeze({ changed: true, snapshot: this.#snapshot([scope]) });
	}

	/**
	 * 先产生当前快照，再在每个实际状态变更后产生新快照。
	 * AbortSignal 用于有界关闭订阅；取消后不会继续占用监听资源。
	 */
	public async *watch(
		context: RequestContext,
		target: KillSwitchTarget,
		signal: AbortSignal,
	): AsyncIterable<KillSwitchSnapshot> {
		assertRequestContext(context, this.#timePort);
		this.#scopesFor(context, target);
		signal.throwIfAborted();
		const watcher: Watcher = { target: Object.freeze({ ...target }), pending: [], wake: undefined };
		this.#watchers.add(watcher);
		const abort = (): void => watcher.wake?.();
		signal.addEventListener("abort", abort, { once: true });
		try {
			yield this.check(context, target);
			while (!signal.aborted) {
				if (watcher.pending.length === 0) {
					await new Promise<void>((resolve) => {
						watcher.wake = resolve;
					});
					watcher.wake = undefined;
				}
				if (signal.aborted) break;
				const snapshot = watcher.pending.shift();
				if (snapshot) yield snapshot;
			}
		} finally {
			signal.removeEventListener("abort", abort);
			this.#watchers.delete(watcher);
		}
	}

	#advanceEpoch(): void {
		this.#epoch += 1;
		for (const watcher of this.#watchers) {
			watcher.pending.length = 0;
			watcher.pending.push(this.#snapshot(this.#scopesForTarget(watcher.target)));
			watcher.wake?.();
		}
	}

	#assertEpochCapacity(): void {
		if (this.#epoch === Number.MAX_SAFE_INTEGER) {
			throw new KernelError("CONTEXT_INVALID", "Kill switch epoch 已耗尽，系统必须保持拒绝并重新初始化。", false);
		}
	}

	#snapshot(scopes: readonly KillSwitchScope[]): KillSwitchSnapshot {
		const blockers = scopes
			.map((scope) => this.#activeByScope.get(this.#scopeKey(scope)))
			.filter((entry): entry is ActiveKillSwitch => entry !== undefined);
		return Object.freeze({
			epoch: this.#epoch,
			active: blockers.length > 0,
			checkedAt: this.#timePort.now().isoUtc,
			checkedScopes: Object.freeze(scopes.map((scope) => this.#freezeScope(scope))),
			blockers: Object.freeze([...blockers]),
		});
	}

	#scopesFor(context: RequestContext, target: KillSwitchTarget): readonly KillSwitchScope[] {
		if (target.tenantId !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "Kill switch 目标不属于当前租户。", false);
		}
		return this.#scopesForTarget(target);
	}

	#scopesForTarget(target: KillSwitchTarget): readonly KillSwitchScope[] {
		this.#assertIdentifier(target.runtimeId, "runtimeId");
		this.#assertIdentifier(target.tenantId, "tenantId");
		if (target.toolCallId !== undefined && target.runId === undefined) {
			throw new KernelError("CONTEXT_INVALID", "TOOL_CALL 检查必须同时绑定 runId。", false);
		}

		const scopes: KillSwitchScope[] = [
			{ kind: "GLOBAL" },
			{ kind: "RUNTIME", runtimeId: target.runtimeId },
			{ kind: "TENANT", runtimeId: target.runtimeId, tenantId: target.tenantId },
		];
		if (target.agentId !== undefined) {
			this.#assertIdentifier(target.agentId, "agentId");
			scopes.push({
				kind: "AGENT",
				runtimeId: target.runtimeId,
				tenantId: target.tenantId,
				agentId: target.agentId,
			});
		}
		if (target.sessionId !== undefined) {
			this.#assertIdentifier(target.sessionId, "sessionId");
			scopes.push({
				kind: "SESSION",
				runtimeId: target.runtimeId,
				tenantId: target.tenantId,
				sessionId: target.sessionId,
			});
		}
		if (target.runId !== undefined) {
			this.#assertIdentifier(target.runId, "runId");
			scopes.push({ kind: "RUN", runtimeId: target.runtimeId, tenantId: target.tenantId, runId: target.runId });
		}
		if (target.toolName !== undefined) {
			this.#assertIdentifier(target.toolName, "toolName");
			scopes.push({
				kind: "TOOL",
				runtimeId: target.runtimeId,
				tenantId: target.tenantId,
				toolName: target.toolName,
			});
		}
		if (target.toolCallId !== undefined) {
			this.#assertIdentifier(target.toolCallId, "toolCallId");
			scopes.push({
				kind: "TOOL_CALL",
				runtimeId: target.runtimeId,
				tenantId: target.tenantId,
				toolCallId: target.toolCallId,
			});
		}
		return Object.freeze(scopes.map((scope) => this.#freezeScope(scope)));
	}

	#assertScope(context: RequestContext, scope: KillSwitchScope): void {
		if (scope.kind === "GLOBAL") return;
		this.#assertIdentifier(scope.runtimeId, "runtimeId");
		if (scope.kind === "RUNTIME") return;
		this.#assertIdentifier(scope.tenantId, "tenantId");
		if (scope.tenantId !== context.tenant.tenantId) {
			throw new KernelError("TENANT_SCOPE_VIOLATION", "Kill switch 作用域不属于当前租户。", false);
		}
		switch (scope.kind) {
			case "TENANT":
				return;
			case "AGENT":
				this.#assertIdentifier(scope.agentId, "agentId");
				return;
			case "SESSION":
				this.#assertIdentifier(scope.sessionId, "sessionId");
				return;
			case "RUN":
				this.#assertIdentifier(scope.runId, "runId");
				return;
			case "TOOL":
				this.#assertIdentifier(scope.toolName, "toolName");
				return;
			case "TOOL_CALL":
				this.#assertIdentifier(scope.toolCallId, "toolCallId");
				return;
		}
	}

	#assertCommand(command: KillSwitchCommand): void {
		this.#assertIdentifier(command.reasonCode, "reasonCode");
		this.#assertIdentifier(command.operatorRef, "operatorRef");
	}

	#assertIdentifier(value: string, field: string): void {
		if (value.trim() === "" || value.length > 256 || value.includes("\u0000")) {
			throw new KernelError("CONTEXT_INVALID", `Kill switch ${field} 缺失或格式无效。`, false);
		}
	}

	#scopeKey(scope: KillSwitchScope): string {
		switch (scope.kind) {
			case "GLOBAL":
				return JSON.stringify([scope.kind]);
			case "RUNTIME":
				return JSON.stringify([scope.kind, scope.runtimeId]);
			case "TENANT":
				return JSON.stringify([scope.kind, scope.runtimeId, scope.tenantId]);
			case "AGENT":
				return JSON.stringify([scope.kind, scope.runtimeId, scope.tenantId, scope.agentId]);
			case "SESSION":
				return JSON.stringify([scope.kind, scope.runtimeId, scope.tenantId, scope.sessionId]);
			case "RUN":
				return JSON.stringify([scope.kind, scope.runtimeId, scope.tenantId, scope.runId]);
			case "TOOL":
				return JSON.stringify([scope.kind, scope.runtimeId, scope.tenantId, scope.toolName]);
			case "TOOL_CALL":
				return JSON.stringify([scope.kind, scope.runtimeId, scope.tenantId, scope.toolCallId]);
		}
	}

	#freezeScope(scope: KillSwitchScope): KillSwitchScope {
		return Object.freeze({ ...scope });
	}
}

/** 控制面展示用的稳定优先级；阻断语义不依赖数组输入顺序。 */
export function compareKillSwitchScopes(left: KillSwitchScope, right: KillSwitchScope): number {
	return SCOPE_ORDER[left.kind] - SCOPE_ORDER[right.kind];
}
