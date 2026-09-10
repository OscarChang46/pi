import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readResumeRecords } from "../../src/clients/kernel-tui/resume-records.ts";

test("[AK-TUI-010] 真实文件仅有bookmark也能恢复且拒绝错误scope", async (context) => {
	const root = await mkdtemp(join(tmpdir(), "kernel-tui-resume-"));
	context.after(() => rm(root, { recursive: true, force: true }));
	const id = "11111111-1111-4111-8111-111111111111";
	const directory = join(root, id);
	await mkdir(directory, { mode: 0o700 });
	const scope = { profileKey: "profile", scopeId: "scope" };
	await writeFile(
		join(directory, "bookmark.json"),
		JSON.stringify({ schemaVersion: 1, ...scope, sessionId: "session", runId: "run" }),
		{ mode: 0o600 },
	);
	const decodePending = (): never => {
		throw new Error("must not decode absent pending");
	};
	const result = await readResumeRecords(root, id, scope, decodePending);
	assert.equal(result.kind, "bookmark");
	assert.equal(result.bookmark?.runId, "run");
	await assert.rejects(readResumeRecords(root, id, { ...scope, scopeId: "other" }, decodePending), /SCOPE_MISMATCH/);
	await symlink(join(directory, "bookmark.json"), join(directory, "pending.json"));
	await assert.rejects(readResumeRecords(root, id, scope, decodePending));
});
