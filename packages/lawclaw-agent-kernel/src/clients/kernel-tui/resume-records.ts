import { constants } from "node:fs";
import { type FileHandle, lstat, open } from "node:fs/promises";
import { join } from "node:path";
import type { TuiBookmark, TuiResumeScope } from "../../contracts/kernel-tui.ts";

const MAX_RECORD_BYTES = 64 * 1024;
const INSTANCE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** pending优先；只有书签也能接回，不根据目录时间猜测用户意图。 */
export type TuiResumeRecords<P> =
	| {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "pending";
			/** 原未决命令，优先查询；绝不自动重发。 */
			readonly pending: P;
			/** 已验证归属的定位书签；不能替代服务查询。 */
			readonly bookmark: TuiBookmark | null;
	  }
	| {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "bookmark";
			/** 已验证归属的定位书签；不能替代服务查询。 */
			readonly bookmark: TuiBookmark;
	  };

/** 只读指定实例；decodePending复用命令协议校验器，不能返回未经校验的载荷。 */
export async function readResumeRecords<P extends TuiResumeScope>(
	root: string,
	instanceId: string,
	scope: TuiResumeScope,
	decodePending: (value: unknown) => P,
): Promise<TuiResumeRecords<P>> {
	if (!INSTANCE_ID.test(instanceId)) throw new Error("TUI_RESUME_ID_INVALID");
	await assertPrivateDirectory(root);
	const directory = join(root, instanceId);
	await assertPrivateDirectory(directory);
	const rawPending = await readRecord(join(directory, "pending.json"));
	const rawBookmark = await readRecord(join(directory, "bookmark.json"));
	const bookmark = rawBookmark === null ? null : decodeBookmark(rawBookmark);
	if (bookmark) assertScope(bookmark, scope);
	if (rawPending !== null) {
		const pending = decodePending(rawPending);
		assertScope(pending, scope);
		return { kind: "pending", pending, bookmark };
	}
	if (bookmark) return { kind: "bookmark", bookmark };
	throw new Error("TUI_RESUME_NOT_FOUND");
}

async function assertPrivateDirectory(path: string): Promise<void> {
	const stat = await lstat(path);
	if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) {
		throw new Error("TUI_RESUME_DIRECTORY_UNSAFE");
	}
}

async function readRecord(path: string): Promise<unknown> {
	let file: FileHandle;
	try {
		file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
		throw error;
	}
	try {
		const stat = await file.stat();
		if (
			!stat.isFile() ||
			stat.size > MAX_RECORD_BYTES ||
			(stat.mode & 0o077) !== 0 ||
			stat.uid !== process.getuid?.()
		) {
			throw new Error("TUI_RESUME_RECORD_UNSAFE");
		}
		const buffer = Buffer.alloc(MAX_RECORD_BYTES + 1);
		const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
		if (bytesRead > MAX_RECORD_BYTES) throw new Error("TUI_RESUME_RECORD_TOO_LARGE");
		const parsed: unknown = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead)),
		);
		if (parsed === null) throw new Error("TUI_RESUME_RECORD_INVALID");
		return parsed;
	} finally {
		await file.close();
	}
}

function decodeBookmark(value: unknown): TuiBookmark {
	if (
		typeof value !== "object" ||
		value === null ||
		!("schemaVersion" in value) ||
		value.schemaVersion !== 1 ||
		!("profileKey" in value) ||
		!isRef(value.profileKey) ||
		!("scopeId" in value) ||
		!isRef(value.scopeId) ||
		!("sessionId" in value) ||
		!(value.sessionId === null || isRef(value.sessionId)) ||
		!("runId" in value) ||
		!(value.runId === null || isRef(value.runId)) ||
		Object.keys(value).length !== 5 ||
		(value.runId !== null && value.sessionId === null)
	) {
		throw new Error("TUI_BOOKMARK_INVALID");
	}
	return {
		schemaVersion: 1,
		profileKey: value.profileKey,
		scopeId: value.scopeId,
		sessionId: value.sessionId,
		runId: value.runId,
	};
}

function isRef(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && Buffer.byteLength(value) <= 128;
}

function assertScope(actual: TuiResumeScope, expected: TuiResumeScope): void {
	if (actual.scopeId !== expected.scopeId || actual.profileKey !== expected.profileKey) {
		throw new Error("TUI_RESUME_SCOPE_MISMATCH");
	}
}
