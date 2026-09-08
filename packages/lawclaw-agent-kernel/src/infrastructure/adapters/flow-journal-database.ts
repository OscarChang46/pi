import { DatabaseSync } from "node:sqlite";
import type { FlowJournalEvent } from "../../contracts/flow-system.ts";
import { FLOW_JOURNAL_EVENT } from "../../contracts/flow-system-values.ts";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS system_flow_events (
 scope TEXT NOT NULL, run_id TEXT NOT NULL,
 log_sequence INTEGER NOT NULL CHECK(log_sequence > 0 AND log_sequence <= 9007199254740991),
 kind TEXT NOT NULL CHECK(kind IN ('${FLOW_JOURNAL_EVENT.RUN_ADMITTED}','${FLOW_JOURNAL_EVENT.STATE_CHANGED}','${FLOW_JOURNAL_EVENT.ACTIVITY_STARTED}','${FLOW_JOURNAL_EVENT.ACTIVITY_COMPLETED}','${FLOW_JOURNAL_EVENT.CHECKPOINT}')),
 activity_sequence INTEGER CHECK(activity_sequence > 0 AND activity_sequence <= 9007199254740991),
 activity_key TEXT, payload TEXT NOT NULL CHECK(json_valid(payload)),
 PRIMARY KEY(scope,run_id,log_sequence),
 UNIQUE(scope,run_id,activity_sequence,kind), UNIQUE(scope,run_id,activity_key,kind),
 CHECK((kind IN ('${FLOW_JOURNAL_EVENT.ACTIVITY_STARTED}','${FLOW_JOURNAL_EVENT.ACTIVITY_COMPLETED}')) = (activity_sequence IS NOT NULL)),
 CHECK((kind IN ('${FLOW_JOURNAL_EVENT.ACTIVITY_STARTED}','${FLOW_JOURNAL_EVENT.ACTIVITY_COMPLETED}','${FLOW_JOURNAL_EVENT.CHECKPOINT}')) = (activity_key IS NOT NULL))
);
CREATE TRIGGER IF NOT EXISTS system_flow_no_update BEFORE UPDATE ON system_flow_events
 BEGIN SELECT RAISE(ABORT,'FLOW_LOG_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS system_flow_no_delete BEFORE DELETE ON system_flow_events
 BEGIN SELECT RAISE(ABORT,'FLOW_LOG_APPEND_ONLY'); END;
CREATE TRIGGER IF NOT EXISTS system_flow_no_replace BEFORE INSERT ON system_flow_events
 WHEN EXISTS (SELECT 1 FROM system_flow_events WHERE scope=NEW.scope AND run_id=NEW.run_id
 AND (log_sequence=NEW.log_sequence OR (kind=NEW.kind
 AND (activity_sequence=NEW.activity_sequence OR activity_key=NEW.activity_key))))
 BEGIN SELECT RAISE(ABORT,'FLOW_LOG_APPEND_ONLY'); END;
`;

/** FlowRun日志连接；v1物理列run_id只表示flowRunId，不能用于查询AgentRun。 */
export class FlowJournalDatabase {
	/** 仅供同适配器协作者查询，禁止向业务层暴露连接。 */
	readonly connection: DatabaseSync;
	/** 服务端固定的租户作用域。 */
	readonly scope: string;
	/** 打开独立协议数据库；未知版本拒绝。 */
	constructor(path: string, scope: string) {
		if (!scope || scope.length > 128) throw new Error("FLOW_SCOPE_INVALID");
		this.scope = scope;
		this.connection = new DatabaseSync(path);
		try {
			this.connection.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
			const version = this.connection.prepare("PRAGMA user_version").get()?.user_version;
			if (version !== 0 && version !== 1) throw new Error("FLOW_JOURNAL_VERSION_UNSUPPORTED");
			this.transaction(() => {
				this.connection.exec(SCHEMA);
				this.connection.exec("PRAGMA user_version=1");
			});
		} catch (error) {
			this.connection.close();
			throw error;
		}
	}
	/** 返回规范JSON历史，按连续日志序号排序。 */
	history(flowRunId: string): FlowJournalEvent[] {
		return this.connection
			.prepare(
				"SELECT log_sequence,kind,payload FROM system_flow_events WHERE scope=? AND run_id=? ORDER BY log_sequence",
			)
			.all(this.scope, flowRunId)
			.map((row) => ({
				sequence: Number(row.log_sequence),
				kind: row.kind as FlowJournalEvent["kind"],
				payload: JSON.parse(String(row.payload)) as unknown,
			}));
	}
	/** 查找稳定调用或检查点，undefined只表示权威不存在。 */
	find(flowRunId: string, key: string, kind: FlowJournalEvent["kind"]): Record<string, unknown> | undefined {
		const row = this.connection
			.prepare("SELECT payload FROM system_flow_events WHERE scope=? AND run_id=? AND activity_key=? AND kind=?")
			.get(this.scope, flowRunId, key, kind);
		return row ? (JSON.parse(String(row.payload)) as Record<string, unknown>) : undefined;
	}
	/** 必须由外层写事务调用；唯一索引在提交前裁决执行资格。 */
	append(
		flowRunId: string,
		event: Omit<FlowJournalEvent, "sequence">,
		body: string,
		activity?: { readonly sequence: number | null; readonly key: string },
	): void {
		const last = this.connection
			.prepare("SELECT COALESCE(MAX(log_sequence),0) AS n FROM system_flow_events WHERE scope=? AND run_id=?")
			.get(this.scope, flowRunId);
		const sequence = Number(last?.n) + 1;
		if (!Number.isSafeInteger(sequence)) throw new Error("FLOW_SEQUENCE_OVERFLOW");
		this.connection
			.prepare(
				"INSERT INTO system_flow_events(scope,run_id,log_sequence,kind,activity_sequence,activity_key,payload) VALUES(?,?,?,?,?,?,?)",
			)
			.run(this.scope, flowRunId, sequence, event.kind, activity?.sequence ?? null, activity?.key ?? null, body);
	}
	/** 完整同步事务；不在事务内执行外部异步调用。 */
	transaction<T>(operation: () => T): T {
		this.connection.exec("BEGIN IMMEDIATE");
		try {
			const result = operation();
			this.connection.exec("COMMIT");
			return result;
		} catch (error) {
			this.connection.exec("ROLLBACK");
			throw error;
		}
	}
	/** 关闭连接并保留历史。 */
	close(): void {
		this.connection.close();
	}
}
