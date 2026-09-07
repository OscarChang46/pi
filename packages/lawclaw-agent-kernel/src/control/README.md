# 执行控制

## 职责

AgentSystem 是本地入口；RunRegistry 独立持有 Run，Session 只保存关联 ID。RunFlow 在轮次间推进上下文、工具和委派。

## 边界与非职责

不持有 Pi 原生对象，不直接执行 Sandbox/Provider；不实现持久化 Scheduler。

## 接口、依赖与生命周期

通过 AgentAdapter、ContextEnginePort、DelegationPort、ToolCoordinatorPort 与 ToolRuntimePort 调用。Run 的内存状态由 AgentRun 维护；活动 Session 关联在 finally 释放。

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

## 设计依据

[对应设计](../../docs/design/layers/l1-control/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
