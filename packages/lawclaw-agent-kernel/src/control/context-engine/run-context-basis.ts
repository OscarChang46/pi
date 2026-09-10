import type {
	AssemblyBasis,
	AssemblyLimits,
	MaterialSource,
	RunAssemblyInput,
	SessionInput,
} from "../../contracts/control/context-engine/assembly-basis.ts";
import { KernelError } from "../../contracts/errors.ts";
import type { FlowArtifactStore } from "../../contracts/flow-artifacts.ts";
import { flowId } from "../../contracts/flow-value.ts";
import type { ContextItem, ToolDescriptor } from "../../contracts/types.ts";

/** 宿主将冻结任务转换为唯一 AssemblyBasis，不执行来源读取或预算选择。 */
export function createRunContextBasis(
	artifacts: FlowArtifactStore,
	input: {
		/** 确切准备态或运行态身份。 */ readonly runInput: RunAssemblyInput;
		/** 查询得到的真实锚点或延迟创建意图。 */ readonly sessionInput: SessionInput;
		/** 系统正文。 */ readonly system: string;
		/** 当前用户任务，不重复进入当前 Run 历史。 */ readonly task: string;
		/** 已受权限约束的工具。 */ readonly tools: readonly ToolDescriptor[];
		/** 允许读取的资料片段。 */ readonly items: readonly ContextItem[];
		/** 独立硬容量与软 Token 目标。 */ readonly limits: AssemblyLimits;
		/** 冻结配置版本。 */ readonly configVersion: string;
		/** 当前执行边界。 */ readonly envelopeRef: string;
	},
): AssemblyBasis {
	const materials: MaterialSource[] = input.items.map((item) => {
		if (item.classification === "secret") throw new KernelError("CONTEXT_INVALID", "Secret 不能进入模型上下文。");
		const sourceRef = item.itemId;
		const recordRef = flowId("ctx-rec", { kind: "artifact", sourceRef, sourceVersion: 1, fragmentRef: sourceRef });
		return {
			sourceRef,
			version: 1,
			contentRef: artifacts.put({ schemaVersion: "ctx-text-1", text: item.content }),
			priority: item.priority,
			requirement: item.required
				? { reason: "task_input", declaredByRef: input.envelopeRef, memberRefs: [recordRef] }
				: null,
		};
	});
	return {
		runInput: input.runInput,
		sessionInput: input.sessionInput,
		systemRef: artifacts.put({ schemaVersion: "ctx-text-1", text: input.system }),
		taskRef: artifacts.put({ schemaVersion: "ctx-text-1", text: input.task }),
		toolsRef: artifacts.put({ schemaVersion: "ctx-tools-1", tools: input.tools }),
		materials,
		memory: [],
		requirements: [],
		parentContext: null,
		expectedChildObservations: [],
		limits: input.limits,
		configVersion: input.configVersion,
		selectionVersion: flowId("ctx-alg", { algorithmId: "causal-budget", version: "v1" }),
		estimatorVersion: "pi-estimate-1",
		modelWindowVersion: input.configVersion,
		formatVersion: "ctx-input-1",
		modelAdapterVersion: "pi-context-1",
		envelopeRef: input.envelopeRef,
		authorizationEpoch: 0,
	};
}

/** 宿主共用的有界容量策略；Token 是 Pi 软目标，字节与结构为硬限制。 */
export function runtimeAssemblyLimits(
	maxInputTokens: number,
	outputReserveTokens: number,
	maxBytes: number,
): AssemblyLimits {
	return {
		inputTokenLimit: maxInputTokens,
		modelWindowTokens: maxInputTokens + outputReserveTokens,
		outputReserveTokens,
		estimatorMarginTokens: 0,
		maxBytes,
		maxWorkingBytes: 2 * 1024 * 1024,
		maxCandidateBytes: 2 * 1024 * 1024,
		maxSources: 256,
		maxRecords: 1024,
		maxEdges: 4096,
	};
}
