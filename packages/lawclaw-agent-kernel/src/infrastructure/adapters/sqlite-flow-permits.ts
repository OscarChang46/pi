import { randomUUID } from "node:crypto";
import type { ActionProposal, AdvanceInput, EngineCommand } from "../../contracts/flow-engine.ts";
import type { FlowPermitStore } from "../../contracts/flow-permits.ts";
import type { TimePort } from "../../contracts/index.ts";
import type { PermissionGrant } from "../../contracts/permissions.ts";
import { REACT_FLOW_STATE } from "../../contracts/react-flow-values.ts";
import type { AgentRunDatabase } from "../state-storage/adapters/run-registry/agent-run-database.ts";

/** 与Run取消栅栏共享SQLite事务的Permit消费端。 */
export class SqliteFlowPermits implements FlowPermitStore {
	readonly #db: AgentRunDatabase;
	readonly #scope: string;
	readonly #time: TimePort;
	/** 绑定受信任作用域；调用方必须为已装配PDP与PEP。 */
	constructor(db: AgentRunDatabase, scope: string, time: TimePort) {
		this.#db = db;
		this.#scope = scope;
		this.#time = time;
	}
	/** 将已判定Grant保存为不可重放的Permit；不代替授权判定。 */
	issue(input: AdvanceInput, proposal: ActionProposal, grant: PermissionGrant): string {
		const expires = this.#time.parseIsoUtc(grant.expiresAt)?.epochMilliseconds;
		if (!expires || expires <= this.#time.now().epochMilliseconds || grant.runId !== input.run.runId)
			throw new Error("FLOW_PERMIT_INVALID");
		const id = randomUUID();
		this.#db.write(
			"INSERT INTO flow_permits VALUES(?,?,?,?,?,?,?,?,NULL)",
			this.#scope,
			id,
			input.run.runId,
			proposal.proposalId,
			proposal.actionDigest,
			input.run.cancelEpoch,
			expires,
			JSON.stringify(grant),
		);
		return id;
	}
	/** 单事务核对当前Run、执行资格与动作后消费；取消先提交则Provider不能开始。 */
	consume(input: AdvanceInput, command: EngineCommand, permitRef: string): PermissionGrant {
		return this.#db.transaction(() => {
			const row = this.#db.rows(
				"SELECT * FROM flow_permits WHERE scope=? AND permit_id=?",
				this.#scope,
				permitRef,
			)[0];
			const run = this.#db.rows(
				"SELECT input_json,claim_until FROM flow_runs WHERE scope=? AND run_id=?",
				this.#scope,
				input.run.runId,
			)[0];
			if (!row || !run || command.payload.kind !== "DispatchTool") throw new Error("FLOW_PERMIT_INVALID");
			const current = JSON.parse(String(run.input_json)) as AdvanceInput;
			if (
				row.run_id !== input.run.runId ||
				row.consumed_by !== null ||
				row.action_digest !== command.payload.proposal.actionDigest ||
				row.proposal_id !== command.payload.proposal.proposalId ||
				row.cancel_epoch !== current.run.cancelEpoch ||
				current.run.cancellationRequested ||
				current.run.attemptId !== input.run.attemptId ||
				current.run.position.kind !== REACT_FLOW_STATE.AWAITING_TOOL ||
				current.run.position.commandId !== command.commandId ||
				Number(row.expires_at) <= this.#time.now().epochMilliseconds ||
				Number(run.claim_until) <= this.#time.now().epochMilliseconds
			)
				throw new Error("FLOW_PERMIT_INVALID");
			this.#db.write(
				"UPDATE flow_permits SET consumed_by=? WHERE scope=? AND permit_id=?",
				command.commandId,
				this.#scope,
				permitRef,
			);
			return JSON.parse(String(row.grant_json)) as PermissionGrant;
		});
	}
}
