import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";

const SCHEMA_VERSION = 1;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS flow_runs (
 scope TEXT NOT NULL, run_id TEXT NOT NULL, admission_digest TEXT NOT NULL,
 input_json TEXT NOT NULL, version INTEGER NOT NULL, cancel_epoch INTEGER NOT NULL,
 owner_id TEXT, fence INTEGER NOT NULL DEFAULT 0, claim_until INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(scope, run_id)
);
CREATE TABLE IF NOT EXISTS flow_events (
 scope TEXT NOT NULL, run_id TEXT NOT NULL, event_id TEXT NOT NULL, sequence INTEGER NOT NULL,
 digest TEXT NOT NULL, event_json TEXT NOT NULL, consumed INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(scope,run_id,event_id), UNIQUE(scope,run_id,sequence),
 FOREIGN KEY(scope,run_id) REFERENCES flow_runs(scope,run_id)
);
CREATE TABLE IF NOT EXISTS flow_commits (
 scope TEXT NOT NULL, run_id TEXT NOT NULL, commit_id TEXT NOT NULL,
 digest TEXT NOT NULL, version INTEGER NOT NULL, input_json TEXT NOT NULL, decision_json TEXT NOT NULL,
 PRIMARY KEY(scope,run_id,commit_id), FOREIGN KEY(scope,run_id) REFERENCES flow_runs(scope,run_id)
);
CREATE TABLE IF NOT EXISTS flow_commands (
 scope TEXT NOT NULL, run_id TEXT NOT NULL, command_id TEXT NOT NULL,
 record_json TEXT NOT NULL, status TEXT NOT NULL,
 PRIMARY KEY(scope,run_id,command_id), FOREIGN KEY(scope,run_id) REFERENCES flow_runs(scope,run_id)
);
CREATE TABLE IF NOT EXISTS flow_transcript (
 scope TEXT NOT NULL, run_id TEXT NOT NULL, event_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
 entry_json TEXT NOT NULL, PRIMARY KEY(scope,run_id,event_id,ordinal),
 FOREIGN KEY(scope,run_id) REFERENCES flow_runs(scope,run_id)
);
CREATE INDEX IF NOT EXISTS flow_pending ON flow_commands(scope,status,run_id);
CREATE TABLE IF NOT EXISTS flow_admissions (
 scope TEXT NOT NULL, run_id TEXT NOT NULL, input_json TEXT NOT NULL,
 PRIMARY KEY(scope,run_id), FOREIGN KEY(scope,run_id) REFERENCES flow_runs(scope,run_id)
);
CREATE TABLE IF NOT EXISTS flow_artifacts (
 scope TEXT NOT NULL, id TEXT NOT NULL, digest TEXT NOT NULL, bytes INTEGER NOT NULL,
 body TEXT NOT NULL, PRIMARY KEY(scope,id)
);
CREATE TABLE IF NOT EXISTS flow_adapter_messages (
 scope TEXT NOT NULL, tenant_id TEXT NOT NULL, ref TEXT NOT NULL, body TEXT NOT NULL,
 PRIMARY KEY(scope,tenant_id,ref)
);
CREATE TABLE IF NOT EXISTS flow_permits (
 scope TEXT NOT NULL, permit_id TEXT NOT NULL, run_id TEXT NOT NULL, proposal_id TEXT NOT NULL,
 action_digest TEXT NOT NULL, cancel_epoch INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 grant_json TEXT NOT NULL, consumed_by TEXT,
 PRIMARY KEY(scope,permit_id), FOREIGN KEY(scope,run_id) REFERENCES flow_runs(scope,run_id)
);
CREATE TABLE IF NOT EXISTS flow_incidents (
 scope TEXT NOT NULL, run_id TEXT NOT NULL, incident_id TEXT NOT NULL, command_id TEXT NOT NULL,
 status TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(scope,incident_id), FOREIGN KEY(scope,run_id) REFERENCES flow_runs(scope,run_id)
);
`;

/** 本地SQLite连接；WAL与FULL同步，所有调用同步完成后才返回受理成功。 */
export class FlowSqliteDatabase {
	readonly #db: DatabaseSync;
	/** 打开独立数据库；未知新版本拒绝，禁止静默降级。 */
	constructor(path: string) {
		this.#db = new DatabaseSync(path);
		this.#db.exec(
			"PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
		);
		const version = this.#db.prepare("PRAGMA user_version").get()?.user_version;
		if (version !== 0 && version !== SCHEMA_VERSION) {
			this.#db.close();
			throw new Error("FLOW_STORAGE_VERSION_UNSUPPORTED");
		}
		this.transaction(() => {
			this.#db.exec(SCHEMA);
			this.#db.exec(`PRAGMA user_version=${SCHEMA_VERSION}`);
		});
	}
	/** 执行带参数的查询，不拼接外部字段。 */
	rows(sql: string, ...values: SQLInputValue[]): Record<string, SQLOutputValue>[] {
		return this.#db.prepare(sql).all(...values);
	}
	/** 执行写入并返回影响行数。 */
	write(sql: string, ...values: SQLInputValue[]): number {
		return Number(this.#db.prepare(sql).run(...values).changes);
	}
	/** 同步写事务；成功提交后返回，异常全部回滚。 */
	transaction<T>(operation: () => T): T {
		this.#db.exec("BEGIN IMMEDIATE");
		try {
			const result = operation();
			this.#db.exec("COMMIT");
			return result;
		} catch (error) {
			this.#db.exec("ROLLBACK");
			throw error;
		}
	}
	/** 关闭连接，不删除持久化文件。 */
	close(): void {
		this.#db.close();
	}
}
