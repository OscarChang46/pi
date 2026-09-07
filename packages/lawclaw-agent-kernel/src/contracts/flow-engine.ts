/** 不透明引用，限128个ASCII标识字符；不得作为访问授权。 */
export type Ref = string;

/** FE-C14N-1的SHA-256摘要；不等于授权证据。 */
export type Digest = string;

/** 非负安全整数；递增溢出必须拒绝。 */
export type Counter = number;

/** UTC Unix毫秒安全整数。 */
export type Millis = number;

/** 执行端报告的副作用事实；UNKNOWN禁止盲目重发。 */
export type Effect = "NONE" | "KNOWN_NOT_APPLIED" | "KNOWN_APPLIED" | "UNKNOWN";

/** FE-CON-1 的 ArtifactRef 数据结构。 */
export interface ArtifactRef {
	/** 协议字段 id；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly id: Ref;

	/** 协议字段 digest；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly digest: Digest;

	/** 协议字段 bytes；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly bytes: Counter;
}

/** FE-CON-1 的 FrozenBindings 数据结构。 */
export interface FrozenBindings {
	/** 协议字段 sessionId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly sessionId: Ref;

	/** 协议字段 sessionVersion；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly sessionVersion: Counter;

	/** 协议字段 executionEnvelopeRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly executionEnvelopeRef: Ref;

	/** 协议字段 routeSnapshotRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly routeSnapshotRef: Ref;

	/** 协议字段 policySnapshotRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly policySnapshotRef: Ref;

	/** 协议字段 configVersion；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly configVersion: Ref;
}

/** FE-CON-1 的 RunBudget 数据结构。 */
export interface RunBudget {
	/** 协议字段 maxTurns；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly maxTurns: Counter;

	/** 协议字段 maxToolCalls；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly maxToolCalls: Counter;

	/** 协议字段 maxChildren；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly maxChildren: Counter;

	/** 协议字段 maxDepth；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly maxDepth: Counter;

	/** 协议字段 maxContextBytes；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly maxContextBytes: Counter;

	/** 协议字段 maxInputTokens；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly maxInputTokens: Counter;

	/** 协议字段 outputReserveTokens；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly outputReserveTokens: Counter;

	/** 协议字段 maxOutputBytes；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly maxOutputBytes: Counter;
}

/** FE-CON-1 的 RunUsage 数据结构。 */
export interface RunUsage {
	/** 协议字段 turnsReserved；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly turnsReserved: Counter;

	/** 协议字段 toolsReserved；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly toolsReserved: Counter;

	/** 协议字段 childrenReserved；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly childrenReserved: Counter;
}

/** FE-CON-1 的 ActionProposal 数据结构。 */
export interface ActionProposal {
	/** 协议字段 proposalId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly proposalId: Ref;

	/** 协议字段 toolDescriptorRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly toolDescriptorRef: Ref;

	/** 协议字段 toolDescriptorDigest；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly toolDescriptorDigest: Digest;

	/** 协议字段 argumentsRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly argumentsRef: ArtifactRef;

	/** 协议字段 actionDigest；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly actionDigest: Digest;
}

/** FE-CON-1 的 ChildSpec 数据结构。 */
export interface ChildSpec {
	/** 协议字段 goalRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly goalRef: ArtifactRef;

	/** 协议字段 envelopeSubsetRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly envelopeSubsetRef: Ref;

	/** 协议字段 budget；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly budget: RunBudget;

	/** 协议字段 deadlineAtMs；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly deadlineAtMs: Millis;
}

/** FE-CON-1 的 WaitReason 数据结构。 */
export type WaitReason =
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "approval";

			/** 协议字段 approvalRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly approvalRef: Ref;

			/** 协议字段 proposalId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposalId: Ref;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "tool_unknown";

			/** 协议字段 toolCommandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly toolCommandId: Ref;

			/** 协议字段 incidentRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly incidentRef: Ref;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "model_unknown";

			/** 协议字段 modelCommandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly modelCommandId: Ref;

			/** 协议字段 incidentRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly incidentRef: Ref;
	  };

/** FE-CON-1 的 FlowPosition 数据结构。 */
export type FlowPosition =
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "Ready";
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "AwaitingModel";

