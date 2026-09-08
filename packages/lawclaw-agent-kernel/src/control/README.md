# 执行控制

## 职责

FlowEngine在flow-system中仅处理四态、Activity与任务图；ReActFlowHost适配业务驱动和独立业务持久化。AgentSystem 是既有内存入口；RunRegistry 独立持有 Run，Session 只保存关联 ID。RunFlow 在轮次间推进上下文、工具和委派。

## 边界与非职责

不持有Pi原生对象，不直接访问SQLite或执行Sandbox/Provider。FlowScheduler通过耐久端口重新发现Run；FlowDriver推进已提交事件，FlowCommandDispatcher管理派发与恢复策略。

## 接口、依赖与生命周期

通过 AgentAdapter、ContextEnginePort、DelegationPort、ToolCoordinatorPort 与 ToolRuntimePort 调用。既有Loop的内存状态由AgentRun维护；耐久Flow通过DurableFlowStore访问快照、命令和事件。两种入口共用ContextEngine、Pi Adapter与PDP/PEP。

## 文件与子目录

- [agent-loop.ts](agent-loop.ts)
- [agent-run.ts](agent-run.ts)
- [agent-session.ts](agent-session.ts)
- [agent-system.ts](agent-system.ts)
- [context-engine.ts](context-engine.ts)
- [delegation-engine.ts](delegation-engine.ts)
- [index.ts](index.ts)
- [permission-scope.ts](permission-scope.ts)
- [run-flow.ts](run-flow.ts)
- [run-registry.ts](run-registry.ts)
- [tool-coordinator.ts](tool-coordinator.ts)

- [flow-child-coordinator.ts](flow-child-coordinator.ts)
- [flow-command-dispatcher.ts](flow-command-dispatcher.ts)
- [flow-context.ts](flow-context.ts)
- [flow-driver.ts](flow-driver.ts)
- [flow-events.ts](flow-events.ts)
- [flow-model-executor.ts](flow-model-executor.ts)
- [flow-scheduler.ts](flow-scheduler.ts)
- [flow-tool-executor.ts](flow-tool-executor.ts)
- [delegation-tool-descriptor.ts](delegation-tool-descriptor.ts)：既有Loop与耐久Flow共用的委派契约。

- [flow-system](flow-system/README.md)：通用系统执行框架。
- [react-flow](react-flow/README.md)：ReAct业务状态策略。
- [react-flow-host.ts](react-flow-host.ts)：业务宿主与系统Activity桥接。
- [variant-matcher.ts](variant-matcher.ts)：穷尽策略分派。

## 设计依据

[对应设计](../../docs/design/layers/l1-control/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
