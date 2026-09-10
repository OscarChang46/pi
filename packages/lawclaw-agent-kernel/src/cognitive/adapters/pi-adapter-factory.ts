import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { RuntimeConfigurationError, type RuntimeSettings } from "../../config/index.ts";
import type { AgentAdapter, TimePort } from "../../contracts/index.ts";
import { PiContextAdapter } from "../../infrastructure/adapters/pi-context/pi-context-adapter.ts";
import { PiAgentAdapter } from "./pi-agent-adapter.ts";

/** Pi 私有装配工厂；仅返回规范化 AgentAdapter，模型 SDK 类型不进入应用入口。 */
export function createPiAdapter(settings: RuntimeSettings, timePort: TimePort): AgentAdapter {
	let adapter: PiAgentAdapter;
	const selection = settings.config.model;
	const scenario = settings.config.runtime.fauxScenario;
	const converter = new PiContextAdapter();

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
			(payload) => converter.toModelInput(payload),
		);
	} else {
		const models = builtinModels();
		const model = models.getModel(selection.providerId, selection.modelId);
		if (!model) {
			throw new RuntimeConfigurationError(`模型目录中不存在配置项 ${selection.providerId}/${selection.modelId}。`);
		}
		adapter = new PiAgentAdapter(
			model,
			models.streamSimple.bind(models),
			settings.config.kernel.piAdapter,
			timePort,
			(payload) => converter.toModelInput(payload),
		);
	}

	return adapter;
}

/** Flow模型装配配置；只有此边界解析Pi模型及凭据。 */
export interface ConfiguredFlowModelOptions {
	/** 已有Pi模型配置路径。 */
	readonly modelsPath: string;
	/** 模型目录和认证缓存位置。 */
	readonly dataDirectory: string;
	/** 提供方标识。 */
	readonly providerId: string;
	/** 模型标识。 */
	readonly modelId: string;
	/** 可信时钟。 */
	readonly time: TimePort;
}

/** 复用 Pi 模型配置及认证；单轮 Adapter 只转换已采纳的规范载荷。 */
export async function createConfiguredFlowModel(options: ConfiguredFlowModelOptions): Promise<AgentAdapter> {
	const { modelsPath, dataDirectory, providerId, modelId, time } = options;
	const converter = new PiContextAdapter();
	const runtime = await ModelRuntime.create({
		modelsPath,
		authPath: `${dataDirectory}/model-auth.json`,
		modelsStorePath: `${dataDirectory}/model-catalog.json`,
		allowModelNetwork: false,
	});
	const model = runtime.getModel(providerId, modelId);
	if (!model || !runtime.hasConfiguredAuth(providerId)) throw new Error("FLOW_MODEL_CONFIG_UNAVAILABLE");
	return new PiAgentAdapter(model, runtime.streamSimple.bind(runtime), { maxRetries: 0 }, time, (payload) =>
		converter.toModelInput(payload),
	);
}
