import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { temporaryWorkspace } from "../support/harness.ts";

test("[AK-CTX-301] Pi转换只允许专用适配目录而拒绝核心和近似目录", async (context) => {
	const root = await temporaryWorkspace(context);
	for (const [directory, status] of [
		["infrastructure/adapters/pi-context", 0],
		["infrastructure/adapters/pi-context-other", 1],
		["control/context-engine", 1],
	] as const) {
		const target = path.join(root, directory);
		await mkdir(target, { recursive: true });
		const file = path.join(target, "adapter.ts");
		await writeFile(file, 'import { convertToLlm } from "@earendil-works/pi-coding-agent";');
		const result = spawnSync(
			process.execPath,
			[path.resolve(import.meta.dirname, "../../scripts/check-source-boundaries.mjs"), root],
			{ encoding: "utf8" },
		);
		assert.equal(result.status, status, result.stderr);
		if (status === 1) assert.match(result.stderr, /Pi 原生类型或能力越界/u);
		await rm(file);
	}
});
