# FlowEngine系统框架

[FlowEngine](flow-engine.ts)只管理Ready、Running、Yield、Terminate和执行代次，通过[FlowJournal](../../contracts/control/flow-engine/flow-engine-contract.ts)使用追加日志。[ActivityInterceptor](activity-interceptor.ts)执行The Magic：Completed回放、唯一Started授权首次调用、未知结果Yield。

[TaskGraph](task-graph.ts)允许有向环；处理器定义业务出口，图声明总/节点访问上限。每次visit具有独立Activity命名空间，恢复同visit回放历史。它不读取模型、工具、ReAct、Session或资源分配协议。

[SR设计与流程](../../../docs/design/layers/l1-control/components/flow-engine/protocol-index.md)。[系统集成与真实进程故障测试](../../../test/integration/flow-engine.test.ts)。业务ReAct适配在[ReActFlowHost](../react-flow-host.ts)及[业务策略](../react-flow/react-flow-policy.ts)。
