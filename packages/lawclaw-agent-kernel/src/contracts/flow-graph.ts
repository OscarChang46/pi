import type { FlowExecutionContext } from "./flow-system.ts";
import type { FLOW_GRAPH_ROUTE } from "./flow-system-values.ts";

/** 节点的业务路由决定；系统状态不包含节点ID。 */
export type FlowGraphResult =
	| {
			/** 显式转向。 */
			readonly kind: typeof FLOW_GRAPH_ROUTE.NEXT;
			/** 声明出边中的目标。 */
			readonly target: string;
			/** 下一节点输入。 */
			readonly data: unknown;
	  }
	| {
			/** 显式业务退出。 */
			readonly kind: typeof FLOW_GRAPH_ROUTE.EXIT;
			/** 图的最终结果。 */
			readonly result: unknown;
	  };

/** 受信任代码注册的图节点。 */
export interface FlowGraphNode {
	/** 静态节点身份，不等于一次访问的身份。 */
	readonly id: string;
	/** 处理器协议版本；代码语义变更时必须升级。 */
	readonly version: string;
	/** 允许的下一节点，允许自环和回边。 */
	readonly next: readonly string[];
	/** 此节点是否声明了业务退出分支。 */
	readonly canExit: boolean;
	/** 此运行中该节点最大访问次数，正安全整数。 */
	readonly maxVisits: number;
	/** 业务判断在此执行；副作用必须经过context.activity。 */
	readonly execute: (context: FlowExecutionContext, input: unknown) => Promise<FlowGraphResult>;
}

/** 允许环、具有显式终止边界的图定义。 */
export interface FlowGraphDefinition {
	/** 图身份。 */
	readonly id: string;
	/** 不可变图版本。 */
	readonly version: string;
	/** 首个节点ID。 */
	readonly entry: string;
	/** 总访问次数上限；防止业务谓词永不成立。 */
	readonly maxVisits: number;
	/** 所有节点及有向出边。 */
	readonly nodes: readonly FlowGraphNode[];
}