			/** 协议字段 commandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commandId: Ref;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "AwaitingPermission";

			/** 协议字段 proposalId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposalId: Ref;

			/** 协议字段 commandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commandId: Ref;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "AwaitingTool";

			/** 协议字段 proposalId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposalId: Ref;

			/** 协议字段 commandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commandId: Ref;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "AwaitingChild";

			/** 协议字段 childId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly childId: Ref;

			/** 协议字段 commandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commandId: Ref;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "Suspended";

			/** 协议字段 reason；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly reason: WaitReason;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "Completed";

			/** 协议字段 outputRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly outputRef: ArtifactRef;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "Failed";

			/** 协议字段 code；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly code: FlowErrorCode;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "Cancelled";

			/** 协议字段 reason；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly reason: "requested" | "deadline";
	  };

/** 权威Run快照；提交必须验证version与cancelEpoch。 */
export interface RunSnapshot {
	/** 协议字段 runId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly runId: Ref;

	/** 协议字段 attemptId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly attemptId: Ref;

	/** 协议字段 version；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly version: Counter;

	/** 协议字段 consumedSequence；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly consumedSequence: Counter;

	/** 协议字段 bindings；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly bindings: FrozenBindings;

	/** 协议字段 position；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly position: FlowPosition;

	/** 协议字段 budget；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly budget: RunBudget;

	/** 协议字段 usage；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly usage: RunUsage;

	/** 协议字段 depth；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly depth: Counter;

	/** 协议字段 deadlineAtMs；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly deadlineAtMs: Millis;

	/** 协议字段 cancelEpoch；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly cancelEpoch: Counter;

	/** 协议字段 cancellationRequested；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly cancellationRequested: boolean;

	/** 协议字段 pendingActions；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly pendingActions: readonly ActionProposal[];

	/** 协议字段 transcriptHeadRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly transcriptHeadRef: Ref;
}

/** Run冻结的Session历史版本，不要求当前最新版本。 */
export interface SessionSnapshot {
	/** 协议字段 sessionId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly sessionId: Ref;

	/** 协议字段 version；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly version: Counter;

	/** 协议字段 historyHeadRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly historyHeadRef: Ref;
}

/** 绑定Run版本与转录头的上下文引用。 */
export interface ContextFrame {
	/** 协议字段 frameId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly frameId: Ref;

	/** 协议字段 bindings；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly bindings: FrozenBindings;

	/** 协议字段 sourceRunVersion；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly sourceRunVersion: Counter;

	/** 协议字段 transcriptHeadRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly transcriptHeadRef: Ref;

	/** 协议字段 promptRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly promptRef: ArtifactRef;

	/** 协议字段 inputTokens；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly inputTokens: Counter;
}

/** FE-CON-1 的 OperationContext 数据结构。 */
export interface OperationContext {
	/** 协议字段 requestId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly requestId: Ref;

	/** 协议字段 traceparent；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly traceparent: string;

	/** 协议字段 correlationId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly correlationId: Ref;

	/** 协议字段 nowMs；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly nowMs: Millis;

	/** 协议字段 deadlineAtMs；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly deadlineAtMs: Millis;
}

/** FE-CON-1 的 ModelOutput 数据结构。 */
export type ModelOutput =
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "answer";

			/** 协议字段 outputRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly outputRef: ArtifactRef;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "tools";

			/** 协议字段 proposals；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposals: readonly ActionProposal[];
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "child";

			/** 协议字段 spec；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly spec: ChildSpec;
	  };

/** FE-CON-1 的 RuntimePayload 数据结构。 */
export type RuntimePayload =
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "AdvanceRequested";

			/** 协议字段 basisVersion；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly basisVersion: Counter;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "ModelCompleted";

			/** 协议字段 modelCommandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly modelCommandId: Ref;

			/** 协议字段 assistantTurnRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly assistantTurnRef: ArtifactRef;

			/** 协议字段 output；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly output: ModelOutput;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "ModelFailed";

			/** 协议字段 modelCommandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly modelCommandId: Ref;

			/** 协议字段 effect；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly effect: Effect;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "PermissionResolved";

			/** 协议字段 proposalId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposalId: Ref;

			/** 协议字段 result；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly result:
				| {
						/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
						readonly kind: "allow";

						/** 协议字段 permitRef；必填，取值及空值语义遵循 FE-CON-1。 */
						readonly permitRef: Ref;

