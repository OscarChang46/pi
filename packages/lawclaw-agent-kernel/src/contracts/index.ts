/** 本目录显式导出入口；跨职责调用方应优先依赖 contracts 中的窄端口。 */
export { computeArgumentsDigest, computeToolDescriptorDigest, digest } from "./authorization-digest.ts";
export type { ContextEnginePort, DelegationPort } from "./control.ts";
export type { KernelErrorCode } from "./errors.ts";
export { KernelError } from "./errors.ts";
export type {
	ActiveKillSwitch,
	KillSwitchChange,
	KillSwitchCommand,
	KillSwitchPort,
	KillSwitchScope,
	KillSwitchSnapshot,
	KillSwitchTarget,
} from "./kill-switch.ts";
export type {
	AuthorizationSnapshot,
	AuthorizationSnapshotPort,
	EgressClaim,
	FrozenAgentRunScope,
	GrantValidationPort,
	PermissionApprovalPort,
	PermissionApprovalRequest,
	PermissionCeiling,
	PermissionDecision,
	PermissionDecisionPort,
	PermissionDenialReasonCode,
	PermissionGrant,
	PolicySnapshot,
	PolicySnapshotPort,
	ResourceClaim,
	RevalidationResult,
	SecretClaim,
	ToolBudget,
} from "./permissions.ts";
export { assertRequestContext } from "./request-context-guard.ts";
export { calculateSandboxPlanDigest } from "./sandbox-digest.ts";
export type { AuthorizedToolCall, ToolCoordinatorPort, ToolExecutionPort, ToolRuntimePort } from "./tool-runtime.ts";
export type { ToolExecutionScope } from "./tool-scope.ts";
export type {
	SandboxBudget,
	SandboxCapabilityProfile,
	SandboxEgressGrant,
	SandboxHandle,
	SandboxPort,
	SandboxRequest,
	SandboxResourceGrant,
	SandboxSecretGrant,
	SandboxTerminationReason,
	SandboxTerminationResult,
} from "./tool-security.ts";
export type {
	AgentAdapter,
	AgentEvent,
	AgentExecutionBudget,
	AgentRunResult,
	AgentTurnRequest,
	ContextAssemblyRequest,
	ContextFrame,
	ContextItem,
	ContextReductionTrace,
	DataClassification,
	DelegationPolicy,
	DelegationProviderPort,
	DelegationRequest,
	DelegationResult,
	JsonObjectSchema,
	JsonValue,
	KernelAssistantMessage,
	KernelMessage,
	KernelTextBlock,
	KernelToolCallBlock,
	KernelToolResultMessage,
	KernelUserMessage,
	OperationContext,
	RequestContext,
	RuntimeEventCandidate,
	StartAgentRunCommand,
	TenantContext,
	TimeContext,
	TimePoint,
	TimePort,
	ToolDescriptor,
	ToolInvocation,
	ToolPolicy,
	ToolProviderPort,
	ToolResult,
	ZonedDateTimeView,
} from "./types.ts";
