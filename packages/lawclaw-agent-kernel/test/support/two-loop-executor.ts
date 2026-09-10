import type { AgentRunResult, RequestContext, StartAgentRunCommand } from "../../src/contracts/index.ts";
import type { AgentLoopLifecyclePort } from "../../src/control/agent-loop.ts";
import type { AgentRunExecutor } from "../../src/control/run-registry/agent-run.ts";
import { testTimePort } from "./test-context.ts";

/** 为 Session/Run 集成测试提供无外部副作用的确定性执行器。 */
export class TwoLoopExecutor implements AgentRunExecutor {
	async run(
		_context: RequestContext,
		command: StartAgentRunCommand,
		_signal?: AbortSignal,
		lifecycle?: AgentLoopLifecyclePort,
	): Promise<AgentRunResult> {
		for (const ordinal of [1, 2]) {
			lifecycle?.loopStarted(ordinal, testTimePort.now().isoUtc);
			lifecycle?.loopFinished(ordinal, "COMPLETED", testTimePort.now().isoUtc);
		}
		return {
			runId: command.runId,
			status: "completed",
			output: "ok",
			turns: 2,
			toolCalls: 0,
			events: [],
			lastCandidate: null,
		};
	}
}
