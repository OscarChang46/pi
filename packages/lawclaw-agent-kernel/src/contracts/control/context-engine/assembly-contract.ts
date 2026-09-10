/** 上下文组装契约显式导出入口，字段定义按职责分文件维护。 */
export type {
	AssemblyAlgorithm,
	AssemblyAlgorithmInput,
	ContextEstimatorPort,
	HistorySelectionRecord,
	RecentHistorySelectorPort,
	Selection,
	SelectionDecision,
	SelectionEstimate,
} from "./assembly-algorithm.ts";
export type {
	AssemblyBasis,
	AssemblyLimits,
	ExpectedChildObservation,
	MaterialSource,
	MemoryAssemblySource,
	ParentContextSliceSpec,
	Requirement,
	RunAssemblyInput,
	SessionAnchor,
	SessionCreationIntent,
	SessionInput,
} from "./assembly-basis.ts";
export type {
	AssemblyCandidate,
	AssemblyTrace,
	ContextPayload,
	PayloadLocation,
	TokenAccounting,
	ToolCallProjection,
	TraceRecord,
} from "./assembly-candidate.ts";
export type {
	CausalUnit,
	ContextBlock,
	ContextMessage,
	DependencyEdge,
	MaterialProjection,
	MemoryProjection,
	ResolvedSourceContent,
	SourceIdentity,
	SourceOrderKey,
	SourceRecord,
	ToolCallBinding,
	ToolCallIdentity,
} from "./assembly-messages.ts";
export type {
	ContextArtifactReader,
	SourceReadBinding,
	SourceReader,
	SourceReadRequest,
	SourceReadResult,
} from "./source-reader.ts";
