# 执行控制

## 职责

FlowEngine在flow-engine组件目录中仅处理四态、Activity与任务图；RunRegistry在run-registry组件目录中维护AgentRun。其余业务宿主的归属确认见[组件映射](../component-layout.md)。AgentSystem实现进程内 `SessionQueryPort.lookup(logicalKey)` 与 `SessionCommandPort.ensure(SessionCreationIntent)`：lookup只读，ensure返回确认后的 `SessionAnchor/created`，`run` 不创建缺失Session。Session只保存当前Run绑定，不保存Run历史集合。

## 边界与非职责

不持有Pi原生对象，不直接访问SQLite或执行Sandbox/Provider。FlowScheduler通过耐久端口重新发现Run；FlowDriver推进已提交事件，FlowCommandDispatcher管理派发与恢复策略。

## 接口、依赖与生命周期

通过 AgentAdapter、ContextEnginePort、DelegationPort、ToolCoordinatorPort 与 ToolRuntimePort 调用。既有Loop的内存状态由AgentRun维护；耐久业务宿主通过AgentRunStore访问快照、命令和事件。两种入口共用ContextEngine、Pi Adapter与PDP/PEP。

## 文件与子目录

- [agent-loop.ts](agent-loop.ts)
- [agent-run.ts](run-registry/agent-run.ts)
- [session-manager](session-manager/README.md)
- [agent-system.ts](agent-system.ts)
- [context-engine.ts](context-engine/context-engine.ts)
- [delegation-engine.ts](delegation-engine.ts)
- [index.ts](index.ts)
- [permission-scope.ts](permission-scope.ts)
- [run-flow.ts](run-flow.ts)
- [run-registry.ts](run-registry/run-registry.ts)
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

- [flow-engine](flow-engine/README.md)：通用系统执行框架。
- [react-flow](react-flow/README.md)：ReAct业务状态策略。
- [react-flow-host.ts](react-flow-host.ts)：业务宿主与系统Activity桥接。
- [variant-matcher.ts](variant-matcher.ts)：穷尽策略分派。

## 设计依据

[对应设计](../../docs/design/layers/l1-control/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
