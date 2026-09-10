import type { ExpectedChildObservation } from "../../contracts/control/context-engine/assembly-basis.ts";
import type { SourceRecord } from "../../contracts/control/context-engine/assembly-messages.ts";
import type { RunSessionContext } from "../../contracts/control/context-engine/runtime-preparation.ts";
import {
	ACTIVE_RUN_BINDING_STATE,
	type ActiveRunBinding,
	type SessionAnchor,
} from "../../contracts/control/session-manager/session-manager-contract.ts";
import { KernelError } from "../../contracts/errors.ts";
import { flowId, freezeDecision } from "../../contracts/flow-value.ts";

/** 创建当前 Run 占用所需的稳定身份；调用方必须先冻结受理载荷。 */
export interface ReserveSessionRunInput {
	/** 将占用 Session 的 AgentRun 标识。 */
	readonly runId: string;
	/** Session 占用命令的稳定标识。 */
	readonly reserveCommandId: string;
	/** RunRegistry 受理命令的稳定标识。 */
	readonly admissionCommandId: string;
	/** 冻结受理载荷的摘要。 */
	readonly payloadDigest: string;
}

/** 技术会话档案；只拥有当前 Run 绑定，不保存 Run 历史或执行器。 */
export class AgentSession {
	/** 关联技术会话的稳定标识；不代表 Run 状态所有权。 */
	public readonly sessionId: string;
	/** 外部已编译的隔离作用域标识；保留现有隔离检查，不在此解释 RBAC。 */
	public readonly scopeKey: string;
	/** Agent 的稳定技术标识；不承载业务角色解释。 */
	public readonly agentId: string;
	/** 当前已确认 Session 版本；首个内存切片只创建 Root@0。 */
	#version = 0;
	/** Root@0 的空历史头引用；后续 append 持久切片负责推进。 */
	#headRef: string;
	#records: readonly SourceRecord[] = [];
	#observations: readonly ExpectedChildObservation[] = [];
	#activeRunBinding: ActiveRunBinding | undefined;
	#lastBindingVersion = 0;

