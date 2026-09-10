import { randomUUID } from "node:crypto";
import { decodeCandidate } from "../../contracts/control/context-engine/candidate-codec.ts";
import { type AgentRunStore, RunAdmissionRejected } from "../../contracts/control/run-registry/run-storage.ts";
import type {
	EnsureSessionCommand,
	EnsureSessionResult,
	SessionCommandPort,
	SessionLookupResult,
	SessionQueryPort,
} from "../../contracts/control/session-manager/session-manager-contract.ts";
import type {
	DurableSession,
	SessionPersistence,
} from "../../contracts/control/session-manager/session-persistence.ts";
import type { FlowArtifactStore } from "../../contracts/flow-artifacts.ts";
import type { AdvanceInput } from "../../contracts/flow-engine.ts";
import { flowDigest, flowId } from "../../contracts/flow-value.ts";
import { isTerminalReActState, REACT_FLOW_STATE } from "../../contracts/react-flow-values.ts";
import type { RequestContext } from "../../contracts/types.ts";
import { completedRunHistory } from "../context-engine/completed-run-history.ts";
import { projectFlowHistory } from "../context-engine/flow-history-projection.ts";

/** 单租户本地 Session 协调；独立事务占槽、原输入受理、确认历史后释放。 */
export class DurableSessionManager implements SessionQueryPort, SessionCommandPort {
	readonly #repository: SessionPersistence;
	readonly #runs: AgentRunStore;
	readonly #artifacts: FlowArtifactStore;
	readonly #scope: string;
	/** 注入已限定作用域的存储；构造不扫描、不执行模型。 */
	constructor(repository: SessionPersistence, runs: AgentRunStore, artifacts: FlowArtifactStore, scope: string) {
		this.#repository = repository;
		this.#runs = runs;
		this.#artifacts = artifacts;
		this.#scope = scope;
	}
	/** 纯读 Root 映射；不存在时不生成 Session ID。 */
	lookup(context: RequestContext, logicalKey: string): SessionLookupResult {
		this.#authorize(context);
		const session = this.#repository.lookup(logicalKey);
		return session ? { state: "found", anchor: session.anchor } : { state: "absent" };
	}
	/** 候选成功后显式创建；原命令回执与映射在同一事务持久化。 */
	ensure(context: RequestContext, command: EnsureSessionCommand): EnsureSessionResult {
		this.#authorize(context);
		if (command.intent.parent !== null || !command.commandId || !command.intent.logicalKey)
			throw new Error("SESSION_INTENT_INVALID");
		const digest = flowDigest(command.intent);
		return this.#repository.transaction(() => {
			const receiptId = `ensure:${command.commandId}`;
			const prior = this.#repository.receipt(receiptId, digest);
			if (prior !== null) return JSON.parse(prior) as EnsureSessionResult;
			let session = this.#repository.lookup(command.intent.logicalKey);
			const created = session === null;
			if (session && flowDigest(session.intent) !== digest) throw new Error("SESSION_BINDING_MISMATCH");
			if (!session) {
				const sessionId = randomUUID();
				session = {
					anchor: { sessionId, version: 0, headRef: flowId("session-history", { sessionId }) },
					intent: command.intent,
					revision: 0,
					bindingVersion: 0,
					active: null,
					admission: null,
					records: [],
					observations: [],
				};
				this.#repository.save(session, null);
			}
			const result = { anchor: session.anchor, created };
			this.#repository.record(receiptId, digest, JSON.stringify(result));
			return result;
		});
	}
	/** 读取当前权威历史及绑定，不按 Run 数量推算版本。 */
	snapshot(sessionId: string): DurableSession {
		const session = this.#repository.get(sessionId);
		if (!session) throw new Error("SESSION_NOT_FOUND");
		return session;
	}
	/** 原子占槽后派发原输入；任何未知错误保留绑定与 outbox，禁止第二 Run。 */
	admit(input: AdvanceInput, parent?: AdvanceInput): void {
		const digest = flowDigest(input);
		const receiptId = `reserve:${input.run.runId}`;
		this.#repository.transaction(() => {
			const rejected = this.#repository.receipt(`reject:${input.run.runId}`, digest);
			if (rejected !== null) throw new RunAdmissionRejected(rejected);
			if (this.#repository.receipt(receiptId, digest) !== null) return;
			const session = this.snapshot(input.session.sessionId);
			if (session.active) throw new Error("SESSION_RUN_ACTIVE");
			if (
				session.anchor.version !== input.session.version ||
				session.anchor.headRef !== input.session.historyHeadRef
			)
				throw new Error("FLOW_SESSION_VERSION_CONFLICT");
			const bindingVersion = session.bindingVersion + 1;
			this.#repository.save(
				{
					...session,
					revision: session.revision + 1,
					bindingVersion,
					active: {
						runId: input.run.runId,
						bindingVersion,
						state: "RESERVED",
						reserveCommandId: receiptId,
						admissionCommandId: input.run.runId,
						payloadDigest: digest,
						admissionReceiptRef: null,
						terminalReceiptRef: null,
						stateVersion: 0,
					},
					admission: { input, parent: parent ?? null },
				},
				session.revision,
			);
			this.#repository.record(receiptId, digest, String(bindingVersion));
		});
		this.#dispatch(input.session.sessionId, input.run.runId);
	}
	/** RunRegistry 受理前校验耐久授权；已存在 Run 重放由原受理摘要验证。 */
	assertAdmission(input: AdvanceInput): void {
		const session = this.snapshot(input.session.sessionId);
		if (
			session.active?.runId !== input.run.runId ||
			session.active.payloadDigest !== flowDigest(input) ||
			!session.admission
		)
			throw new Error("SESSION_BINDING_REQUIRED");
	}
	/** Run 已终态时补采纳；回执、完整历史、锚点和清槽同一 Session 本地事务。 */
	finalize(runId: string): void {
		const input = this.#runs.load(runId);
		if (!input || !isTerminalReActState(input.run.position.kind)) return;
		const session = this.snapshot(input.session.sessionId);
		if (session.active?.runId !== runId) return;
		const digest = flowDigest({
			runId,
			bindingVersion: session.active.bindingVersion,
			headRef: input.run.transcriptHeadRef,
			position: input.run.position,
		});
		const shouldFinalize = this.#repository.transaction(() => {
			const current = this.snapshot(input.session.sessionId);
			if (this.#repository.receipt(`finalize:${runId}:${session.active!.bindingVersion}`, digest) !== null)
				return false;
			if (current.active?.runId !== runId || current.active.bindingVersion !== session.active?.bindingVersion)
				throw new Error("SESSION_FINALIZATION_CONFLICT");
			if (current.active.state === "RELEASING") {
				if (current.active.terminalReceiptRef !== digest) throw new Error("SESSION_FINALIZATION_CONFLICT");
				return true;
			}
			this.#repository.save(
				{
					...current,
					revision: current.revision + 1,
					active: {
						...current.active,
						state: "RELEASING",
						stateVersion: current.active.stateVersion + 1,
						terminalReceiptRef: digest,
					},
				},
				current.revision,
			);
			return true;
		});
		if (!shouldFinalize) return;
		const history = this.#completedHistory(input);
		const delta = history.records;
		this.#repository.transaction(() => {
			const current = this.snapshot(session.anchor.sessionId);
			const receiptId = `finalize:${runId}:${session.active!.bindingVersion}`;
			if (this.#repository.receipt(receiptId, digest) !== null) return;
			if (
				current.active?.runId !== runId ||
				current.active.bindingVersion !== session.active?.bindingVersion ||
				current.anchor.headRef !== input.session.historyHeadRef
			)
				throw new Error("SESSION_FINALIZATION_CONFLICT");
			const records = [
				...current.records,
				...delta.map((record) => ({
					...record,
					orderKey: { ...record.orderKey, sequence: current.records.length + record.orderKey.sequence },
				})),
			];
			const anchor = delta.length
				? {
						...current.anchor,
						version: current.anchor.version + 1,
						headRef: flowId("session-history", { previous: current.anchor.headRef, digest }),
					}
				: current.anchor;
			this.#repository.save(
				{
					...current,
					anchor,
					records,
					observations: delta.length
						? [...current.observations, ...history.expectedChildObservations]
						: current.observations,
					active: null,
					admission: null,
					revision: current.revision + 1,
				},
				current.revision,
			);
			this.#repository.record(receiptId, digest, JSON.stringify(anchor));
		});
	}
	/** 宿主启动/扫描时恢复 outbox 与终态采纳；不调用模型、工具或新建 Run 身份。 */
	recover(): void {
		for (const session of this.#repository.pending()) {
			const runId = session.active!.runId;
			if (session.admission) this.#dispatch(session.anchor.sessionId, runId);
			this.finalize(runId);
		}
	}
	#dispatch(sessionId: string, runId: string): void {
		const session = this.snapshot(sessionId);
		if (session.active?.runId !== runId || !session.admission) return;
		// 查询原受理；即使此前返回丢失，也不换身份或重建候选。
		const prior = this.#runs.initial(runId);
		if (prior && flowDigest(prior) !== session.active.payloadDigest) throw new Error("FLOW_ADMISSION_CONFLICT");
		try {
			if (!prior) this.#runs.admit(session.admission.input, session.admission.parent ?? undefined);
		} catch (error) {
			this.#repository.transaction(() => {
				const current = this.snapshot(sessionId);
				if (current.active?.runId !== runId || !current.admission) return;
				if (error instanceof RunAdmissionRejected) {
					this.#repository.save(
						{ ...current, revision: current.revision + 1, active: null, admission: null },
						current.revision,
					);
					this.#repository.record(`reject:${runId}`, current.active.payloadDigest, error.message);
					return;
				}
				this.#repository.save(
					{
						...current,
						revision: current.revision + 1,
						active: { ...current.active, state: "SUBMIT_UNKNOWN", stateVersion: current.active.stateVersion + 1 },
					},
					current.revision,
				);
			});
			throw error;
		}
		this.#repository.transaction(() => {
			const current = this.snapshot(sessionId);
			if (current.active?.runId !== runId || !current.admission) return;
			this.#repository.save(
				{
					...current,
					revision: current.revision + 1,
					admission: null,
					active: {
						...current.active,
						state: "ACTIVE",
						stateVersion: current.active.stateVersion + 1,
						admissionReceiptRef: flowId("admission", { runId }),
					},
				},
				current.revision,
			);
		});
	}
	#authorize(context: RequestContext): void {
		if (context.tenant.tenantId !== this.#scope) throw new Error("SESSION_SCOPE_DENIED");
	}
	#completedHistory(input: AdvanceInput): ReturnType<typeof projectFlowHistory> {
		// 失败/取消只确认终态，不读取或采纳不完整轮次。
		if (input.run.position.kind !== REACT_FLOW_STATE.COMPLETED) return { records: [], expectedChildObservations: [] };
		const runId = input.run.runId;
		const initial = this.#runs.initial(runId);
		if (!initial?.context) throw new Error("FLOW_INITIAL_CONTEXT_MISSING");
		const candidate = decodeCandidate(this.#artifacts.get(initial.context.promptRef), initial.context);
		const history = projectFlowHistory(this.#runs, this.#artifacts, runId);
		return { ...history, records: completedRunHistory(this.#artifacts, runId, candidate.payload.task, history.records) };
	}
}
