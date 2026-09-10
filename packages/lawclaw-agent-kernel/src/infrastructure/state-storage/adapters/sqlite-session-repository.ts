import { DatabaseSync } from "node:sqlite";
import type {
	DurableSession,
	SessionPersistence,
} from "../../../contracts/control/session-manager/session-persistence.ts";
import { flowDigest } from "../../../contracts/flow-value.ts";

/** Session 独立 SQLite 数据库；不查询或更新 Run 表。 */
export class SqliteSessionRepository implements SessionPersistence {
	readonly #db: DatabaseSync;
	readonly #scope: string;
	/** 建立独立 WAL/FULL 连接，未知版本拒绝打开。 */
	constructor(path: string, scope: string) {
		this.#scope = scope;
		this.#db = new DatabaseSync(path);
		try {
			this.#db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
			const version = this.#db.prepare("PRAGMA user_version").get()?.user_version;
			if (version !== 0 && version !== 1) throw new Error("SESSION_STORAGE_VERSION_UNSUPPORTED");
			this.#db.exec(`CREATE TABLE IF NOT EXISTS sessions (
			 scope TEXT NOT NULL, id TEXT NOT NULL, logical_key TEXT NOT NULL, revision INTEGER NOT NULL,
			 active INTEGER NOT NULL, body TEXT NOT NULL, digest TEXT NOT NULL,
			 PRIMARY KEY(scope,id), UNIQUE(scope,logical_key));
			 CREATE TABLE IF NOT EXISTS session_receipts (
			 scope TEXT NOT NULL, command_id TEXT NOT NULL, digest TEXT NOT NULL, result TEXT NOT NULL,
			 PRIMARY KEY(scope,command_id)); PRAGMA user_version=1;`);
		} catch (error) {
			this.#db.close();
			throw error;
		}
	}
	/** 本地同步事务；不得跨 await 或进入其他存储事务。 */
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
	/** 读取本作用域聚合，校验持久摘要。 */
	get(sessionId: string): DurableSession | null {
		return this.#decode(
			this.#db.prepare("SELECT body,digest FROM sessions WHERE scope=? AND id=?").get(this.#scope, sessionId),
		);
	}
	/** 查询不创建任何记录。 */
	lookup(logicalKey: string): DurableSession | null {
		return this.#decode(
			this.#db
				.prepare("SELECT body,digest FROM sessions WHERE scope=? AND logical_key=?")
				.get(this.#scope, logicalKey),
		);
	}
	/** 保存有界完整历史，更新必须匹配原修订号。 */
	save(session: DurableSession, expectedRevision: number | null): void {
		const body = JSON.stringify(session);
		if (Buffer.byteLength(body) > 16 * 1024 * 1024) throw new Error("SESSION_HISTORY_LIMIT");
		const values = [session.revision, Number(session.active !== null), body, flowDigest(session)];
		if (expectedRevision === null) {
			this.#db
				.prepare("INSERT INTO sessions VALUES(?,?,?,?,?,?,?)")
				.run(this.#scope, session.anchor.sessionId, session.intent.logicalKey, ...values);
		} else {
			const result = this.#db
				.prepare("UPDATE sessions SET revision=?,active=?,body=?,digest=? WHERE scope=? AND id=? AND revision=?")
				.run(...values, this.#scope, session.anchor.sessionId, expectedRevision);
			if (result.changes !== 1) throw new Error("SESSION_VERSION_CONFLICT");
		}
	}
	/** 回执先校验摘要，再返回原结果。 */
	receipt(commandId: string, digest: string): string | null {
		const row = this.#db
			.prepare("SELECT digest,result FROM session_receipts WHERE scope=? AND command_id=?")
			.get(this.#scope, commandId);
		if (!row) return null;
		if (row.digest !== digest) throw new Error("SESSION_IDEMPOTENCY_CONFLICT");
		return String(row.result);
	}
	/** 与聚合写入同一事务保存回执，不覆盖旧命令。 */
	record(commandId: string, digest: string, result: string): void {
		this.#db.prepare("INSERT INTO session_receipts VALUES(?,?,?,?)").run(this.#scope, commandId, digest, result);
	}
	/** 恢复扫描只读取非空绑定，超过本地档案上限拒绝。 */
	pending(): readonly DurableSession[] {
		const rows = this.#db
			.prepare("SELECT body,digest FROM sessions WHERE scope=? AND active=1 LIMIT 4097")
			.all(this.#scope);
		if (rows.length > 4096) throw new Error("SESSION_SCAN_LIMIT");
		return rows.map((row) => this.#decode(row)!);
	}
	/** 关闭连接，保留恢复事实。 */
	close(): void {
		this.#db.close();
	}
	#decode(row: { body?: unknown; digest?: unknown } | undefined): DurableSession | null {
		if (!row) return null;
		const value = JSON.parse(String(row.body)) as DurableSession;
		if (flowDigest(value) !== row.digest) throw new Error("SESSION_STORAGE_CORRUPT");
		return value;
	}
}