	/** 创建技术会话档案；只保存稳定引用，不绑定执行器或进程。 */
	public constructor(sessionId: string, scopeKey: string, agentId: string) {
		this.sessionId = sessionId;
		this.scopeKey = scopeKey;
		this.agentId = agentId;
		this.#headRef = `session-head:${sessionId}:0`;
	}
	/** 已确认历史版本。 */
	public get version(): number {
		return this.#version;
	}
	/** 已确认完整历史头。 */
	public get headRef(): string {
		return this.#headRef;
	}
	/** 冻结完整历史并返回受版本与 Run 占用约束的追加能力。 */
	public contextForRun(runId: string, bindingVersion: number): RunSessionContext {
		this.#requireBinding(runId, bindingVersion);
		const anchor = this.anchor();
		return {
			anchor,
			records: this.#records,
			expectedChildObservations: this.#observations,
			commit: (records, observations) => {
				const binding = this.#requireBinding(runId, bindingVersion);
				if (binding.state !== ACTIVE_RUN_BINDING_STATE.ACTIVE || this.version !== anchor.version)
					throw new KernelError("RUN_STATE_INVALID", "Session 历史提交版本或占用已过期。");
				this.#records = freezeDecision(structuredClone([...this.#records, ...records]));
				this.#observations = freezeDecision(structuredClone([...this.#observations, ...observations]));
				this.#version++;
				this.#headRef = flowId("session-head", {
					sessionId: this.sessionId,
					version: this.version,
					records: this.#records.map((record) => record.recordRef),
				});
			},
		};
	}

	/** 返回当前已确认版本的不可变锚点，不暴露聚合可变状态。 */
	public anchor(): SessionAnchor {
		return Object.freeze({ sessionId: this.sessionId, version: this.version, headRef: this.headRef });
	}

	/** 返回当前 Run 绑定快照；缺失表示 Session 空闲。 */
	public get activeRunBinding(): ActiveRunBinding | undefined {
		return this.#activeRunBinding;
	}

	/** 原子占用内存 Session；非空绑定拒绝不同 Run，不排队也不抢占。 */
	public reserveRun(input: ReserveSessionRunInput): ActiveRunBinding {
		if (this.#activeRunBinding) {
			throw new KernelError("SESSION_RUN_ACTIVE", "同一 Session 只允许一个当前 Run 绑定。", false, {
				sessionId: this.sessionId,
				activeBindingVersion: this.#activeRunBinding.bindingVersion,
			});
		}
		this.#lastBindingVersion += 1;
		this.#activeRunBinding = Object.freeze({
			runId: input.runId,
			bindingVersion: this.#lastBindingVersion,
			state: ACTIVE_RUN_BINDING_STATE.RESERVED,
			reserveCommandId: input.reserveCommandId,
			admissionCommandId: input.admissionCommandId,
			payloadDigest: input.payloadDigest,
			admissionReceiptRef: null,
			terminalReceiptRef: null,
			stateVersion: 1,
		});
		return this.#activeRunBinding;
	}

	/** 标记受理效果未知；绑定继续占槽，只允许查询原受理命令。 */
	public markRunAdmissionUnknown(runId: string, bindingVersion: number): ActiveRunBinding {
		const binding = this.#requireBinding(runId, bindingVersion);
		if (binding.state === ACTIVE_RUN_BINDING_STATE.SUBMIT_UNKNOWN) return binding;
		if (binding.state !== ACTIVE_RUN_BINDING_STATE.RESERVED) {
			throw this.#invalidTransition(binding, "标记 Run 受理未知");
		}
		return this.#replaceBinding(binding, {
			state: ACTIVE_RUN_BINDING_STATE.SUBMIT_UNKNOWN,
		});
	}

	/** 接受 RunRegistry 的明确受理回执，将当前绑定转为 ACTIVE。 */
	public confirmRunAdmission(runId: string, bindingVersion: number, admissionReceiptRef: string): ActiveRunBinding {
		const binding = this.#requireBinding(runId, bindingVersion);
		if (binding.state === ACTIVE_RUN_BINDING_STATE.ACTIVE && binding.admissionReceiptRef === admissionReceiptRef) {
			return binding;
		}
		if (
			binding.state !== ACTIVE_RUN_BINDING_STATE.RESERVED &&
			binding.state !== ACTIVE_RUN_BINDING_STATE.SUBMIT_UNKNOWN
		) {
			throw this.#invalidTransition(binding, "确认 Run 已受理");
		}
		return this.#replaceBinding(binding, {
			state: ACTIVE_RUN_BINDING_STATE.ACTIVE,
			admissionReceiptRef,
		});
	}

	/** 明确 Run 未受理且不会迟到时释放预留槽；UNKNOWN 不得调用。 */
	public confirmRunAdmissionRejected(runId: string, bindingVersion: number): void {
		const binding = this.#requireBinding(runId, bindingVersion);
		if (
			binding.state !== ACTIVE_RUN_BINDING_STATE.RESERVED &&
			binding.state !== ACTIVE_RUN_BINDING_STATE.SUBMIT_UNKNOWN
		) {
			throw this.#invalidTransition(binding, "确认 Run 未受理");
		}
		this.#activeRunBinding = undefined;
	}

	/** 接受匹配代次的 Run 终态回执；最终 Session 写入前仍保持占槽。 */
	public beginRunRelease(runId: string, bindingVersion: number, terminalReceiptRef: string): ActiveRunBinding {
		const binding = this.#requireBinding(runId, bindingVersion);
		if (binding.state === ACTIVE_RUN_BINDING_STATE.RELEASING && binding.terminalReceiptRef === terminalReceiptRef) {
			return binding;
		}
		if (binding.state !== ACTIVE_RUN_BINDING_STATE.ACTIVE) {
			throw this.#invalidTransition(binding, "开始释放 Run 绑定");
		}
		return this.#replaceBinding(binding, {
			state: ACTIVE_RUN_BINDING_STATE.RELEASING,
			terminalReceiptRef,
		});
	}

	/** 最终 Session 写入已确认后清空匹配绑定，允许后续 Run 顺序占用。 */
	public finalizeRunRelease(runId: string, bindingVersion: number): void {
		const binding = this.#requireBinding(runId, bindingVersion);
		if (binding.state !== ACTIVE_RUN_BINDING_STATE.RELEASING) {
			throw this.#invalidTransition(binding, "完成 Run 绑定释放");
		}
		this.#activeRunBinding = undefined;
	}

	#requireBinding(runId: string, bindingVersion: number): ActiveRunBinding {
		const binding = this.#activeRunBinding;
		if (!binding || binding.runId !== runId || binding.bindingVersion !== bindingVersion) {
			throw new KernelError("RUN_STATE_INVALID", "Run 绑定不存在、身份不匹配或已经过期。", false, {
				sessionId: this.sessionId,
				bindingVersion,
			});
		}
		return binding;
	}

	#replaceBinding(
		binding: ActiveRunBinding,
		change: Pick<ActiveRunBinding, "state"> &
			Partial<Pick<ActiveRunBinding, "admissionReceiptRef" | "terminalReceiptRef">>,
	): ActiveRunBinding {
		this.#activeRunBinding = Object.freeze({
			...binding,
			...change,
			stateVersion: binding.stateVersion + 1,
		});
		return this.#activeRunBinding;
	}

	#invalidTransition(binding: ActiveRunBinding, action: string): KernelError {
		return new KernelError("RUN_STATE_INVALID", `${action}不允许从当前绑定状态执行。`, false, {
			sessionId: this.sessionId,
			bindingVersion: binding.bindingVersion,
			bindingState: binding.state,
		});
	}
}
