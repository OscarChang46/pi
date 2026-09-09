import { createHash } from "node:crypto";

/** 按 FE-C14N-1 编码有界 JSON；拒绝非整数、负零、循环、访问器和非法 Unicode。 */
export function canonicalize(value: unknown): string {
	const ancestors = new Set<object>();
	let nodes = 0;
	let bytes = 0;
	function encode(item: unknown, depth: number): string {
		if (++nodes > 100000 || depth > 64) throw new TypeError("FLOW_INPUT_INVALID");
		let result: string;
		if (item === null || typeof item === "boolean") result = String(item);
		else if (typeof item === "number" && Number.isSafeInteger(item) && !Object.is(item, -0)) result = String(item);
		else if (
			typeof item === "string" &&
			!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(item)
		) {
			result = JSON.stringify(item);
		} else if (typeof item === "object" && item !== null) {
			if (ancestors.has(item) || Object.getOwnPropertySymbols(item).length)
				throw new TypeError("FLOW_INPUT_INVALID");
			const prototype = Object.getPrototypeOf(item);
			if (!Array.isArray(item) && prototype !== Object.prototype && prototype !== null)
				throw new TypeError("FLOW_INPUT_INVALID");
			const descriptors = Object.getOwnPropertyDescriptors(item);
			if (Object.values(descriptors).some((d) => !("value" in d))) throw new TypeError("FLOW_INPUT_INVALID");
			ancestors.add(item);
			if (Array.isArray(item)) {
				if (
					Object.keys(item).length !== item.length ||
					Object.getOwnPropertyNames(item).length !== item.length + 1 ||
					item.length > 100000
				)
					throw new TypeError("FLOW_INPUT_INVALID");
				result = `[${Array.from({ length: item.length }, (_, i) => encode(descriptors[String(i)]?.value, depth + 1)).join(",")}]`;
			} else {
				if (Object.values(descriptors).some((d) => !d.enumerable)) throw new TypeError("FLOW_INPUT_INVALID");
				result = `{${Object.keys(descriptors)
					.sort()
					.map((key) => {
						const descriptor = descriptors[key];
						if (!descriptor || !("value" in descriptor)) throw new TypeError("FLOW_INPUT_INVALID");
						return `${encode(key, depth + 1)}:${encode(descriptor.value, depth + 1)}`;
					})
					.join(",")}}`;
			}
			ancestors.delete(item);
			return result;
		} else throw new TypeError("FLOW_INPUT_INVALID");
		bytes += Buffer.byteLength(result);
		if (bytes > 2 * 1024 * 1024) throw new TypeError("FLOW_INPUT_INVALID");
		return result;
	}
	const result = encode(value, 0);
	if (Buffer.byteLength(result) > 2 * 1024 * 1024) throw new TypeError("FLOW_INPUT_INVALID");
	return result;
}

/** 计算协议摘要；摘要只校验内容一致性，不证明授权。 */
export function flowDigest(value: unknown): string {
	return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

/** 生成协议定义的确定性引用。 */
export function flowId(prefix: string, value: unknown): string {
	return `${prefix}:${flowDigest(value).slice(7)}`;
}

/** 冻结已独立复制的决策树；调用方输入不应传入此函数。 */
export function freezeDecision<T>(value: T): T {
	if (typeof value === "object" && value !== null) {
		for (const child of Object.values(value)) freezeDecision(child);
		Object.freeze(value);
	}
	return value;
}
