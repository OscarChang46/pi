import { createHash } from "node:crypto";
import type { FlowArtifactStore } from "../../contracts/flow-artifacts.ts";
import type { ArtifactRef } from "../../contracts/flow-engine.ts";
import type { AgentRunDatabase } from "../state-storage/adapters/run-registry/agent-run-database.ts";

/** SQLite不可变Artifact；摘要针对实际存储字节，允许模型原生JSON小数。 */
export class SqliteFlowArtifacts implements FlowArtifactStore {
	readonly #db: AgentRunDatabase;
	readonly #scope: string;
	/** 固定数据库和受信任作用域。 */
	constructor(db: AgentRunDatabase, scope: string) {
		if (!scope) throw new Error("FLOW_STORAGE_SCOPE_REQUIRED");
		this.#db = db;
		this.#scope = scope;
	}
	/** 单个正文不超过4MiB；先耐久写入再返回引用。 */
	put(value: unknown): ArtifactRef {
		const body = JSON.stringify(value);
		if (body === undefined || Buffer.byteLength(body) > 4194304) throw new Error("FLOW_ARTIFACT_LIMIT");
		const hash = createHash("sha256").update(body).digest("hex");
		const ref = { id: `art:${hash}`, digest: `sha256:${hash}`, bytes: Buffer.byteLength(body) };
		this.#db.write(
			"INSERT OR IGNORE INTO flow_artifacts VALUES(?,?,?,?,?)",
			this.#scope,
			ref.id,
			ref.digest,
			ref.bytes,
			body,
		);
		this.get(ref);
		return ref;
	}
	/** 拒绝缺失、长度错误或摘要不匹配的正文。 */
	get(ref: ArtifactRef): unknown {
		const row = this.#db.rows("SELECT body FROM flow_artifacts WHERE scope=? AND id=?", this.#scope, ref.id)[0];
		if (!row) throw new Error("FLOW_ARTIFACT_NOT_FOUND");
		const body = String(row.body);
		const digest = `sha256:${createHash("sha256").update(body).digest("hex")}`;
		if (digest !== ref.digest || Buffer.byteLength(body) !== ref.bytes || ref.id !== `art:${digest.slice(7)}`)
			throw new Error("FLOW_ARTIFACT_CORRUPT");
		return JSON.parse(body);
	}
}
