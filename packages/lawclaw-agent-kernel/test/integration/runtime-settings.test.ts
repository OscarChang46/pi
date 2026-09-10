import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
	createAgentKernel,
	createRequestContext,
	createRootSessionCommand,
	createRunCommand,
} from "../../src/application/composition-root.ts";
import {
	loadRuntimeSettings,
	RuntimeConfigurationError,
	resolveConfiguredPath,
	resolveRuntimeConfigFile,
} from "../../src/config/index.ts";

const defaultConfigFile = resolveRuntimeConfigFile({});
const defaultConfigText = await fs.readFile(defaultConfigFile, "utf8");
const defaultPromptsText = await fs.readFile(path.join(path.dirname(defaultConfigFile), "prompts.zh-CN.yaml"), "utf8");

async function temporaryConfiguration(
	configText: string,
	promptsText: string = defaultPromptsText,
): Promise<{ readonly directory: string; readonly configFile: string }> {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lawclaw-config-test-"));
	const configFile = path.join(directory, "runtime.yaml");
	await fs.writeFile(configFile, configText, "utf8");
	await fs.writeFile(path.join(directory, "prompts.zh-CN.yaml"), promptsText, "utf8");
	return { directory, configFile };
}

test("[AK-CFG-001] 全部运行参数可从严格配置加载并用于 Faux 纵切", async (context) => {
	const actualWorkspace = path.resolve(path.dirname(defaultConfigFile), "../sample-workspace");
	const customized = defaultConfigText
		.replace("providerId: lawclaw-faux", "providerId: configurable-faux")
		.replace("modelId: lawclaw-faux-model", "modelId: configurable-model")
		.replace("tenantId: runtime-tenant", "tenantId: configured-tenant")
		.replace("workspaceRoot: ../sample-workspace", `workspaceRoot: ${JSON.stringify(actualWorkspace)}`)
		.replace("finalResponse: Agent Run 完成", "finalResponse: 配置化 Agent Run 完成");
	const fixture = await temporaryConfiguration(customized);
	context.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));

	const settings = loadRuntimeSettings(fixture.configFile);
	assert.equal(settings.config.model.providerId, "configurable-faux");
	assert.equal(settings.config.cli.requestContext.tenantId, "configured-tenant");
	assert.equal(settings.config.cli.requestContext.timeZone, "Asia/Shanghai");
	assert.equal(settings.config.tools.readOnly.maxSearchFiles, 300);
	assert.equal(settings.config.kernel.piAdapter.maxRetries, 0);

	const workspace = resolveConfiguredPath(settings, settings.config.runtime.workspaceRoot);
	const kernel = await createAgentKernel(workspace, settings);
	const requestContext = createRequestContext(settings);
	const session = kernel.ensure(
		requestContext,
		createRootSessionCommand({
			logicalKey: "logical:configured",
			agentDefinitionRef: kernel.agentId,
			contextPolicyRef: settings.config.prompts.agentSystemPromptId,
		}),
	);
	const command = createRunCommand({ sessionId: session.anchor.sessionId, workspaceRoot: workspace }, settings);
	const result = await kernel.run(requestContext, command);
	assert.equal(command.sessionId, session.anchor.sessionId);
	assert.equal(result.status, "completed");
	assert.match(result.output, /配置化 Agent Run 完成/u);
});

test("[AK-CFG-005] builtin 模型不存在时在模型调用前失败", async (context) => {
	const customized = defaultConfigText
		.replace("source: faux", "source: builtin")
		.replace("providerId: lawclaw-faux", "providerId: provider-does-not-exist")
		.replace("modelId: lawclaw-faux-model", "modelId: model-does-not-exist");
	const fixture = await temporaryConfiguration(customized);
	context.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));
	const settings = loadRuntimeSettings(fixture.configFile);
	const workspace = resolveConfiguredPath(settings, settings.config.runtime.workspaceRoot);
	await assert.rejects(() => createAgentKernel(workspace, settings), RuntimeConfigurationError);
});
