import { randomUUID } from "node:crypto";
import {
	type AgentRunStore,
	RunAdmissionRejected,
	type RunStorageRules,
} from "../../../../contracts/control/run-registry/run-storage.ts";
import type {
	AdvanceInput,
	CommandRecord,
	CommitQuery,
	CommitRequest,
	CommitResult,
	EngineCommand,
	ExecutionClaim,
	RunContextBinding,
	RuntimeEvent,
	TranscriptEntry,
} from "../../../../contracts/flow-engine.ts";
import type { TimePort } from "../../../../contracts/index.ts";
import { isTerminalReActState, REACT_FLOW_STATE } from "../../../../contracts/react-flow-values.ts";
import { AgentRunTransaction } from "./agent-run-transaction.ts";
import { SqliteRunCommands } from "./sqlite-run-commands.ts";
import { SqliteRunCommits } from "./sqlite-run-commits.ts";

/** 真实SQLite Run存储；作用域在装配时固定，Core不持有数据库连接。 */
export class SqliteRunRepository implements AgentRunStore {
	readonly #session: AgentRunTransaction;
	readonly #commands: SqliteRunCommands;
	readonly #commits: SqliteRunCommits;
	readonly #authorizeAdmission: ((input: AdvanceInput) => void) | undefined;
	/** 建立共享连接并装配Run、命令、原子提交三项职责。 */
	constructor(
		path: string,
		scope: string,
		rules: RunStorageRules,
		time: TimePort,
		authorizeAdmission?: (input: AdvanceInput) => void,
	) {
		this.#authorizeAdmission = authorizeAdmission;
		this.#session = new AgentRunTransaction(path, scope, rules, time);
		this.#commands = new SqliteRunCommands(this.#session);
		this.#commits = new SqliteRunCommits(this.#session);
	}
	/** 初始输入与首事件在同一事务受理；相同Run身份不覆盖。 */
	admit(input: AdvanceInput, parent?: AdvanceInput): void {
		if (
			!this.#session.rules.isInput(input) ||
			input.run.position.kind !== REACT_FLOW_STATE.READY ||
			input.run.consumedSequence !== 0 ||
			input.event.sequence !== 1 ||
			this.#session.rules.advance(input).kind !== "advance"
		)
			throw new RunAdmissionRejected("FLOW_ADMISSION_INVALID");
		const digest = this.#session.rules.digest(input);
		this.#session.db.transaction(() => {
			if (parent) this.#validateChildAdmission(input, parent);
			const existing = this.#session.row(input.run.runId);
			if (existing) {
				if (existing.admission_digest !== digest) throw new RunAdmissionRejected("FLOW_ADMISSION_CONFLICT");
				return;
			}
			this.#authorizeAdmission?.(input);
			this.#session.db.write(
				"INSERT INTO flow_runs(scope,run_id,admission_digest,input_json,version,cancel_epoch) VALUES(?,?,?,?,?,?)",
				this.#session.scope,
				input.run.runId,
				digest,
				JSON.stringify(input),
				input.run.version,
				input.run.cancelEpoch,
			);
			this.#insertEvent(input.event);
			this.#session.db.write(
				"INSERT INTO flow_admissions VALUES(?,?,?)",
				this.#session.scope,
				input.run.runId,
				JSON.stringify(input),
			);
		});
	}
	/** 读取并验证独立快照；损坏数据失败关闭。 */
	load(runId: string): AdvanceInput | null {
		return this.#session.load(runId);
	}
	/** 返回有界Run清单，调用者决定调度顺序。 */
	initial(runId: string): AdvanceInput | null {
		const row = this.#session.db.rows(
			"SELECT input_json FROM flow_admissions WHERE scope=? AND run_id=?",
			this.#session.scope,
			runId,
		)[0];
		if (!row) return null;
		const input: unknown = JSON.parse(String(row.input_json));
		if (!this.#session.rules.isInput(input)) throw new Error("FLOW_STORAGE_CORRUPT");
		return input;
	}
	/** 只恢复命令原采纳候选；提交与命令必须一致，不允许重算替代。 */
	adoptedContext(command: EngineCommand): RunContextBinding {
		if (command.payload.kind !== "InvokeModel") throw new Error("FLOW_CONTEXT_COMMAND_INVALID");
		const row = this.#session.db.rows(
			"SELECT input_json FROM flow_commits WHERE scope=? AND run_id=? AND json_extract(input_json,'$.event.eventId')=?",
			this.#session.scope,
			command.runId,
			command.causationId,
		)[0];
		if (!row) throw new Error("FLOW_CONTEXT_ADOPTION_MISSING");
		const input: unknown = JSON.parse(String(row.input_json));
		if (
			!this.#session.rules.isInput(input) ||
			!input.context ||
			this.#session.rules.digest(input.context.promptRef) !== this.#session.rules.digest(command.payload.promptRef)
		)
			throw new Error("FLOW_CONTEXT_ADOPTION_INVALID");
		return input.context;
	}
	/** 已提交转录按事件消费顺序读取；不包含尚未提交的候选。 */
	transcript(runId: string): readonly TranscriptEntry[] {
		return this.#session.db
			.rows(
				"SELECT t.entry_json FROM flow_transcript t JOIN flow_events e ON t.scope=e.scope AND t.run_id=e.run_id AND t.event_id=e.event_id WHERE t.scope=? AND t.run_id=? ORDER BY e.sequence,t.ordinal",
				this.#session.scope,
				runId,
			)
			.map((row) => JSON.parse(String(row.entry_json)) as TranscriptEntry);
	}
	/** 返回有界Run清单，调用者决定调度顺序。 */
	listRunIds(limit: number): readonly string[] {
		if (!Number.isInteger(limit) || limit < 1 || limit > 4096) throw new Error("FLOW_SCAN_LIMIT");
		return this.#session.db
			.rows("SELECT run_id FROM flow_runs WHERE scope=? ORDER BY run_id LIMIT ?", this.#session.scope, limit)
			.map((r) => String(r.run_id));
	}
	/** 初次领取或续期；租约过期后创建新Attempt与fence，旧派发命令保持原状态供对账。 */
	acquire(runId: string, ownerId: string, ttlMs: number): ExecutionClaim | null {
		if (!ownerId || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 30000) throw new Error("FLOW_CLAIM_INVALID");
		return this.#session.db.transaction(() => {
			const row = this.#session.row(runId);
			let input = this.load(runId);
			if (!row || !input) return null;
			const now = this.#session.time.now().epochMilliseconds;
			if (row.owner_id !== null && row.owner_id !== ownerId && Number(row.claim_until) > now) return null;
			if (row.owner_id !== null && Number(row.claim_until) <= now) {
				input = {
					...input,
					run: { ...input.run, attemptId: randomUUID(), version: input.run.version + 1 },
					context: null,
				};
				if (input.priorReceipt === null) {
					const payload =
						input.event.payload.kind === "AdvanceRequested"
							? { kind: "AdvanceRequested" as const, basisVersion: input.run.version }
							: input.event.payload;
					input = this.#replaceEvent(input, payload, input.event.source);
				}
				this.#session.save(input);
			}
			const fence = Number(row.fence) + (Number(row.claim_until) <= now ? 1 : 0);
			this.#session.db.write(
				"UPDATE flow_runs SET owner_id=?,fence=?,claim_until=? WHERE scope=? AND run_id=?",
				ownerId,
				fence,
				now + ttlMs,
				this.#session.scope,
				runId,
			);
			return { ownerId, attemptId: input.run.attemptId, fence, expiresAtMs: now + ttlMs };
		});
	}
	/** 在同一事务内验证并提交快照、事件、命令与转录。 */
	async commit(request: CommitRequest): Promise<CommitResult> {
		return this.#commits.commit(request);
	}
	/** 查询耐久提交回执；absent不表示旧派发已停止。 */
	async queryCommit(runId: string, commitId: string): Promise<CommitQuery> {
		return this.#commits.query(runId, commitId);
	}
	/** 查询完整耐久命令记录。 */
	async queryCommand(runId: string, commandId: string): Promise<CommandRecord | null> {
		return this.commands(runId).find((r) => r.command.commandId === commandId) ?? null;
	}
	/** 当前已消费事件之后接收新的可信事件；重复内容幂等。 */
	acceptEvent(runId: string, event: RuntimeEvent, claim: ExecutionClaim): void {
		this.#session.db.transaction(() => {
			if (!this.#session.validClaim(runId, claim)) throw new Error("FLOW_CLAIM_INVALID");
			const current = this.load(runId);
			if (!current || event.runId !== runId || event.attemptId !== current.run.attemptId)
				throw new Error("FLOW_EVENT_CONFLICT");
			const prior = this.#session.db.rows(
				"SELECT event_json FROM flow_events WHERE scope=? AND run_id=? AND event_id=?",
				this.#session.scope,
				runId,
				event.eventId,
			)[0];
			if (prior) {
				if (this.#session.rules.digest(JSON.parse(String(prior.event_json))) !== this.#session.rules.digest(event))
					throw new Error("FLOW_EVENT_CONFLICT");
				return;
			}
			if (
				event.sequence !== current.run.consumedSequence + 1 ||
				(current.priorReceipt === null && current.event.sequence > current.run.consumedSequence)
			)
				throw new Error("FLOW_SEQUENCE_GAP");
			const next = { ...current, event, priorReceipt: null };
			if (
				!this.#session.rules.isInput(next) ||
				this.#session.rules.digest({
					source: event.source,
					causationId: event.causationId,
					payload: event.payload,
				}) !== event.payloadDigest
			)
				throw new Error("FLOW_EVENT_CONFLICT");
			this.#insertEvent(event);
			this.#session.save(next);
		});
	}
	/** 取消只建立版本化栅栏，后续终态仍由Core计算。 */
	cancel(runId: string): void {
		this.#session.db.transaction(() => {
			const input = this.load(runId);
			if (!input) throw new Error("FLOW_RUN_NOT_FOUND");
			if (input.run.cancellationRequested || isTerminalReActState(input.run.position.kind)) return;
			let next: AdvanceInput = {
				...input,
				run: {
					...input.run,
					cancellationRequested: true,
					cancelEpoch: input.run.cancelEpoch + 1,
					version: input.run.version + 1,
				},
			};
			next = this.#replaceEvent(next, { kind: "CancelRequested" }, "scheduler");
			this.#session.save(next);
		});
	}
	/** 按耐久插入顺序列出命令。 */
	commands(runId: string): readonly CommandRecord[] {
		return this.#commands.commands(runId);
	}
	/** 原子领取未派发命令，受取消及租约栅栏约束。 */
	claimCommand(runId: string, commandId: string, claim: ExecutionClaim): EngineCommand | null {
		return this.#commands.claimCommand(runId, commandId, claim);
	}
	/** 追加单向执行事实，不重开已完成命令。 */
	recordCommand(runId: string, record: CommandRecord, claim: ExecutionClaim): void {
		this.#commands.recordCommand(runId, record, claim);
	}
	/** 关闭连接，数据保留供重启查询。 */
	close(): void {
		this.#session.db.close();
	}
	#validateChildAdmission(child: AdvanceInput, parent: AdvanceInput): void {
		const current = this.load(parent.run.runId);
		const row = this.#session.row(parent.run.runId);
		if (
			!current ||
			!row ||
			current.run.cancellationRequested ||
			current.run.position.kind !== REACT_FLOW_STATE.AWAITING_CHILD ||
			current.run.position.childId !== child.run.runId ||
			this.#session.rules.digest(current.run) !== this.#session.rules.digest(parent.run) ||
			Number(row.claim_until) <= this.#session.time.now().epochMilliseconds
		)
			throw new RunAdmissionRejected("FLOW_CHILD_ADMISSION_DENIED");
		const position = current.run.position;
		const creation = this.commands(parent.run.runId).find(
			(record) => record.command.commandId === position.commandId,
		);
		if (!creation || creation.command.payload.kind !== "CreateChildRun")
			throw new RunAdmissionRejected("FLOW_CHILD_ADMISSION_DENIED");
		const spec = creation.command.payload.spec;
		if (
			child.run.depth !== parent.run.depth + 1 ||
			child.run.deadlineAtMs !== spec.deadlineAtMs ||
			child.run.bindings.executionEnvelopeRef !== spec.envelopeSubsetRef ||
			this.#session.rules.digest(child.run.budget) !== this.#session.rules.digest(spec.budget)
		)
			throw new RunAdmissionRejected("FLOW_CHILD_ADMISSION_DENIED");
	}
	#replaceEvent(input: AdvanceInput, payload: RuntimeEvent["payload"], source: RuntimeEvent["source"]): AdvanceInput {
		let consumedSequence = input.run.consumedSequence;
		if (input.priorReceipt === null) {
			this.#session.db.write(
				"UPDATE flow_events SET consumed=2 WHERE scope=? AND run_id=? AND event_id=? AND consumed=0",
				this.#session.scope,
				input.run.runId,
				input.event.eventId,
			);
			consumedSequence = input.event.sequence;
		}
		const causationId = input.event.causationId;
		const eventId =
			payload.kind === "AdvanceRequested"
				? `wake:${this.#session.rules.digest({ runId: input.run.runId, version: input.run.version, kind: "advance" }).slice(7)}`
				: randomUUID();
		const event: RuntimeEvent = {
			eventId,
			runId: input.run.runId,
			attemptId: input.run.attemptId,
			sequence: consumedSequence + 1,
			source,
			causationId,
			payload,
			payloadDigest: this.#session.rules.digest({ source, causationId, payload }),
		};
		this.#insertEvent(event);
		return { ...input, run: { ...input.run, consumedSequence }, event, priorReceipt: null, context: null };
	}
	#insertEvent(event: RuntimeEvent): void {
		this.#session.db.write(
			"INSERT INTO flow_events VALUES(?,?,?,?,?,?,0)",
			this.#session.scope,
			event.runId,
			event.eventId,
			event.sequence,
			event.payloadDigest,
			JSON.stringify(event),
		);
	}
}
