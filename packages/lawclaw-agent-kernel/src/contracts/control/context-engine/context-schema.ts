import type { ArtifactRef } from "../../flow-engine.ts";
import { canonicalize } from "../../flow-value.ts";
import type { ToolDescriptor } from "../../types.ts";
import type { AssemblyBasis, AssemblyCandidate, ContextPayload, SourceReadResult } from "./assembly-contract.ts";
import { requireContext } from "./context-error.ts";

type Validator = (value: unknown) => void;
const text: Validator = (value) => requireContext(typeof value === "string");
const nonempty: Validator = (value) => requireContext(typeof value === "string" && value.trim().length > 0);
const ref: Validator = (value) => requireContext(typeof value === "string" && /^[\x21-\x7e]{1,128}$/.test(value));
const count: Validator = (value) =>
	requireContext(typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
const positive: Validator = (value) => {
	count(value);
	requireContext(typeof value === "number" && value > 0);
};
const bool: Validator = (value) => requireContext(typeof value === "boolean");
function literal(...values: readonly unknown[]): Validator {
	return (value) => requireContext(values.includes(value));
}
function nullable(validate: Validator): Validator {
	return (value) => {
		if (value !== null) validate(value);
	};
}
function array(validate: Validator): Validator {
	return (value) => {
		requireContext(Array.isArray(value));
		for (const item of value) validate(item);
	};
}
function shape(fields: Readonly<Record<string, Validator>>): Validator {
	return (value) => {
		requireContext(typeof value === "object" && value !== null && !Array.isArray(value));
		requireContext(Object.keys(value).length === Object.keys(fields).length);
		for (const [key, validate] of Object.entries(fields)) {
			requireContext(Object.hasOwn(value, key));
			validate(Reflect.get(value, key));
		}
	};
}
function variant(key: string, variants: Readonly<Record<string, Validator>>): Validator {
	return (value) => {
		requireContext(typeof value === "object" && value !== null);
		const tag: unknown = Reflect.get(value, key);
		requireContext(typeof tag === "string" && Object.hasOwn(variants, tag));
		variants[tag]!(value);
	};
}
const jsonObject: Validator = (value) => {
	requireContext(typeof value === "object" && value !== null && !Array.isArray(value));
	canonicalize(value);
};
const artifact = shape({ id: ref, digest: ref, bytes: count });
const anchor = shape({ sessionId: ref, version: count, headRef: ref });
const requirement = shape({
	reason: literal("system_constraint", "current_task", "task_input", "causal_dependency"),
	declaredByRef: ref,
	memberRefs: array(ref),
});
const material = shape({
	sourceRef: ref,
	version: count,
	contentRef: artifact,
	priority: count,
	requirement: nullable(requirement),
});
const memory = shape({
	source: shape({
		spaceId: ref,
		spaceVersion: count,
		queryRef: artifact,
		indexVersion: ref,
		algorithmVersion: ref,
		epoch: count,
		required: bool,
	}),
	viewRef: artifact,
});
const identity = shape({ originAgentRunId: ref, modelCommandId: ref, callId: ref });
const edge = shape({ fromRecordRef: ref, toRecordRef: ref, kind: literal("tool_result_of", "requires") });
const block = variant("type", {
	text: shape({ type: literal("text"), text }),
	tool_call: shape({ type: literal("tool_call"), toolCallId: ref, toolName: ref, arguments: jsonObject }),
	child_task: shape({ type: literal("child_task"), childId: ref, childRunId: ref, task: nonempty }),
});
const message = variant("role", {
	user: shape({ role: literal("user"), text }),
	assistant: shape({
		role: literal("assistant"),
		content: array(block),
		stopReason: literal("stop", "tool_use", "length", "error", "aborted"),
	}),
	tool: shape({ role: literal("tool"), toolCallId: ref, toolName: ref, text, isError: bool }),
	task_observation: shape({
		role: literal("task_observation"),
		childId: ref,
		childRunId: ref,
		outcome: literal("SUCCEEDED", "FAILED"),
		resultRef: nullable(artifact),
		errorRef: nullable(ref),
		text: nonempty,
	}),
});
const sourceIdentity = variant("kind", {
	run_event: shape({ kind: literal("run_event"), originAgentRunId: ref, originEventRef: ref, recordIndex: count }),
	artifact: shape({ kind: literal("artifact"), sourceRef: ref, sourceVersion: count, fragmentRef: ref }),
	memory: shape({ kind: literal("memory"), spaceId: ref, entryId: ref, entryVersion: count }),
});
const record = shape({
	recordRef: ref,
	identity: sourceIdentity,
	contentRef: artifact,
	message: nullable(message),
	orderKey: shape({ sourceOrdinal: count, sequence: count, recordOrdinal: count }),
	callBindings: array(shape({ identity, side: literal("request", "result"), blockOrdinal: nullable(count) })),
	dependencies: array(edge),
});
const content = variant("kind", {
	material: shape({
		kind: literal("material"),
		recordRef: ref,
		value: shape({ sourceRef: ref, version: count, contentRef: artifact, text }),
	}),
	memory: shape({
		kind: literal("memory"),
		recordRef: ref,
		scoreRank: count,
		value: shape({
			spaceId: ref,
			spaceVersion: count,
			entryId: ref,
			entryVersion: count,
			contentRef: artifact,
			text,
		}),
	}),
});
const tool = shape({
	name: ref,
	version: ref,
	description: text,
	risk: literal("read_only", "mutating", "network", "privileged"),
	inputSchema: jsonObject,
	maxResultBytes: positive,
});
const materialProjection = shape({ sourceRef: ref, version: count, contentRef: artifact, text });
const memoryProjection = shape({
	spaceId: ref,
	spaceVersion: count,
	entryId: ref,
	entryVersion: count,
	contentRef: artifact,
	text,
});
const payloadSchema = shape({
	system: text,
	task: text,
	messages: array(message),
	materials: array(materialProjection),
	memory: array(memoryProjection),
	tools: array(tool),
});
const candidateSchema = shape({
	payload: payloadSchema,
	trace: shape({
		records: array(
			shape({
				recordRef: ref,
				identity: sourceIdentity,
				contentRef: artifact,
				orderKey: shape({ sourceOrdinal: count, sequence: count, recordOrdinal: count }),
				output: nullable(shape({ field: literal("messages", "materials", "memory"), index: count })),
			}),
		),
		units: array(shape({ unitRef: ref, memberRefs: array(ref) })),
		dependencies: array(edge),
		decisions: array(
			shape({
				unitRef: ref,
				decision: literal("keep", "drop"),
				reason: literal("required", "dependency", "ranked", "budget"),
			}),
		),
		toolCalls: array(shape({ identity, frameCallId: ref, requestRecordRef: ref, resultRecordRef: ref })),
		degradedSources: array(ref),
	}),
	tokenAccounting: shape({
		inputBytes: count,
		inputTargetTokens: count,
		baseInputTokens: count,
		inheritedTargetTokens: count,
		inputTokens: count,
		estimatedInheritedTokens: count,
		nextEligibleInheritedUnitTokens: nullable(count),
		droppedInheritedTokens: count,
		estimatorVersion: ref,
		modelWindowVersion: ref,
		formatVersion: ref,
		budgetStatus: literal("within_target", "required_over_target"),
	}),
	inputDigest: ref,
	payloadDigest: ref,
	selectionVersion: ref,
	formatVersion: ref,
	modelAdapterVersion: ref,
});

/** 模型边界使用相同封闭载荷Schema，未知字段和角色失败关闭。 */
export function validateContextPayload(value: unknown): asserts value is ContextPayload {
	canonicalize(value);
	payloadSchema(value);
}

/** 完整Artifact解码的字段验证；引用语义由候选解码器继续验证。 */
export function validateCandidateShape(value: unknown): asserts value is AssemblyCandidate {
	canonicalize(value);
	candidateSchema(value);
}
const basisSchema = shape({
	runInput: variant("kind", {
		initial: shape({ kind: literal("initial"), preparationId: ref, plannedRunId: ref }),
		existing: shape({ kind: literal("existing"), runId: ref, sourceRunVersion: count, transcriptHeadRef: ref }),
	}),
	sessionInput: variant("kind", {
		existing: shape({ kind: literal("existing"), anchor }),
		create: shape({
			kind: literal("create"),
			intent: shape({ logicalKey: ref, agentDefinitionRef: ref, contextPolicyRef: ref, parent: nullable(anchor) }),
		}),
		read_only: shape({ kind: literal("read_only"), source: anchor }),
	}),
	systemRef: artifact,
	taskRef: artifact,
	toolsRef: artifact,
	materials: array(material),
	memory: array(memory),
	requirements: array(requirement),
	parentContext: nullable(
		shape({
			parent: anchor,
			selectorRef: ref,
			selectorVersion: ref,
			candidateRefs: array(ref),
			requiredRefs: array(ref),
			maxInheritedTokens: count,
		}),
	),
	expectedChildObservations: array(
		shape({ recordRef: ref, childId: ref, childRunId: ref, outcome: literal("SUCCEEDED", "FAILED") }),
	),
	limits: shape({
		inputTokenLimit: positive,
		modelWindowTokens: positive,
		outputReserveTokens: count,
		estimatorMarginTokens: count,
		maxBytes: positive,
		maxWorkingBytes: positive,
		maxCandidateBytes: positive,
		maxSources: positive,
		maxRecords: positive,
		maxEdges: count,
	}),
	configVersion: ref,
	selectionVersion: ref,
	estimatorVersion: ref,
	modelWindowVersion: ref,
	formatVersion: ref,
	modelAdapterVersion: ref,
	envelopeRef: ref,
	authorizationEpoch: count,
});

/** 校验完整冻结输入及首版单视图、显式父范围约束。 */
export function validateBasis(basis: AssemblyBasis): void {
	canonicalize(basis);
	basisSchema(basis);
	requireContext(basis.memory.length <= 1);
	requireContext(
		basis.limits.outputReserveTokens + basis.limits.estimatorMarginTokens < basis.limits.modelWindowTokens,
	);
	for (const item of [
		...basis.requirements,
		...basis.materials.flatMap((source) => (source.requirement ? [source.requirement] : [])),
	]) {
		requireContext(
			item.memberRefs.length > 0 &&
				item.memberRefs.length <= 256 &&
				new Set(item.memberRefs).size === item.memberRefs.length,
		);
	}
	const parent = basis.parentContext;
	if (parent) {
		requireContext(
			parent.candidateRefs.length <= 256 && new Set(parent.candidateRefs).size === parent.candidateRefs.length,
		);
		requireContext(
			new Set(parent.requiredRefs).size === parent.requiredRefs.length &&
				parent.requiredRefs.every((id) => parent.candidateRefs.includes(id)),
		);
	}
	if (basis.sessionInput.kind === "create")
		requireContext(
			canonicalize(basis.sessionInput.intent.parent) === canonicalize(parent?.parent ?? null),
			"BINDING_MISMATCH",
		);
	if (basis.sessionInput.kind === "read_only")
		requireContext(
			parent && canonicalize(parent.parent) === canonicalize(basis.sessionInput.source),
			"BINDING_MISMATCH",
		);
	requireContext(
		new Set(basis.expectedChildObservations.map((item) => item.recordRef)).size ===
			basis.expectedChildObservations.length,
	);
}

/** reader返回值必须完整；类型断言建立在字段全集及联合验证上。 */
export function validateSourceResult(value: unknown): asserts value is SourceReadResult {
	canonicalize(value);
	shape({ records: array(record), contents: array(content) })(value);
}

/** 解码固定版本文本，失败不转为空字符串。 */
export function decodeContextText(value: unknown): string {
	canonicalize(value);
	shape({ schemaVersion: literal("ctx-text-1"), text })(value);
	requireContext(typeof value === "object" && value !== null);
	const result: unknown = Reflect.get(value, "text");
	requireContext(typeof result === "string");
	return result;
}

/** 解码工具描述，不允许未知顶层字段或重复工具名。 */
export function decodeContextTools(value: unknown): readonly ToolDescriptor[] {
	canonicalize(value);
	shape({ schemaVersion: literal("ctx-tools-1"), tools: array(tool) })(value);
	// 完整字段已按上面的tool Schema验证，保留已有公共ToolDescriptor协议。
	const decoded = value as { tools: readonly ToolDescriptor[] };
	requireContext(new Set(decoded.tools.map((item) => item.name)).size === decoded.tools.length);
	return decoded.tools;
}

/** 冻结Memory视图；字段沿CD-1，排名不代表条目本身的状态。 */
export interface ContextMemoryView {
	/** 协议字段viewId，取值与空值语义遵循CTX-CON-1。 */
	readonly viewId: string;
	/** 协议字段spaceId，取值与空值语义遵循CTX-CON-1。 */
	readonly spaceId: string;
	/** 实现或来源的冻结版本 */
	readonly version: number;
	/** 协议字段epoch，取值与空值语义遵循CTX-CON-1。 */
	readonly epoch: number;
	/** 协议字段indexVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly indexVersion: string;
	/** 协议字段algorithmVersion，取值与空值语义遵循CTX-CON-1。 */
	readonly algorithmVersion: string;
	/** 协议字段queryDigest，取值与空值语义遵循CTX-CON-1。 */
	readonly queryDigest: string;
	/** 协议字段rankedEntries，取值与空值语义遵循CTX-CON-1。 */
	readonly rankedEntries: readonly {
		/** 协议字段entry，取值与空值语义遵循CTX-CON-1。 */
		readonly entry: {
			/** 协议字段entryId，取值与空值语义遵循CTX-CON-1。 */ readonly entryId: string;
			/** 实现或来源的冻结版本 */
			readonly version: number;
			/** 正文Artifact引用，引用本身不授予读取资格 */
			readonly contentRef: ArtifactRef;
			/** 协议字段sourceRef，取值与空值语义遵循CTX-CON-1。 */
			readonly sourceRef: string;
			/** 协议字段sensitivity，取值与空值语义遵循CTX-CON-1。 */
			readonly sensitivity: "public" | "scoped" | "restricted";
			/** 协议字段supersedes，取值与空值语义遵循CTX-CON-1。 */
			readonly supersedes: string | null;
		};
		/** 协议字段scoreRank，取值与空值语义遵循CTX-CON-1。 */
		readonly scoreRank: number;
	}[];
}

/** 校验完整MemoryView，禁止默认过滤非法条目。 */
export function decodeContextMemory(value: unknown): ContextMemoryView {
	canonicalize(value);
	shape({
		viewId: ref,
		spaceId: ref,
		version: count,
		epoch: count,
		indexVersion: ref,
		algorithmVersion: ref,
		queryDigest: ref,
		rankedEntries: array(
			shape({
				entry: shape({
					entryId: ref,
					version: count,
					contentRef: artifact,
					sourceRef: ref,
					sensitivity: literal("public", "scoped", "restricted"),
					supersedes: nullable(ref),
				}),
				scoreRank: count,
			}),
		),
	})(value);
	const view = value as ContextMemoryView;
	requireContext(new Set(view.rankedEntries.map((item) => item.entry.entryId)).size === view.rankedEntries.length);
	return view;
}
