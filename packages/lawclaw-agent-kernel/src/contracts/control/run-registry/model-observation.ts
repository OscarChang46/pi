/** 模型临时输出身份；不构成已提交的 Run 或 Session 事实。 */
export interface ModelObservationIdentity {
	/** 权威模型命令所属的 AgentRun。 */
	readonly runId: string;
	/** 当前执行代次，用于丢弃旧执行输出。 */
	readonly attemptId: string;
	/** 已提交的模型命令标识；区分同 Run 的多轮模型调用。 */
	readonly commandId: string;
}

/** 控制层在模型执行边界产生的临时通知；终态必须另查权威 Run。 */
export type ModelObservation = ModelObservationIdentity &
	(
		| { /** 新一轮模型文本开始，偏移归零。 */ readonly kind: "start" }
		| {
				/** 连续模型文本片段。 */ readonly kind: "delta";
				/** 本片段在该模型命令中的 Unicode 码点偏移。 */ readonly offset: number;
				/** 模型原始文本；仅授权订阅者可读，渲染方仍须清洗。 */ readonly text: string;
		  }
		| { /** 正常或异常离开模型调用；不表示业务成功。 */ readonly kind: "end" }
	);

/** 非耐久观察端口；接收方必须有界、同步且不抛错，不得发起模型或工具执行。 */
export interface ModelObservationPort {
	/** 转交原始增量；允许丢弃，不能影响权威命令提交或把文本记作耐久事实。 */
	publish(event: ModelObservation): void;
}
