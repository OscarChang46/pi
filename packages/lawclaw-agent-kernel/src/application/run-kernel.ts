import { loadRuntimeSettings, resolveConfiguredPath } from "../config/index.ts";
import {
	createAgentKernel,
	createRequestContext,
	createRootSessionCommand,
	createRunCommand,
} from "./composition-root.ts";

const settings = loadRuntimeSettings();
const workspaceRoot = resolveConfiguredPath(settings, settings.config.runtime.workspaceRoot);
const kernel = await createAgentKernel(workspaceRoot, settings);
const requestContext = createRequestContext(settings);
const ensured = kernel.ensure(
	requestContext,
	createRootSessionCommand({
		logicalKey: `logical-session:${crypto.randomUUID()}`,
		agentDefinitionRef: kernel.agentId,
		contextPolicyRef: settings.config.prompts.agentSystemPromptId,
	}),
);
const command = createRunCommand({ sessionId: ensured.anchor.sessionId, workspaceRoot }, settings);
const result = await kernel.run(requestContext, command);

if (result.status !== "completed" || !result.lastCandidate) {
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
				estimatedTokens: result.lastCandidate.tokenAccounting.inputTokens,
				selectedItemIds: result.lastCandidate.payload.materials.map((item) => item.sourceRef),
			},
		},
		null,
		2,
	),
);