						/** 协议字段 expiresAtMs；必填，取值及空值语义遵循 FE-CON-1。 */
						readonly expiresAtMs: Millis;
				  }
				| {
						/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
						readonly kind: "ask";

						/** 协议字段 approvalRef；必填，取值及空值语义遵循 FE-CON-1。 */
						readonly approvalRef: Ref;
				  }
				| {
						/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
						readonly kind: "deny";
				  }
				| {
						/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
						readonly kind: "unavailable";
				  };
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "ToolObserved";

			/** 协议字段 toolCommandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly toolCommandId: Ref;

			/** 协议字段 proposalId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposalId: Ref;

			/** 协议字段 effect；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly effect: Effect;

			/** 协议字段 outcome；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly outcome: "success" | "failed";

			/** 协议字段 resultRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly resultRef: ArtifactRef | null;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "ApprovalResolved";

			/** 协议字段 approvalRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly approvalRef: Ref;

			/** 协议字段 proposalId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposalId: Ref;

			/** 协议字段 approved；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly approved: boolean;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "ChildCompleted";

			/** 协议字段 childId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly childId: Ref;

			/** 协议字段 outcome；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly outcome: "completed" | "failed" | "cancelled";

			/** 协议字段 resultRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly resultRef: ArtifactRef | null;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "EffectReconciled";

			/** 协议字段 commandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commandId: Ref;

			/** 协议字段 incidentRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly incidentRef: Ref;

			/** 协议字段 result；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly result: "model_completed" | "tool_completed" | "not_applied" | "failed";

			/** 协议字段 resultRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly resultRef: ArtifactRef | null;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "CancelRequested";
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "DeadlineReached";
	  };

/** FE-CON-1 的 RuntimeEvent 数据结构。 */
export interface RuntimeEvent {
	/** 协议字段 eventId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly eventId: Ref;

	/** 协议字段 runId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly runId: Ref;

	/** 协议字段 attemptId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly attemptId: Ref;

	/** 协议字段 sequence；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly sequence: Counter;

	/** 协议字段 source；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly source: "scheduler" | "model" | "security" | "tool" | "child" | "recovery";

	/** 协议字段 causationId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly causationId: Ref;

	/** 协议字段 payload；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly payload: RuntimePayload;

	/** 协议字段 payloadDigest；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly payloadDigest: Digest;
}

/** FE-CON-1 的 PriorEventReceipt 数据结构。 */
export interface PriorEventReceipt {
	/** 协议字段 eventId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly eventId: Ref;

	/** 协议字段 sequence；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly sequence: Counter;

	/** 协议字段 payloadDigest；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly payloadDigest: Digest;

	/** 协议字段 commitId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly commitId: Ref;
}

/** 单次推进的完整不可变输入，绑定冻结快照和事件。 */
export interface AdvanceInput {
	/** 协议字段 protocolVersion；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly protocolVersion: "1.0.0";

	/** 协议字段 run；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly run: RunSnapshot;

	/** 协议字段 session；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly session: SessionSnapshot;

	/** 协议字段 context；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly context: ContextFrame | null;

	/** 协议字段 contextFailure；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly contextFailure: "unavailable" | "limit_exceeded" | null;

	/** 协议字段 event；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly event: RuntimeEvent;

	/** 协议字段 priorReceipt；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly priorReceipt: PriorEventReceipt | null;

	/** 协议字段 operation；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly operation: OperationContext;
}

/** FE-CON-1 的 FlowErrorCode 数据结构。 */
export type FlowErrorCode =
	| "FLOW_INPUT_INVALID"
	| "FLOW_SCOPE_MISMATCH"
	| "FLOW_EVENT_CONFLICT"
	| "FLOW_SEQUENCE_GAP"
	| "FLOW_STALE_ATTEMPT"
	| "FLOW_INVALID_TRANSITION"
	| "FLOW_CONTEXT_REQUIRED"
	| "FLOW_CONTEXT_LIMIT_EXCEEDED"
	| "FLOW_BUDGET_EXCEEDED"
	| "FLOW_CONTEXT_UNAVAILABLE"
	| "FLOW_MODEL_FAILED"
	| "FLOW_PERMISSION_DENIED"
	| "FLOW_PERMISSION_UNAVAILABLE"
	| "FLOW_PERMIT_INVALID"
	| "FLOW_TOOL_FAILED"
	| "FLOW_CHILD_FAILED"
	| "FLOW_RECONCILIATION_FAILED"
	| "FLOW_INTERNAL_PLAN_INVALID";

/** FE-CON-1 的 FlowError 数据结构。 */
export interface FlowError {
	/** 协议字段 code；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly code: FlowErrorCode;

	/** 协议字段 field；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly field: string | null;
}

/** FE-CON-1 的 CommandPayload 数据结构。 */
export type CommandPayload =
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "InvokeModel";

