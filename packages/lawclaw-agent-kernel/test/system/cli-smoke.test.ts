import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";

test("[AK-CLI-001] Pi CLI 离线启动并加载内部 LawClaw 扩展命令", () => {
	const result = spawnSync(process.execPath, [path.resolve(import.meta.dirname, "../../scripts/pi-cli-smoke.mjs")], {
		encoding: "utf8",
		timeout: 50_000,
		maxBuffer: 1024 * 1024,
	});
	assert.equal(result.status, 0, result.stdout + result.stderr);
	assert.match(result.stdout, /冒烟通过/u);
});
