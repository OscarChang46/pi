import type { FlowArtifactStore } from "../contracts/flow-artifacts.ts";
import type { FlowCommandHandler } from "../contracts/flow-dispatch.ts";
import type { DurableFlowStore } from "../contracts/flow-storage.ts";
import type { KernelToolCallBlock, TimePort } from "../contracts/index.ts";
import { isTerminalReActState, REACT_FLOW_STATE } from "../contracts/react-flow-values.ts";
import type { FlowContext } from "./flow-context.ts";

/** 子Run持久化与调度依赖，父子共享受信任作用域。 */
export interface FlowChildDependencies {
	/** Run权威存储。 */
	readonly store: DurableFlowStore;
	/** 目标及结果存储。 */
	readonly artifacts: FlowArtifactStore;
	/** 首轮上下文装配。 */
	readonly frames: FlowContext;
	/** 可信截止时间来源。 */
	readonly time: TimePort;
	/** 驱动独立子Run。 */
	readonly drive: (agentRunId: string) => Promise<void>;
	/** 取消活动子调用。 */
	readonly abort: (agentRunId: string) => void;
}

/** 将已提交的Child身份落实为同存储内独立Run，不使用假委派Provider。 */
export function createFlowChildHandler(deps: FlowChildDependencies): FlowCommandHandler<"CreateChildRun"> {
	const { store, artifacts, frames, time, drive, abort } = deps;
	return async (input, command, signal) => {
		const { childId, spec } = command.payload;
		const call = artifacts.get(spec.goalRef) as KernelToolCallBlock;
		if (call.type !== "tool_call" || call.toolName !== "lawclaw_delegate" || typeof call.arguments.task !== "string")
			throw new Error("FLOW_CHILD_GOAL_INVALID");
		signal.throwIfAborted();
		if (!store.load(childId)) {
			const child = frames.initial({
				runId: childId,
				goal: call.arguments.task,
				nowMs: time.now().epochMilliseconds,
				deadlineAtMs: spec.deadlineAtMs,
				budget: spec.budget,
				depth: input.run.depth + 1,
			});
			store.admit(child, input);
		}
		const cancel = () => {
			store.cancel(childId);
			abort(childId);
		};
		signal.addEventListener("abort", cancel, { once: true });
		try {
			await drive(childId);
		} finally {
			signal.removeEventListener("abort", cancel);
		}
		const child = store.load(childId);
		if (!child || !isTerminalReActState(child.run.position.kind)) return null;
		const resultRef =
			child.run.position.kind === REACT_FLOW_STATE.COMPLETED
				? artifacts.put({
						role: "tool",
						toolCallId: call.toolCallId,
						toolName: call.toolName,
						text: artifacts.get(child.run.position.outputRef),
						isError: false,
					})
				: null;
		return {
			source: "child",
			payload: { kind: "ChildCompleted", childId, outcome: resultRef ? "completed" : "failed", resultRef },
		};
	};
}
