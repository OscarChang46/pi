import { KernelError, type RequestContext } from "../../contracts/index.ts";
import type {
	AuthorizationSnapshot,
	AuthorizationSnapshotPort,
	PermissionCeiling,
	PolicySnapshot,
	PolicySnapshotPort,
} from "../../contracts/permissions.ts";

/** 本地最小部署使用的不可变政策与主体授权快照存储。 */
export class InMemoryPermissionSnapshots implements PolicySnapshotPort, AuthorizationSnapshotPort {
	readonly #snapshot: PolicySnapshot & AuthorizationSnapshot;

	/** 创建与单一租户、主体和政策版本绑定的只读快照。 */
	public constructor(input: {
		readonly policySnapshotId: string;
		readonly authorizationSnapshotId: string;
		readonly tenantId: string;
		readonly subjectId: string;
		readonly ceiling: PermissionCeiling;
	}) {
		if (input.policySnapshotId !== input.authorizationSnapshotId) {
			throw new KernelError("CONTEXT_INVALID", "本地快照适配器要求政策与授权使用同一冻结版本。", false);
		}
		this.#snapshot = Object.freeze({
			snapshotId: input.policySnapshotId,
			policyEpoch: 0,
			tenantId: input.tenantId,
			subjectId: input.subjectId,
			authorizationEpoch: 0,
			ceiling: input.ceiling,
		});
	}

	/** 返回指定政策或主体的冻结快照；未知版本和跨租户请求失败关闭。 */
	public async get(
		context: RequestContext,
		key: string,
		signal: AbortSignal,
	): Promise<PolicySnapshot & AuthorizationSnapshot> {
		signal.throwIfAborted();
		if (
			(key === this.#snapshot.snapshotId || key === this.#snapshot.subjectId) &&
			context.tenant.tenantId === this.#snapshot.tenantId &&
			context.tenant.authorizationSnapshot === this.#snapshot.snapshotId
		) {
			return this.#snapshot;
		}
		throw new KernelError("TOOL_NOT_ALLOWED", "权限快照不存在或不属于当前租户。", false);
	}

	/** 返回政策或主体授权的撤销 epoch；未知快照失败关闭。 */
	public async currentEpoch(context: RequestContext, key: string, signal: AbortSignal): Promise<number> {
		await this.get(context, key, signal);
		return 0;
	}
}
