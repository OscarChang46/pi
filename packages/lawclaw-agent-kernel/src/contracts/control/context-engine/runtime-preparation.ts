import type { FlowArtifactStore } from "../../flow-artifacts.ts";
import type { ContextEnginePort } from "../../control.ts";
import type { ExpectedChildObservation, SessionAnchor } from "./assembly-basis.ts";
import type { SourceRecord } from "./assembly-messages.ts";
import type { SourceReadBinding, SourceReadResult } from "./source-reader.ts";

/** Session 宿主冻结的历史视图；写入仍由 Session 条件绑定兜底。 */
export interface RunSessionContext {
	/** 组装期间不得推进的确定版本。 */ readonly anchor: SessionAnchor;
	/** 完整历史，未经预算选择。 */ readonly records: readonly SourceRecord[];
	/** 已确认协调事实产生的应到观察。 */ readonly expectedChildObservations: readonly ExpectedChildObservation[];
	/** 成功 Run 在匹配版本及占用代次下追加完整历史。 */
	commit(records: readonly SourceRecord[], observations: readonly ExpectedChildObservation[]): void;
}

/** 宿主冻结的完整历史；来源身份由权威快照提供。 */
export interface FrozenHistorySource {
	/** 确切版本；Session 保存完整集合，读取时才能收窄。 */
	readonly binding: Extract<
		SourceReadBinding,
		{
			/** 历史来源只允许确切 Session 或 Run，不接受资料和 Memory。 */
			kind: "session" | "run";
		}
	>;
	/** 未裁剪的规范记录和依赖。 */
	readonly result: SourceReadResult;
}

/** 为一次冻结历史创建独占的 ContextEngine；组装本身只使用 ContextEnginePort。 */
export interface ContextEngineFactory {
	/** 来源快照只绑定到本次调用，不能跨轮次复用。 */
	create(sources: readonly FrozenHistorySource[]): ContextEnginePort;
}

/** 宿主准备依赖；写端口只交给宿主，不进入 CE。 */
export interface RuntimeContextDependencies {
	/** 为每次候选计算创建独占组装器。 */ readonly engineFactory: ContextEngineFactory;
	/** 宿主保存冻结输入和完整候选的存储。 */ readonly artifacts: FlowArtifactStore;
}
