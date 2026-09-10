import type { FlowExecutionContext } from "../../contracts/control/flow-engine/flow-engine-contract.ts";
import { FLOW_GRAPH_ROUTE } from "../../contracts/control/flow-engine/flow-engine-values.ts";
import type {
	FlowGraphDefinition,
	FlowGraphNode,
	FlowGraphResult,
} from "../../contracts/control/flow-engine/flow-graph.ts";
import { flowDigest } from "../../contracts/flow-value.ts";

/** 有向图执行器；允许环，通过业务出口和声明上限控制终止。 */
export class TaskGraph {
	readonly #definition: FlowGraphDefinition;
	readonly #nodes: ReadonlyMap<string, FlowGraphNode>;
	readonly #digest: string;
	/** 冻结定义并检查引用及出口可达性，不执行DAG校验。 */
	constructor(definition: FlowGraphDefinition) {
		validateGraph(definition);
		const nodes = definition.nodes.map((node) => Object.freeze({ ...node, next: Object.freeze([...node.next]) }));
		this.#definition = Object.freeze({ ...definition, nodes: Object.freeze(nodes) });
		this.#nodes = new Map(nodes.map((node) => [node.id, node]));
		this.#digest = flowDigest({ ...definition, nodes: nodes.map(({ execute: _execute, ...metadata }) => metadata) });
	}
	/** 从入口重放节点检查点；每次访问的Activity获得独立命名空间。 */
	async execute(context: FlowExecutionContext, input: unknown): Promise<unknown> {
		const binding = flowDigest({ graph: this.#digest, input });
		const prior = await context.checkpoint("graph/binding", async () => binding);
		if (prior !== binding) throw new Error("FLOW_GRAPH_DEFINITION_CONFLICT");
		let nodeId = this.#definition.entry;
		let data = input;
		const visits = new Map<string, number>();
		for (let visit = 1; visit <= this.#definition.maxVisits; visit++) {
			const node = this.#nodes.get(nodeId);
			if (!node) throw new Error("FLOW_GRAPH_TARGET_INVALID");
			const count = (visits.get(nodeId) ?? 0) + 1;
			if (count > node.maxVisits) throw new Error("FLOW_GRAPH_VISIT_LIMIT");
			visits.set(nodeId, count);
			const scoped = visitContext(context, `graph/${visit}/${nodeId}`);
			const result = await scoped.checkpoint("result", async () =>
				validateRoute(node, await node.execute(scoped, data)),
			);
			const route = validateRoute(node, result);
			if (route.kind === FLOW_GRAPH_ROUTE.EXIT) return route.result;
			nodeId = route.target;
			data = route.data;
		}
		throw new Error("FLOW_GRAPH_VISIT_LIMIT");
	}
}

function validateGraph(graph: FlowGraphDefinition): void {
	if (!validId(graph.id) || !validId(graph.version) || !positive(graph.maxVisits) || graph.nodes.length === 0)
		throw new Error("FLOW_GRAPH_INVALID");
	const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
	if (nodes.size !== graph.nodes.length || !nodes.has(graph.entry)) throw new Error("FLOW_GRAPH_INVALID");
	for (const node of nodes.values()) {
		if (
			!validId(node.id) ||
			!validId(node.version) ||
			!positive(node.maxVisits) ||
			new Set(node.next).size !== node.next.length
		)
			throw new Error("FLOW_GRAPH_INVALID");
		if (node.next.some((target) => !nodes.has(target))) throw new Error("FLOW_GRAPH_TARGET_INVALID");
	}
	// 反向闭包允许环，但每个节点都必须存在通向某个显式出口的路径。
	const exits = new Set(graph.nodes.filter((node) => node.canExit).map((node) => node.id));
	let changed = true;
	while (changed) {
		changed = false;
		for (const node of nodes.values()) {
			if (!exits.has(node.id) && node.next.some((target) => exits.has(target))) {
				exits.add(node.id);
				changed = true;
			}
		}
	}
	if (exits.size !== nodes.size) throw new Error("FLOW_GRAPH_EXIT_UNREACHABLE");
}

function positive(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}
function validId(value: string): boolean {
	return typeof value === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(value);
}

function validateRoute(node: FlowGraphNode, value: unknown): FlowGraphResult {
	if (typeof value !== "object" || value === null) throw new Error("FLOW_GRAPH_ROUTE_INVALID");
	if ("kind" in value && value.kind === FLOW_GRAPH_ROUTE.EXIT && "result" in value && node.canExit)
		return { kind: FLOW_GRAPH_ROUTE.EXIT, result: value.result };
	if (
		"kind" in value &&
		value.kind === FLOW_GRAPH_ROUTE.NEXT &&
		"target" in value &&
		typeof value.target === "string" &&
		"data" in value &&
		node.next.includes(value.target)
	)
		return { kind: FLOW_GRAPH_ROUTE.NEXT, target: value.target, data: value.data };
	throw new Error("FLOW_GRAPH_ROUTE_INVALID");
}

function visitContext(context: FlowExecutionContext, prefix: string): FlowExecutionContext {
	return {
		activity: (activity, execute) => context.activity({ ...activity, key: `${prefix}/${activity.key}` }, execute),
		checkpoint: (key, execute) => context.checkpoint(`${prefix}/${key}`, execute),
		yield: context.yield,
	};
}
