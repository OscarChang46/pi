import type { AdvanceInput, CommandRecord } from "../../contracts/flow-engine.ts";
import type { TimePort } from "../../contracts/index.ts";
import {
	FLOW_COMMAND_STATUS,
	FLOW_EFFECT,
	FLOW_INCIDENT_STATUS,
	REACT_FLOW_STATE,
} from "../../contracts/react-flow-values.ts";
import type { FlowSqliteDatabase } from "./flow-sqlite-database.ts";

/** 耐久清理与未知结果工单；不替代Provider对账或人工审批。 */
export class SqliteFlowMaintenance {
	readonly #db: FlowSqliteDatabase;
	readonly #scope: string;
	readonly #time: TimePort;
	/** 固定数据库、作用域及时钟。 */
	constructor(db: FlowSqliteDatabase, scope: string, time: TimePort) {
		this.#db = db;
		this.#scope = scope;
		this.#time = time;
	}
	/** 终态后封闭未派发命令；已派发但无结果的命令保留为UNKNOWN。 */
	cancelOutstanding(runId: string): void {
		this.#db.transaction(() => {
			const row = this.#db.rows(
				"SELECT input_json FROM flow_runs WHERE scope=? AND run_id=?",
				this.#scope,
				runId,
			)[0];
			const input = row ? (JSON.parse(String(row.input_json)) as AdvanceInput) : null;
			if (!input || input.run.position.kind !== REACT_FLOW_STATE.CANCELLED)
				throw new Error("FLOW_CLEANUP_STATE_INVALID");
			for (const item of this.#db.rows(
				"SELECT record_json FROM flow_commands WHERE scope=? AND run_id=? AND status IN (?,?,?)",
				this.#scope,
				runId,
				FLOW_COMMAND_STATUS.PENDING,
				FLOW_COMMAND_STATUS.CLAIMED,
				FLOW_COMMAND_STATUS.ACCEPTED,
			)) {
				const record = JSON.parse(String(item.record_json)) as CommandRecord;
				if (["CancelOutstanding", "RequestReconciliation"].includes(record.command.payload.kind)) continue;
				const next: CommandRecord = {
					...record,
					status:
						record.status === FLOW_COMMAND_STATUS.PENDING
							? FLOW_COMMAND_STATUS.CANCELLED
							: FLOW_COMMAND_STATUS.UNKNOWN,
					effect: record.status === FLOW_COMMAND_STATUS.PENDING ? FLOW_EFFECT.NONE : FLOW_EFFECT.UNKNOWN,
				};
				this.#db.write(
					"UPDATE flow_commands SET record_json=?,status=? WHERE scope=? AND run_id=? AND command_id=?",
					JSON.stringify(next),
					next.status,
					this.#scope,
					runId,
					record.command.commandId,
				);
			}
			this.#db.write(
				"UPDATE flow_incidents SET status=? WHERE scope=? AND run_id=? AND status=?",
				FLOW_INCIDENT_STATUS.CLOSED_CANCELLED,
				this.#scope,
				runId,
				FLOW_INCIDENT_STATUS.OPEN,
			);
		});
	}
	/** 接受幂等对账请求，保留OPEN工单直到得到外部权威事实。 */
	requestReconciliation(runId: string, commandId: string, incidentId: string): void {
		this.#db.write(
			"INSERT OR IGNORE INTO flow_incidents VALUES(?,?,?,?,?,?)",
			this.#scope,
			runId,
			incidentId,
			commandId,
			FLOW_INCIDENT_STATUS.OPEN,
			this.#time.now().epochMilliseconds,
		);
	}
	/** 返回可展示的诊断字段，不含模型正文或密钥。 */
	incidents(runId: string) {
		return this.#db.rows(
			"SELECT incident_id,command_id,status,created_at FROM flow_incidents WHERE scope=? AND run_id=?",
			this.#scope,
			runId,
		);
	}
	/** 仅返回账本身份和消费状态，避免将模型或工具内容泄露到诊断。 */
	history(runId: string) {
		return {
			events: this.#db.rows(
				"SELECT event_id,sequence,consumed FROM flow_events WHERE scope=? AND run_id=? ORDER BY sequence",
				this.#scope,
				runId,
			),
			commits: this.#db.rows(
				"SELECT commit_id,version FROM flow_commits WHERE scope=? AND run_id=? ORDER BY version",
				this.#scope,
				runId,
			),
			permits: this.#db.rows(
				"SELECT permit_id,proposal_id,expires_at,consumed_by FROM flow_permits WHERE scope=? AND run_id=?",
				this.#scope,
				runId,
			),
		};
	}
	/** SQLite页容量与未处理事件计数；不遍历或返回敏感正文。 */
	storageStats() {
		const pages = Number(this.#db.rows("PRAGMA page_count")[0].page_count);
		const pageSize = Number(this.#db.rows("PRAGMA page_size")[0].page_size);
		return {
			schemaVersion: this.#db.rows("PRAGMA user_version")[0].user_version,
			databaseBytes: pages * pageSize,
			openIncidents: Number(
				this.#db.rows(
					"SELECT count(*) AS count FROM flow_incidents WHERE scope=? AND status=?",
					this.#scope,
					FLOW_INCIDENT_STATUS.OPEN,
				)[0].count,
			),
		};
	}
}
