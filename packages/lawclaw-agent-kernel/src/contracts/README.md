# 共享契约

## 职责

定义规范化输入输出、窄 Port、授权绑定和值校验。

## 边界与非职责

不导入任何职责实现，不冻结尚未评审的完整 V3.1 协议。

## 接口、依赖与生命周期

types.ts 承载既有模型边界；control.ts、tool-runtime.ts、permissions.ts 分别表达控制、工具与安全接口。type-only 引用仅描述结构，不引入运行时依赖。

## 文件与子目录

- [authorization-digest.ts](authorization-digest.ts)
- [control.ts](control.ts)
- [errors.ts](errors.ts)
- [index.ts](index.ts)
- [kill-switch.ts](kill-switch.ts)
- [permissions.ts](permissions.ts)
- [request-context-guard.ts](request-context-guard.ts)
- [sandbox-digest.ts](sandbox-digest.ts)
- [tool-runtime.ts](tool-runtime.ts)
- [tool-scope.ts](tool-scope.ts)
- [tool-security.ts](tool-security.ts)
- [types.ts](types.ts)

- [flow-artifacts.ts](flow-artifacts.ts)
- [flow-dispatch.ts](flow-dispatch.ts)
- [flow-engine.ts](flow-engine.ts)
- [flow-permits.ts](flow-permits.ts)
- [flow-storage.ts](control/run-registry/run-storage.ts)

- [flow-engine-contract.ts](control/flow-engine/flow-engine-contract.ts)：通用系统四态和日志端口。
- [flow-engine-values.ts](control/flow-engine/flow-engine-values.ts)：系统四态、生命周期动作、日志事件与图路由常量；类型从常量推导。
- [react-flow-values.ts](react-flow-values.ts)：ReAct位置、等待原因、命令状态、副作用与工单状态常量；系统执行框架不依赖此文件。
- [flow-engine-transitions.ts](control/flow-engine/flow-engine-transitions.ts)：共享状态合法性表。
- [flow-graph.ts](control/flow-engine/flow-graph.ts)：允许有向环的节点和路由契约。
- [session-manager-contract.ts](control/session-manager/session-manager-contract.ts)：Session 当前 Run 绑定状态和值对象。
- [flow-value.ts](flow-value.ts)：有界规范JSON与摘要。

flow-engine.ts保留ReAct业务输入和决策类型，不是通用系统状态协议。

## 设计依据

[对应设计](../../docs/design/contracts/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
