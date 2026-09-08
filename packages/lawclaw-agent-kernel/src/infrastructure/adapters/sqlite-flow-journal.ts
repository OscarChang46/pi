import type {
	FlowActivity,
	FlowActivityRecord,
	FlowExecutionToken,
	FlowJournal,
	FlowJournalEvent,
	FlowRun,
	FlowRunRequest,
	FlowSystemAction,
} from "../../contracts/flow-system.ts";
import { resolveSystemTransition } from "../../contracts/flow-system-transitions.ts";
import { FLOW_JOURNAL_EVENT, FLOW_SYSTEM_STATE } from "../../contracts/flow-system-values.ts";
import { canonicalize, flowDigest } from "../../contracts/flow-value.ts";
import { FlowJournalDatabase } from "./flow-journal-database.ts";

/** 系统权威追加日志；不持久化业务快照或资源分配信息。 */
export class SqliteFlowJournal implements FlowJournal {
	readonly #db: FlowJournalDatabase;
	/** 每个实例的scope固定，调用方不能在请求中更换租户。 */
	constructor(path: string, scope: string) {
		this.#db = new FlowJournalDatabase(path, scope);
	}
	/** 同ID异版本或异输入拒绝；受理事件不修改。 */
	admit(request: FlowRunRequest): FlowRun {
		validateKey(request.flowRunId);
		validateKey(request.workflowVersion);
		if (Object.keys(request).some((key) => !["flowRunId", "workflowVersion", "input"].includes(key)))
			throw new Error("FLOW_RUN_REQUEST_INVALID");
		// v1摘要字段固定为runId；API改名不能改变既有执行身份或重放结果。
		const identity = flowDigest({
			runId: request.flowRunId,
			workflowVersion: request.workflowVersion,
			input: request.input,
		});
		return this.#db.transaction(() => {
			const first = this.history(request.flowRunId)[0];
			if (first) {
				if ((first.payload as { identity: string }).identity !== identity)
					throw new Error("FLOW_RUN_IDENTITY_CONFLICT");
			} else
				this.#append(request.flowRunId, FLOW_JOURNAL_EVENT.RUN_ADMITTED, {
					identity,
					workflowVersion: request.workflowVersion,
				});
			return this.get(request.flowRunId);
		});
	}
	/** 只从不可变事件构建视图。 */
	get(flowRunId: string): FlowRun {
		const events = this.history(flowRunId);
		if (events[0]?.kind !== FLOW_JOURNAL_EVENT.RUN_ADMITTED) throw new Error("FLOW_RUN_NOT_FOUND");
		let flowRun: FlowRun = {
			flowRunId,
			revision: 1,
			state: FLOW_SYSTEM_STATE.READY,
			epoch: 0,
			reason: "ADMITTED",
			result: null,
		};
		for (const event of events) {
			if (event.kind === FLOW_JOURNAL_EVENT.STATE_CHANGED) {
				const data = event.payload as { action: FlowSystemAction; reason: string; result: unknown };
				const state = resolveSystemTransition(flowRun.state, data.action);
				flowRun = {
					...flowRun,
					state,
					epoch: state === FLOW_SYSTEM_STATE.RUNNING ? event.sequence : flowRun.epoch,
					reason: data.reason,
					result: data.result,
				};
			}
			flowRun = { ...flowRun, revision: event.sequence };
		}
		return flowRun;
	}
	/** 追加生命周期事件；陈旧版本不能改变当前代次。 */
	transition(flowRun: FlowRun, action: FlowSystemAction, reason: string, result: unknown = null): FlowRun {
		validateKey(reason);
		return this.#db.transaction(() => {
			const actual = this.get(flowRun.flowRunId);
			if (actual.revision !== flowRun.revision) throw new Error("FLOW_REVISION_CONFLICT");
			resolveSystemTransition(actual.state, action);
			this.#append(flowRun.flowRunId, FLOW_JOURNAL_EVENT.STATE_CHANGED, { action, reason, result });
			return this.get(flowRun.flowRunId);
		});
	}
	/** 每次新增调用、结果和检查点提交均验证执行代次。 */
	assertActive(token: FlowExecutionToken): void {
		const flowRun = this.get(token.flowRunId);
		if (flowRun.state !== FLOW_SYSTEM_STATE.RUNNING || flowRun.epoch !== token.epoch)
			throw new Error("FLOW_EXECUTION_STALE");
	}
	/** 只读检查所有Started是否都有Completed。 */
	hasUnfinished(flowRunId: string): boolean {
		return Boolean(
			this.#db.connection
				.prepare(
					"SELECT 1 FROM system_flow_events s WHERE s.scope=? AND s.run_id=? AND s.kind=? AND NOT EXISTS (SELECT 1 FROM system_flow_events c WHERE c.scope=s.scope AND c.run_id=s.run_id AND c.activity_sequence=s.activity_sequence AND c.kind=?) LIMIT 1",
				)
				.get(this.#db.scope, flowRunId, FLOW_JOURNAL_EVENT.ACTIVITY_STARTED, FLOW_JOURNAL_EVENT.ACTIVITY_COMPLETED),
		);
	}
	/** 只读既有调用并核对身份，不授予执行资格。 */
	readActivity(flowRunId: string, activity: FlowActivity): FlowActivityRecord | undefined {
		const record = this.#activity(flowRunId, activity.key);
		if (record && record.identity !== activityIdentity(activity)) throw new Error("FLOW_ACTIVITY_IDENTITY_CONFLICT");
		return record;
	}
	/** 原子读取历史或唯一INSERT Started；仅inserted=true准许调用。 */
	start(token: FlowExecutionToken, activity: FlowActivity) {
		const identity = activityIdentity(activity);
		return this.#db.transaction(() => {
			this.assertActive(token);
			const prior = this.#activity(token.flowRunId, activity.key);
			if (prior) {
				if (prior.identity !== identity) throw new Error("FLOW_ACTIVITY_IDENTITY_CONFLICT");
				return { inserted: false, record: prior };
			}
			const row = this.#db.connection
				.prepare(
					"SELECT COALESCE(MAX(activity_sequence),0) AS n FROM system_flow_events WHERE scope=? AND run_id=?",
				)
				.get(this.#db.scope, token.flowRunId);
			const sequence = Number(row?.n) + 1;
			if (!Number.isSafeInteger(sequence)) throw new Error("FLOW_SEQUENCE_OVERFLOW");
			const record = { sequence, identity, completed: false, result: null };
			this.#append(
				token.flowRunId,
				FLOW_JOURNAL_EVENT.ACTIVITY_STARTED,
				{ sequence, identity, epoch: token.epoch, name: activity.name, version: activity.version },
				{ sequence, key: activity.key },
			);
			return { inserted: true, record };
		});
	}
	/** Completed与Started身份相同；重复结果必须相同。 */
	complete(token: FlowExecutionToken, activity: FlowActivity, result: unknown): void {
		this.#db.transaction(() => {
			this.assertActive(token);
			this.#complete(token.flowRunId, activity, result, null);
		});
	}
	/** 仅受信维护方可调用，要求Yield和非空权威证据引用。 */
	reconcile(flowRunId: string, activity: FlowActivity, result: unknown, evidence: string): void {
		validateKey(evidence);
		this.#db.transaction(() => {
			if (this.get(flowRunId).state !== FLOW_SYSTEM_STATE.YIELD)
				throw new Error("FLOW_RECONCILIATION_REQUIRES_YIELD");
			this.#complete(flowRunId, activity, result, evidence);
		});
	}
	/** 读取节点结果；null与缺失严格区分。 */
	checkpoint(flowRunId: string, key: string): unknown | undefined {
		return this.#db.find(flowRunId, key, FLOW_JOURNAL_EVENT.CHECKPOINT)?.value;
	}
	/** 节点检查点不执行外部操作；同key的不同结果属于确定性破坏。 */
	saveCheckpoint(token: FlowExecutionToken, key: string, value: unknown): void {
		validateKey(key);
		const digest = flowDigest(value);
		this.#db.transaction(() => {
			this.assertActive(token);
			const prior = this.#db.find(token.flowRunId, key, FLOW_JOURNAL_EVENT.CHECKPOINT);
			if (prior) {
				if (prior.digest !== digest) throw new Error("FLOW_CHECKPOINT_CONFLICT");
				return;
			}
			this.#append(token.flowRunId, FLOW_JOURNAL_EVENT.CHECKPOINT, { digest, value }, { sequence: null, key });
		});
	}
	/** 受授权的完整历史；默认HTTP诊断只应返回聚合信息。 */
	history(flowRunId: string): readonly FlowJournalEvent[] {
		return this.#db.history(flowRunId);
	}
	/** 关闭连接，日志留存不变。 */
	close(): void {
		this.#db.close();
	}
	#activity(flowRunId: string, key: string): FlowActivityRecord | undefined {
		const started = this.#db.find(flowRunId, key, FLOW_JOURNAL_EVENT.ACTIVITY_STARTED);
		if (!started) return undefined;
		const completed = this.#db.find(flowRunId, key, FLOW_JOURNAL_EVENT.ACTIVITY_COMPLETED);
		return {
			sequence: Number(started.sequence),
			identity: String(started.identity),
			completed: completed !== undefined,
			result: completed?.result ?? null,
		};
	}
	#complete(flowRunId: string, activity: FlowActivity, result: unknown, evidence: string | null): void {
		const prior = this.#activity(flowRunId, activity.key);
		if (!prior || prior.identity !== activityIdentity(activity)) throw new Error("FLOW_ACTIVITY_IDENTITY_CONFLICT");
		if (prior.completed) {
			if (flowDigest(prior.result) !== flowDigest(result)) throw new Error("FLOW_ACTIVITY_RESULT_CONFLICT");
			return;
		}
		this.#append(
			flowRunId,
			FLOW_JOURNAL_EVENT.ACTIVITY_COMPLETED,
			{ sequence: prior.sequence, identity: prior.identity, result, evidence },
			{ sequence: prior.sequence, key: activity.key },
		);
	}
	#append(
		flowRunId: string,
		kind: FlowJournalEvent["kind"],
		payload: unknown,
		activity?: { readonly sequence: number | null; readonly key: string },
	): void {
		this.#db.append(flowRunId, { kind, payload }, canonicalize(payload), activity);
	}
}

function validateKey(value: string): void {
	if (typeof value !== "string" || !/^[A-Za-z0-9_.:/-]{1,256}$/.test(value)) throw new Error("FLOW_ID_INVALID");
}

function activityIdentity(activity: FlowActivity): string {
	validateKey(activity.key);
	validateKey(activity.name);
	validateKey(activity.version);
	return flowDigest(activity);
}
