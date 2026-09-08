import type { AdvanceInput, AdvanceResult, FlowAdvancePort } from "../../contracts/flow-engine.ts";
import { freezeDecision } from "../../contracts/flow-value.ts";
import { DecisionFactory } from "./decision-factory.ts";
import { InputGuard } from "./input-guard.ts";
import { TransitionResolver } from "./transition-resolver.ts";

/** FE-CON-1 无状态推进核心；同实例可交错处理多个 Run。 */
export class ReActFlowPolicy implements FlowAdvancePort {
	readonly #guard: InputGuard;
	readonly #resolver: TransitionResolver;
	readonly #factory: DecisionFactory;

	/** 装配无状态规则协作者，允许单独验证短路与决策完整性。 */
	public constructor(guard = new InputGuard(), resolver = new TransitionResolver(), factory = new DecisionFactory()) {
		this.#guard = guard;
		this.#resolver = resolver;
		this.#factory = factory;
	}

	/** 同步返回决策或稳定短路；不提交状态、不执行模型或工具。 */
	public advance(input: AdvanceInput): AdvanceResult {
		const check = this.#guard.check(input);
		if (check.kind === "short_circuit") return freezeDecision(check.result);
		const plan = this.#resolver.resolve(check.input);
		if ("kind" in plan) return freezeDecision(plan);
		return freezeDecision(this.#factory.create(check.input, plan));
	}
}
