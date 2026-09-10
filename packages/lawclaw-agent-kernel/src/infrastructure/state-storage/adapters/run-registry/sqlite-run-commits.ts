import type {
	AdvanceInput,
	CommandRecord,
	CommitQuery,
	CommitRequest,
	CommitResult,
} from "../../../../contracts/flow-engine.ts";
import { FLOW_COMMAND_STATUS, FLOW_EFFECT } from "../../../../contracts/react-flow-values.ts";
import type { AgentRunTransaction } from "./agent-run-transaction.ts";

/** 负责Core决定的完整原子提交；校验、快照、命令、转录共用一个写事务。 */
export class SqliteRunCommits {
	readonly #session: AgentRunTransaction;
	/** 注入Run目录使用的同一连接与协议校验器。 */
	constructor(session: AgentRunTransaction) {
		this.#session = session;
	}
	/** 先查幂等回执，再校验快照与决定；任何写入失败回滚全部表。 */
	commit(request: CommitRequest): CommitResult {
		return this.#session.db.transaction(() => {
			const prior = this.#prior(request);
			if (prior) return prior;
			const current = this.#session.load(request.decision.runId);
			const conflict = this.#validateSnapshot(request, current);
			if (conflict) return conflict;
			if (!current) throw new Error("FLOW_RUN_NOT_FOUND");
			const invalid = this.#validateDecision(request);
			if (invalid) return invalid;
			const next = this.#nextInput(current, request);
			this.#session.save(next);
			this.#writeReceipt(request, next.run.version);
			this.#writeOutputs(request);
			return { kind: "committed", commitId: request.decision.decisionId, runVersion: next.run.version };
		});
	}
	/** 查询耐久回执，不推断其他进程旧请求是否仍在执行。 */
	query(runId: string, commitId: string): CommitQuery {
		const row = this.#session.db.rows(
			"SELECT version FROM flow_commits WHERE scope=? AND run_id=? AND commit_id=?",
			this.#session.scope,
			runId,
			commitId,
		)[0];
		return row ? { kind: "committed", commitId, runVersion: Number(row.version) } : { kind: "absent" };
	}
	#prior(request: CommitRequest): CommitResult | null {
		const { decision } = request;
		const { db, scope, rules } = this.#session;
		const prior = db.rows(
			"SELECT digest,version,decision_json FROM flow_commits WHERE scope=? AND run_id=? AND commit_id=?",
			scope,
			decision.runId,
			decision.decisionId,
		)[0];
		if (!prior) return null;
		if (
			prior.digest !== decision.decisionDigest ||
			rules.digest(JSON.parse(String(prior.decision_json))) !== rules.digest(decision)
		)
			return { kind: "rejected", code: "IDEMPOTENCY_CONFLICT" };
		return { kind: "committed", commitId: decision.decisionId, runVersion: Number(prior.version) };
	}
	#validateSnapshot(request: CommitRequest, current: AdvanceInput | null): CommitResult | null {
		const { input, decision, claim } = request;
		const { rules } = this.#session;
		if (!current || !this.#session.validClaim(decision.runId, claim))
			return { kind: "conflict", actualVersion: current?.run.version ?? 0, reason: "claim" };
		if (current.run.version !== decision.expectedVersion)
			return { kind: "conflict", actualVersion: current.run.version, reason: "version" };
		if (current.run.cancelEpoch !== decision.expectedCancelEpoch)
			return { kind: "conflict", actualVersion: current.run.version, reason: "cancel" };
		if (
			rules.digest(input.run) !== rules.digest(current.run) ||
			rules.digest(input.session) !== rules.digest(current.session) ||
			rules.digest(input.event) !== rules.digest(current.event)
		)
			return { kind: "rejected", code: "EVENT_MISMATCH" };
		return null;
	}
	#validateDecision(request: CommitRequest): CommitResult | null {
		const { input, decision } = request;
		const { db, scope, rules } = this.#session;
		const recomputed = rules.advance(input);
		if (recomputed.kind !== "advance" || rules.digest(recomputed.decision) !== rules.digest(decision))
			return { kind: "rejected", code: "INVALID_DECISION" };
		const event = db.rows(
			"SELECT consumed,digest FROM flow_events WHERE scope=? AND run_id=? AND event_id=?",
			scope,
			decision.runId,
			input.event.eventId,
		)[0];
		if (!event || event.consumed !== 0 || event.digest !== input.event.payloadDigest)
			return { kind: "rejected", code: "EVENT_MISMATCH" };
		return null;
	}
	#nextInput(current: AdvanceInput, request: CommitRequest): AdvanceInput {
		const { input, decision } = request;
		const transcriptHeadRef = decision.next.transcriptAppend.length
			? `tr:${this.#session.rules.digest({ previousHead: current.run.transcriptHeadRef, entries: decision.next.transcriptAppend }).slice(7)}`
			: current.run.transcriptHeadRef;
		return {
			...current,
			context: null,
			contextFailure: null,
			run: {
				...current.run,
				position: decision.next.position,
				usage: decision.next.usage,
				pendingActions: decision.next.pendingActions,
				consumedSequence: decision.consumedSequence,
				version: current.run.version + 1,
				transcriptHeadRef,
			},
			priorReceipt: {
				eventId: input.event.eventId,
				sequence: input.event.sequence,
				payloadDigest: input.event.payloadDigest,
				commitId: decision.decisionId,
			},
		};
	}
	#writeReceipt(request: CommitRequest, version: number): void {
		const { input, decision } = request;
		const { db, scope } = this.#session;
		db.write(
			"UPDATE flow_events SET consumed=1 WHERE scope=? AND run_id=? AND event_id=?",
			scope,
			decision.runId,
			input.event.eventId,
		);
		db.write(
			"INSERT INTO flow_commits VALUES(?,?,?,?,?,?,?)",
			scope,
			decision.runId,
			decision.decisionId,
			decision.decisionDigest,
			version,
			JSON.stringify(input),
			JSON.stringify(decision),
		);
	}
	#writeOutputs(request: CommitRequest): void {
		const { input, decision } = request;
		const { db, scope, rules } = this.#session;
		for (const command of decision.commands) {
			const record: CommandRecord = {
				command,
				payloadDigest: rules.digest(command.payload),
				status: FLOW_COMMAND_STATUS.PENDING,
				dispatchClaim: null,
				providerReceiptRef: null,
				resultRef: null,
				effect: FLOW_EFFECT.NONE,
			};
			db.write(
				"INSERT INTO flow_commands VALUES(?,?,?,?,?)",
				scope,
				decision.runId,
				command.commandId,
				JSON.stringify(record),
				record.status,
			);
		}
		decision.next.transcriptAppend.forEach((entry, ordinal) => {
			db.write(
				"INSERT INTO flow_transcript VALUES(?,?,?,?,?)",
				scope,
				decision.runId,
				input.event.eventId,
				ordinal,
				JSON.stringify(entry),
			);
		});
	}
}
