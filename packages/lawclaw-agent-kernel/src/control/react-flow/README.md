# ReAct业务状态策略

本目录的ReActFlowPolicy.advance解释AwaitingModel、AwaitingTool、审批和子任务等业务位置，返回纯推进计划。它不定义通用FlowEngine系统状态。

input-schema/input-guard负责输入和因果约束，transition-definition/flow-transitions登记业务迁移，transition-resolver编译并解释迁移，transition-context构造计划，plan-validation/decision-factory验证并冻结结果。规范JSON复用contracts/flow-value.ts；穷尽分派复用control/variant-matcher.ts。

ReActFlowHost通过FlowExecutionContext将耐久业务命令映射为Activity；系统Completed先落盘而业务结果丢失时，Dispatcher直接恢复该结果。权限判断、上下文、模型协议仍由既有业务组件持有。新增业务迁移登记显式定义，无需修改系统四态表。

业务协议的历史定义见[归档](../../../docs/governance/archive/flow-before-system-v1/flow-engine.md)，当前框架见[FlowEngine设计](../../../docs/design/layers/l1-control/components/flow-engine.md)。业务单元/契约测试为AK-FE-001～018，耐久集成为AK-FE-019～029；系统框架用例独立编号AK-FS。