			/** 协议字段 promptRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly promptRef: ArtifactRef;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "RequestPermission";

			/** 协议字段 proposal；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposal: ActionProposal;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "DispatchTool";

			/** 协议字段 proposal；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposal: ActionProposal;

			/** 协议字段 permitRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly permitRef: Ref;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "CreateChildRun";

			/** 协议字段 childId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly childId: Ref;

			/** 协议字段 spec；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly spec: ChildSpec;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "CancelOutstanding";

			/** 协议字段 cancelEpoch；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly cancelEpoch: Counter;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "RequestReconciliation";

			/** 协议字段 targetCommandId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly targetCommandId: Ref;

			/** 协议字段 incidentRef；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly incidentRef: Ref;
	  };

/** FE-CON-1 的 EngineCommand 数据结构。 */
export interface EngineCommand {
	/** 协议字段 commandId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly commandId: Ref;

	/** 协议字段 idempotencyKey；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly idempotencyKey: Ref;

	/** 协议字段 causationId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly causationId: Ref;

	/** 协议字段 runId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly runId: Ref;

	/** 协议字段 originAttemptId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly originAttemptId: Ref;

	/** 协议字段 executionEnvelopeRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly executionEnvelopeRef: Ref;

	/** 协议字段 deadlineAtMs；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly deadlineAtMs: Millis;

	/** 协议字段 payload；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly payload: CommandPayload;
}

/** FE-CON-1 的 TranscriptEntry 数据结构。 */
export interface TranscriptEntry {
	/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly kind: "assistant" | "tool" | "child";

	/** 协议字段 eventId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly eventId: Ref;

	/** 协议字段 commandId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly commandId: Ref;

	/** 协议字段 proposalId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly proposalId: Ref | null;

	/** 协议字段 childId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly childId: Ref | null;

	/** 协议字段 artifact；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly artifact: ArtifactRef;
}

/** FE-CON-1 的 NextRunState 数据结构。 */
export interface NextRunState {
	/** 协议字段 position；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly position: FlowPosition;

	/** 协议字段 usage；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly usage: RunUsage;

	/** 协议字段 pendingActions；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly pendingActions: readonly ActionProposal[];

	/** 协议字段 transcriptAppend；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly transcriptAppend: readonly TranscriptEntry[];
}

/** FE-CON-1 的 PlannedPosition 数据结构。 */
export type PlannedPosition =
	| Exclude<
			FlowPosition,
			{
				/** 协议字段 commandId；必填，取值及空值语义遵循 FE-CON-1。 */
				readonly commandId: Ref;
			}
	  >
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "AwaitingModel";

			/** 协议字段 commandOrdinal；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commandOrdinal: Counter;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "AwaitingPermission" | "AwaitingTool";

			/** 协议字段 proposalId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly proposalId: Ref;

			/** 协议字段 commandOrdinal；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commandOrdinal: Counter;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "AwaitingChild";

			/** 协议字段 childId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly childId: Ref;

			/** 协议字段 commandOrdinal；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commandOrdinal: Counter;
	  };

/** FE-CON-1 的 PlannedRunState 数据结构。 */
export interface PlannedRunState extends Omit<NextRunState, "position"> {
	/** 协议字段 position；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly position: PlannedPosition;
}

/** Resolver内部计划；命令下标由Factory转换为稳定身份。 */
export interface TransitionPlan {
	/** 协议字段 next；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly next: PlannedRunState;

	/** 协议字段 commands；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly commands: readonly CommandPayload[];
}

/** FE-CON-1 的 AdvanceDecision 数据结构。 */
export interface AdvanceDecision {
	/** 协议字段 decisionId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly decisionId: Ref;

	/** 协议字段 decisionDigest；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly decisionDigest: Digest;

	/** 协议字段 inputDigest；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly inputDigest: Digest;

	/** 协议字段 runId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly runId: Ref;

	/** 协议字段 attemptId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly attemptId: Ref;

	/** 协议字段 expectedVersion；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly expectedVersion: Counter;

	/** 协议字段 expectedCancelEpoch；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly expectedCancelEpoch: Counter;

	/** 协议字段 consumedEventId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly consumedEventId: Ref;

	/** 协议字段 consumedSequence；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly consumedSequence: Counter;

	/** 协议字段 next；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly next: NextRunState;

	/** 协议字段 commands；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly commands: readonly EngineCommand[];
}

/** FE-CON-1 的 AdvanceResult 数据结构。 */
export type AdvanceResult =
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "advance";

