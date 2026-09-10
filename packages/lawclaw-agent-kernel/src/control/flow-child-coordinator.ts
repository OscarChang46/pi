import type { AgentRunStore } from "../contracts/control/run-registry/run-storage.ts";
import type { FlowArtifactStore } from "../contracts/flow-artifacts.ts";
import type { FlowCommandHandler } from "../contracts/flow-dispatch.ts";
import type { AdvanceInput } from "../contracts/flow-engine.ts";
import { flowId } from "../contracts/flow-value.ts";
import type { KernelToolCallBlock, TimePort } from "../contracts/index.ts";
import { FLOW_COMMAND_STATUS, isTerminalReActState, REACT_FLOW_STATE } from "../contracts/react-flow-values.ts";
import type { FlowContext } from "./flow-context.ts";

/** 子Run持久化与调度依赖，父子共享受信任作用域。 */
export interface FlowChildDependencies {
	/** 通过 SessionManager 占槽后受理，禁止绕过绑定。 */
	readonly admit: (input: AdvanceInput, parent: AdvanceInput) => void;
	/** Run权威存储。 */
	readonly store: AgentRunStore;
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
			const child = await frames.initial(
				{
					runId: childId,
					goal: call.arguments.task,
					nowMs: time.now().epochMilliseconds,
					deadlineAtMs: spec.deadlineAtMs,
					budget: spec.budget,
					depth: input.run.depth + 1,
				},
				signal,
			);
			deps.admit(child, input);
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
						role: "task_observation",
						childId,
						childRunId: childId,
						outcome: FLOW_COMMAND_STATUS.SUCCEEDED,
						resultRef: child.run.position.outputRef,
						errorRef: null,
						text: artifacts.get(child.run.position.outputRef),
					})
				: child.run.position.kind === REACT_FLOW_STATE.FAILED
					? artifacts.put({
							role: "task_observation",
							childId,
							childRunId: childId,
							outcome: FLOW_COMMAND_STATUS.FAILED,
							resultRef: null,
							errorRef: flowId("child-error", { childId, code: child.run.position.code }),
							text: `Child 执行失败：${child.run.position.code}`,
						})
					: null;
		return {
			source: "child",
			payload: {
				kind: "ChildCompleted",
				childId,
				outcome:
					child.run.position.kind === REACT_FLOW_STATE.COMPLETED
						? "completed"
						: child.run.position.kind === REACT_FLOW_STATE.CANCELLED
							? "cancelled"
							: "failed",
				resultRef,
			},
		};
	};
}
