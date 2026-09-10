# 架构层与组件目录映射

源码以架构层目录承载组件，组件内部再区分实现和适配：L1=`control`，L2=`cognitive`，L3=`tools`，L4=`execution`。`security`、`infrastructure`、`observability`为横切平面，`application`为装配入口。公共契约使用`contracts/<层>/<组件>/`，不允许契约反向依赖实现。

## 本次已确认归属

| 设计 | 实现目录 | 契约/适配目录 |
| --- | --- | --- |
| [FlowEngine](../docs/design/layers/l1-control/components/flow-engine/README.md) / SR-01～03 | control/flow-engine | contracts/control/flow-engine；infrastructure/state-storage/adapters/flow-engine |
| [RunRegistry](../docs/design/layers/l1-control/components/run-registry.md) / L1-CMP-006 | control/run-registry | contracts/control/run-registry；infrastructure/state-storage/adapters/run-registry |
| [SessionManager](../docs/design/layers/l1-control/components/session-manager.md) / L1-CMP-005 | control/session-manager | contracts/control/session-manager；infrastructure/state-storage/adapters/session-manager |
| [StateStorage](../docs/design/layers/infrastructure-plane/components/state-storage.md) / INF-CMP-001 | infrastructure/state-storage | 按被适配组件分别维护子目录 |

FE常量文件为`flow-engine-values.ts`，状态表为`flow-engine-transitions.ts`，公共协议为`flow-engine-contract.ts`；不再与旧ReAct业务契约使用同一名称。`AgentRunStore`、`RunStorageRules`、`SqliteRunRepository`及其协作者明确表示AgentRun存储。

## 待用户确认的组件归属

`control/react-flow/*`、`react-flow-host.ts`、`flow-driver.ts`、`flow-command-dispatcher.ts`、`flow-child-coordinator.ts`及业务执行回调，仍需确认Agent执行宿主组件归属。FE明确排除业务规则；L2 AgentRuntime开发设计明确只执行模型步骤、不拥有ReAct迁移；RunScheduler也不拥有业务步骤顺序。不能仅按名称把它们塞进这三个组件。

关联的`contracts/flow-engine.ts`仍是旧业务契约，不是通用FE协议；它混合业务策略输入和状态提交数据，须随上述决定拆分。当前保留原路径，不声明全仓组件化已完成，也不新增SubagentCoordinator或跨flowRun Fork/Join。
