import type { AdvanceInput, ExecutionClaim } from "../../contracts/flow-engine.ts";
import type { FlowStorageRules } from "../../contracts/flow-storage.ts";
import type { TimePort } from "../../contracts/index.ts";
import { FlowSqliteDatabase } from "./flow-sqlite-database.ts";

/** 共享同一SQLite连接、作用域及快照规则，跨表提交不得换连接。 */
export class FlowSqliteSession {
	/** 由存储门面拥有的连接。 */
	readonly db: FlowSqliteDatabase;
	/** 固定可信作用域。 */
	readonly scope: string;
	/** 注入的Core校验与摘要协议。 */
	readonly rules: FlowStorageRules;
	/** 可信时钟。 */
	readonly time: TimePort;
	/** 建立连接；空作用域拒绝。 */
	constructor(path: string, scope: string, rules: FlowStorageRules, time: TimePort) {
		if (!scope) throw new Error("FLOW_STORAGE_SCOPE_REQUIRED");
		this.db = new FlowSqliteDatabase(path);
		this.scope = scope;
		this.rules = rules;
		this.time = time;
	}
	/** 读取并验证独立输入；损坏数据不伪装为不存在。 */
	load(runId: string): AdvanceInput | null {
		const row = this.row(runId);
		if (!row) return null;
		const input: unknown = JSON.parse(String(row.input_json));
		if (!this.rules.isInput(input)) throw new Error("FLOW_STORAGE_CORRUPT");
		return input;
	}
	/** 读取当前租约及Run行；不存在返回undefined。 */
	row(runId: string) {
		return this.db.rows("SELECT * FROM flow_runs WHERE scope=? AND run_id=?", this.scope, runId)[0];
	}
	/** 按权威行核对Owner、Attempt、fence及有效期。 */
	validClaim(runId: string, claim: ExecutionClaim): boolean {
		const row = this.row(runId);
		const input = this.load(runId);
		const now = this.time.now().epochMilliseconds;
		return (
			!!row &&
			!!input &&
			row.owner_id === claim.ownerId &&
			row.fence === claim.fence &&
			input.run.attemptId === claim.attemptId &&
			Number(row.claim_until) > now &&
			claim.expiresAtMs > now
		);
	}
	/** 写入快照及版本投影；由调用者事务包围。 */
	save(input: AdvanceInput): void {
		this.db.write(
			"UPDATE flow_runs SET input_json=?,version=?,cancel_epoch=? WHERE scope=? AND run_id=?",
			JSON.stringify(input),
			input.run.version,
			input.run.cancelEpoch,
			this.scope,
			input.run.runId,
		);
	}
}
