import { createHash } from "node:crypto";
import type { JsonValue, ToolDescriptor } from "./types.ts";

function canonicalize(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
	if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
	const record = value as Readonly<Record<string, unknown>>;
	return `{${Object.keys(record)
		.sort()
		.filter((key) => record[key] !== undefined)
		.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
		.join(",")}}`;
}

/** 计算规范排序后的 SHA-256 内容摘要；仅用于绑定一致性，不提供签名或身份认证。 */
export function digest(value: unknown): string {
	return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

/** 计算完整工具描述摘要，绑定授权时的名称、版本、参数与风险声明。 */
export function computeToolDescriptorDigest(descriptor: ToolDescriptor): string {
	return digest(descriptor);
}

/** 计算规范化参数摘要；执行前必须与获授权参数一致。 */
export function computeArgumentsDigest(argumentsValue: Readonly<Record<string, JsonValue>>): string {
	return digest(argumentsValue);
}
