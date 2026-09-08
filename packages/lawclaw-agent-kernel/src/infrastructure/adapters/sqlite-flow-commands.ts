import type { CommandRecord, EngineCommand, ExecutionClaim } from "../../contracts/flow-engine.ts";
import { FLOW_COMMAND_STATUS, FLOW_EFFECT, isTerminalReActState } from "../../contracts/react-flow-values.ts";
import type { FlowSqliteSession } from "./flow-sqlite-session.ts";

/** 管理命令领取与执行事实的单向生命周期，不计算Run业务位置。 */
export class SqliteFlowCommands {
	readonly #session: FlowSqliteSession;
	/** 复用Run存储的事务连接和资格校验。 */
	constructor(session: FlowSqliteSession) {
		this.#session = session;
	}
	/** 返回按插入顺序排列的命令快照。 */
	commands(runId: string): readonly CommandRecord[] {
		return this.#session.db
			.rows(
				"SELECT record_json FROM flow_commands WHERE scope=? AND run_id=? ORDER BY rowid",
				this.#session.scope,
				runId,
			)
			.map((row) => JSON.parse(String(row.record_json)) as CommandRecord);
	}
	/** 在版本化执行资格下领取PENDING；取消或到期禁止业务命令领取。 */
	claimCommand(runId: string, commandId: string, claim: ExecutionClaim): EngineCommand | null {
		return this.#session.db.transaction(() => {
			const input = this.#session.load(runId);
			if (!input || !this.#session.validClaim(runId, claim)) return null;
			const record = this.commands(runId).find((r) => r.command.commandId === commandId);
			if (!record || record.status !== FLOW_COMMAND_STATUS.PENDING) return null;
			if (
				record.command.deadlineAtMs <= this.#session.time.now().epochMilliseconds &&
				!["CancelOutstanding", "RequestReconciliation"].includes(record.command.payload.kind)
			)
				return null;
			if (
				input.run.cancellationRequested &&
				record.command.payload.kind !== "CancelOutstanding" &&
				record.command.payload.kind !== "RequestReconciliation"
			)
				return null;
			this.#writeCommand({ ...record, status: FLOW_COMMAND_STATUS.CLAIMED, dispatchClaim: claim });
			return record.command;
		});
	}
	/** 保存执行事实；状态不可回到PENDING，失败与未知不自动重试。 */
	recordCommand(runId: string, record: CommandRecord, claim: ExecutionClaim): void {
		this.#session.db.transaction(() => {
			if (!this.#session.validClaim(runId, claim) || record.command.runId !== runId)
				throw new Error("FLOW_CLAIM_INVALID");
			const prior = this.commands(runId).find((r) => r.command.commandId === record.command.commandId);
			if (!prior) throw new Error("FLOW_COMMAND_CONFLICT");
			const proof = this.#recoveryProof(prior, record, claim);
			if (
				this.#session.rules.digest(prior.command) !== this.#session.rules.digest(record.command) ||
				this.#session.rules.digest(prior.dispatchClaim) !== this.#session.rules.digest(record.dispatchClaim) ||
				prior.payloadDigest !== record.payloadDigest ||
				!proof.authorized
			)
				throw new Error("FLOW_COMMAND_CONFLICT");
			const allowed: Record<CommandRecord["status"], readonly CommandRecord["status"][]> = {
				[FLOW_COMMAND_STATUS.PENDING]: [],
				[FLOW_COMMAND_STATUS.CLAIMED]: [
					FLOW_COMMAND_STATUS.ACCEPTED,
					FLOW_COMMAND_STATUS.UNKNOWN,
					FLOW_COMMAND_STATUS.FAILED,
					...(proof.canFinishClaimed ? [FLOW_COMMAND_STATUS.SUCCEEDED] : []),
				],
				[FLOW_COMMAND_STATUS.ACCEPTED]: [
					FLOW_COMMAND_STATUS.SUCCEEDED,
					FLOW_COMMAND_STATUS.FAILED,
					FLOW_COMMAND_STATUS.UNKNOWN,
				],
				[FLOW_COMMAND_STATUS.SUCCEEDED]: [],
				[FLOW_COMMAND_STATUS.FAILED]: [],
				[FLOW_COMMAND_STATUS.UNKNOWN]: [],
				[FLOW_COMMAND_STATUS.CANCELLED]: [],
			};
			if (this.#session.rules.digest(prior) === this.#session.rules.digest(record)) return;
			if (!allowed[prior.status].includes(record.status)) throw new Error("FLOW_COMMAND_STATE_INVALID");
			this.#writeCommand(record);
		});
	}
	#recoveryProof(prior: CommandRecord, record: CommandRecord, claim: ExecutionClaim) {
		const sameDispatcher =
			prior.dispatchClaim?.fence === claim.fence && prior.dispatchClaim.ownerId === claim.ownerId;
		const abandoned =
			prior.dispatchClaim !== null &&
			prior.dispatchClaim.fence < claim.fence &&
			record.status === FLOW_COMMAND_STATUS.UNKNOWN &&
			record.effect === FLOW_EFFECT.UNKNOWN;
		const recoveredChild =
			record.command.payload.kind === "CreateChildRun" &&
			record.providerReceiptRef === record.command.payload.childId &&
			record.status === FLOW_COMMAND_STATUS.SUCCEEDED &&
			isTerminalReActState(this.#session.load(record.command.payload.childId)?.run.position.kind ?? "");
		const recoveredMaintenance =
			["CancelOutstanding", "RequestReconciliation"].includes(record.command.payload.kind) &&
			prior.dispatchClaim !== null &&
			prior.dispatchClaim.fence < claim.fence &&
			record.status === FLOW_COMMAND_STATUS.SUCCEEDED &&
			record.effect === FLOW_EFFECT.NONE;
		return {
			authorized: sameDispatcher || abandoned || recoveredChild || recoveredMaintenance,
			canFinishClaimed: recoveredChild || recoveredMaintenance,
		};
	}
	#writeCommand(record: CommandRecord): void {
		this.#session.db.write(
			"UPDATE flow_commands SET record_json=?,status=? WHERE scope=? AND run_id=? AND command_id=?",
			JSON.stringify(record),
			record.status,
			this.#session.scope,
			record.command.runId,
			record.command.commandId,
		);
	}
}
