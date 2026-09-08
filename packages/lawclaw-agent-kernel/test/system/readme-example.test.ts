import assert from "node:assert/strict";
import { test } from "node:test";

// README 示例开始
import {
	createAgentKernel,
	createRequestContext,
	createRunCommand,
	loadRuntimeSettings,
	resolveConfiguredPath,
} from "../../src/index.ts";

const settings = loadRuntimeSettings();
const workspace = resolveConfiguredPath(settings, settings.config.runtime.workspaceRoot);
const kernel = await createAgentKernel(workspace, settings);
const result = await kernel.run(
	createRequestContext(settings),
	createRunCommand(workspace, settings),
	new AbortController().signal,
);
console.log(result.status, result.output);
// README 示例结束

test("[AK-DOC-001] README 公共入口示例可以完成本地 Faux 调用", () => {
	assert.equal(result.status, "completed");
	assert.equal(kernel.getRun(result.runId)?.status, "COMPLETED");
});
