import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { RuntimeConfigurationError, type RuntimeSettings } from "../../config/index.ts";
import type { AgentAdapter, TimePort } from "../../contracts/index.ts";
import { PiAgentAdapter } from "./pi-agent-adapter.ts";

/** Pi 私有装配工厂；仅返回规范化 AgentAdapter，模型 SDK 类型不进入应用入口。 */
export function createPiAdapter(settings: RuntimeSettings, timePort: TimePort): AgentAdapter {
	let adapter: PiAgentAdapter;
	const selection = settings.config.model;
	const scenario = settings.config.runtime.fauxScenario;

	if (selection.source === "faux") {
		const faux = fauxProvider({
			api: `${selection.providerId}-api`,
			provider: selection.providerId,
			models: [{ id: selection.modelId }],
			tokenSize: { min: scenario.tokenSizeMin, max: scenario.tokenSizeMax },
		});
		faux.setResponses([
			fauxAssistantMessage(
				[
					fauxText(scenario.beforeReadText),
					fauxToolCall("lawclaw_read_text", { path: scenario.readPath }, { id: crypto.randomUUID() }),
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(
				[
					fauxText(scenario.beforeDelegationText),
					fauxToolCall("lawclaw_delegate", { task: scenario.delegationTask }, { id: crypto.randomUUID() }),
				],
				{ stopReason: "toolUse" },
			),
			fauxAssistantMessage(scenario.finalResponse),
		]);
		const models = createModels();
		models.setProvider(faux.provider);
		adapter = new PiAgentAdapter(
			faux.getModel(),
			models.streamSimple.bind(models),
			settings.config.kernel.piAdapter,
			timePort,
		);
	} else {
		const models = builtinModels();
		const model = models.getModel(selection.providerId, selection.modelId);
		if (!model) {
			throw new RuntimeConfigurationError(`模型目录中不存在配置项 ${selection.providerId}/${selection.modelId}。`);
		}
		adapter = new PiAgentAdapter(model, models.streamSimple.bind(models), settings.config.kernel.piAdapter, timePort);
	}

	return adapter;
}
