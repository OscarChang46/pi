import { loadRuntimeSettings, resolveConfiguredPath } from "../config/index.ts";
import { createAgentKernel, createRequestContext, createRunCommand } from "./composition-root.ts";

const settings = loadRuntimeSettings();
const workspaceRoot = resolveConfiguredPath(settings, settings.config.runtime.workspaceRoot);
const kernel = await createAgentKernel(workspaceRoot, settings);
const result = await kernel.run(createRequestContext(settings), createRunCommand(workspaceRoot, settings));

if (result.status !== "completed") {
	throw new Error(`Pi Agent Kernel 运行未完成，终态为 ${result.status}。`);
}

console.log(
	JSON.stringify(
		{
			status: result.status,
			output: result.output,
			turns: result.turns,
			toolCalls: result.toolCalls,
			eventTypes: result.events.map((event) => event.type),
			context: {
				estimatedTokens: result.lastFrame.estimatedTokens,
				selectedItemIds: result.lastFrame.reductionTrace.selectedItemIds,
			},
		},
		null,
		2,
	),
);
