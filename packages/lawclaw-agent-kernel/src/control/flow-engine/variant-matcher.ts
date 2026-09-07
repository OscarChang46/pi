/** 为封闭的kind联合类型建立穷尽策略表；新增变体必须补处理器。 */
export function createVariantMatcher<Variant extends { kind: string }, Context, Result>(
	handlers: {
		readonly [Kind in Variant["kind"]]: (value: Variant & { kind: Kind }, context: Context) => Result;
	},
): (value: Variant, context: Context) => Result {
	const table = Object.freeze({ ...handlers });
	return (value, context) => {
		if (!Object.hasOwn(table, value.kind)) throw new TypeError("FLOW_VARIANT_UNHANDLED");
		// 索引键来自同一判别字段；类型断言仅弥合TypeScript对相关联合索引的限制。
		const handler = table[value.kind as Variant["kind"]] as (value: Variant, context: Context) => Result;
		return handler(value, context);
	};
}
