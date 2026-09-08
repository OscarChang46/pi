import type { AdvanceInput } from "../../contracts/flow-engine.ts";
import { isTerminalReActState } from "../../contracts/react-flow-values.ts";
import { FLOW_TRANSITIONS } from "./flow-transitions.ts";
import { reject } from "./input-guard.ts";
import { type Resolution, stateKey, type TransitionDefinition } from "./transition-definition.ts";
import { resolvePrecondition } from "./transition-preconditions.ts";

export type { Resolution } from "./transition-definition.ts";

/** 编译并执行显式状态迁移表；实例只保存不可变定义，不保存Run状态。 */
export class TransitionResolver {
	readonly #table: ReadonlyMap<string, TransitionDefinition>;
	readonly #definitions: readonly TransitionDefinition[];

	/** 装配受信任的代码级迁移定义；重复出边和终态出边均拒绝。 */
	public constructor(definitions: readonly TransitionDefinition[] = FLOW_TRANSITIONS) {
		const table = new Map<string, TransitionDefinition>();
		for (const definition of definitions) {
			const key = `${definition.from}:${definition.on}`;
			if (table.has(key) || isTerminalReActState(definition.from) || definition.targets.length === 0)
				throw new TypeError("FLOW_TRANSITION_DEFINITION_INVALID");
			table.set(key, Object.freeze({ ...definition, targets: Object.freeze([...definition.targets]) }));
		}
		this.#table = table;
		this.#definitions = Object.freeze([...table.values()]);
	}

	/** 暴露只读迁移元数据，供评审、覆盖检查与图生成使用。 */
	public get definitions(): readonly TransitionDefinition[] {
		return this.#definitions;
	}

	/** 执行公共优先级规则，然后按状态和事件查表；未声明边默认拒绝。 */
	public resolve(input: AdvanceInput): Resolution {
		const precondition = resolvePrecondition(input);
		if (precondition !== null) return precondition;
		const transition = this.#table.get(`${stateKey(input.run.position)}:${input.event.payload.kind}`);
		if (!transition) return reject("FLOW_INVALID_TRANSITION", "event.payload.kind");
		const result = transition.execute(input);
		if (!("kind" in result) && !transition.targets.includes(stateKey(result.next.position)))
			return reject("FLOW_INTERNAL_PLAN_INVALID");
		return result;
	}
}
