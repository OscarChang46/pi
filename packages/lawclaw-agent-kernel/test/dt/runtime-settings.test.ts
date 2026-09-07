import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { loadRuntimeSettings, RuntimeConfigurationError, resolveRuntimeConfigFile } from "../../src/config/index.ts";

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

test("[AK-CFG-002] 运行配置对未知字段默认拒绝", async (context) => {
	const fixture = await temporaryConfiguration(`${defaultConfigText}\nunexpected: true\n`);
	context.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));
	assert.throws(() => loadRuntimeSettings(fixture.configFile), RuntimeConfigurationError);
});

test("[AK-CFG-003] 启动时校验所有系统提示词引用", async (context) => {
	const fixture = await temporaryConfiguration(
		defaultConfigText,
		`schemaVersion: "1"\nprompts:\n  agent.kernel.system: "仅定义一个提示词"\n`,
	);
	context.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));
	assert.throws(() => loadRuntimeSettings(fixture.configFile), RuntimeConfigurationError);
});

test("[AK-CFG-004] 可配置参数不能突破绝对安全上限", async (context) => {
	const fixture = await temporaryConfiguration(defaultConfigText.replace("maxRetries: 0", "maxRetries: 4"));
	context.after(() => fs.rm(fixture.directory, { recursive: true, force: true }));
	assert.throws(() => loadRuntimeSettings(fixture.configFile), RuntimeConfigurationError);
});