			/** 协议字段 decision；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly decision: AdvanceDecision;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "ignore";

			/** 协议字段 reason；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly reason: "duplicate" | "terminal";

			/** 协议字段 existingCommitId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly existingCommitId: Ref | null;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "reject";

			/** 协议字段 error；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly error: FlowError;
	  };

/** 唯一纯推进端口；返回意图，不提交或派发。 */
export interface FlowAdvancePort {
	/** 执行 advance 协议操作；结果与错误分支按返回类型处理。 */
	advance(input: AdvanceInput): AdvanceResult;
}

/** FE-CON-1 的 ExecutionClaim 数据结构。 */
export interface ExecutionClaim {
	/** 协议字段 ownerId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly ownerId: Ref;

	/** 协议字段 attemptId；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly attemptId: Ref;

	/** 协议字段 fence；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly fence: Counter;

	/** 协议字段 expiresAtMs；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly expiresAtMs: Millis;
}

/** FE-CON-1 的 CommitRequest 数据结构。 */
export interface CommitRequest {
	/** 协议字段 input；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly input: AdvanceInput;

	/** 协议字段 decision；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly decision: AdvanceDecision;

	/** 协议字段 claim；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly claim: ExecutionClaim;
}

/** FE-CON-1 的 CommitResult 数据结构。 */
export type CommitResult =
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "committed";

			/** 协议字段 commitId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commitId: Ref;

			/** 协议字段 runVersion；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly runVersion: Counter;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "conflict";

			/** 协议字段 actualVersion；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly actualVersion: Counter;

			/** 协议字段 reason；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly reason: "version" | "cancel" | "claim";
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "rejected";

			/** 协议字段 code；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly code: "INVALID_DECISION" | "IDEMPOTENCY_CONFLICT" | "EVENT_MISMATCH";
	  };

/** FE-CON-1 的 CommitQuery 数据结构。 */
export type CommitQuery =
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "committed";

			/** 协议字段 commitId；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly commitId: Ref;

			/** 协议字段 runVersion；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly runVersion: Counter;
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "absent";
	  }
	| {
			/** 协议字段 kind；必填，取值及空值语义遵循 FE-CON-1。 */
			readonly kind: "gone";
	  };

/** FE-CON-1 的 CommandStatus 数据结构。 */
export type CommandStatus = "PENDING" | "CLAIMED" | "ACCEPTED" | "SUCCEEDED" | "FAILED" | "UNKNOWN" | "CANCELLED";

/** FE-CON-1 的 CommandRecord 数据结构。 */
export interface CommandRecord {
	/** 协议字段 command；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly command: EngineCommand;

	/** 协议字段 payloadDigest；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly payloadDigest: Digest;

	/** 协议字段 status；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly status: CommandStatus;

	/** 协议字段 dispatchClaim；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly dispatchClaim: ExecutionClaim | null;

	/** 协议字段 providerReceiptRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly providerReceiptRef: Ref | null;

	/** 协议字段 resultRef；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly resultRef: ArtifactRef | null;

	/** 协议字段 effect；必填，取值及空值语义遵循 FE-CON-1。 */
	readonly effect: Effect;
}

/** RunRegistry权威事务门面；传输失败不得伪装为absent。 */
export interface StateCommitPort {
	/** 执行 commit 协议操作；结果与错误分支按返回类型处理。 */
	commit(request: CommitRequest): Promise<CommitResult>;

	/** 执行 queryCommit 协议操作；结果与错误分支按返回类型处理。 */
	queryCommit(runId: Ref, commitId: Ref): Promise<CommitQuery>;

	/** 执行 queryCommand 协议操作；结果与错误分支按返回类型处理。 */
	queryCommand(runId: Ref, commandId: Ref): Promise<CommandRecord | null>;
}
