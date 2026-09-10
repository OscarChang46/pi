# 当前运行装配与设计入口

2026-09-08按当前工作区源码核对。本页只记录实际装配与阅读入口，不批准候选架构，不将已有代码视为全部设计已实现。

## 两条现存运行路径

| 路径 | 源码证据 | 已有机制与边界 |
|---|---|---|
| 单次进程内运行 | [run-kernel](../../src/application/run-kernel.ts) → [composition-root](../../src/application/composition-root.ts) | 装配AgentSystem、内存RunRegistry、RunFlow、ContextEngine、Pi Adapter、只读工具和FakeDelegationProvider |
| 持久Flow服务 | [flow-composition](../../src/application/flow-composition.ts) | 装配AgentRunDatabase、SqliteRunRepository、SqliteFlowJournal、Artifact/Permit适配、FlowContext及ReActFlowHost；分别使用业务库flow.sqlite和系统日志flow-system.sqlite |

[RunRegistry目录说明](../../src/control/run-registry/README.md)明确：内存注册目录与耐久存储仍是两条调用路径，尚未统一。不能把第一条路径的“无持久化”推广到整个Kernel，也不能把第二条路径的本地持久化推广为全部Session、Memory、安全或跨组件协议已经完成。

## 职责与唯一阅读入口

| 内容 | 当前实现入口 | 设计入口 |
|---|---|---|
| Run对象与注册目录 | [RunRegistry](../../src/control/run-registry/README.md) | [RunRegistry设计](../design/layers/l1-control/components/run-registry.md) |
| 系统Flow与Activity | [FlowEngine](../../src/control/flow-engine/README.md) | [FlowEngine设计](../design/layers/l1-control/components/flow-engine/README.md) |
| ReAct业务策略 | [ReAct策略](../../src/control/react-flow/README.md) | [L1层](../design/layers/l1-control/README.md) |
| 上下文准备与组装 | [FlowContext](../../src/control/flow-context.ts)、[ContextEngine](../../src/control/context-engine/context-engine.ts) | [Context设计与评审](../design/layers/l1-control/components/context-engine.md) |
| 模型适配 | [Pi Adapter工厂](../../src/cognitive/adapters/pi-adapter-factory.ts) | [L2层](../design/layers/l2-cognitive/README.md) |
| 业务存储与系统日志 | [SQLite Run仓储](../../src/infrastructure/state-storage/adapters/run-registry/sqlite-run-repository.ts)、[Flow Journal](../../src/infrastructure/state-storage/adapters/flow-engine/sqlite-flow-journal.ts) | [StateStorage](../design/layers/infrastructure-plane/components/state-storage.md) |

父子关系、Session、权限和工具的目标职责以当前层级设计及有效变更为准；本页不复制旧RuntimePool、ResourceManager或独立SubagentCoordinator待实现清单。

## 验证边界

运行命令见[运行说明](pi-kernel-runtime.md)，本地服务操作见[Flow部署说明](../../deploy/flow-local/README.md)，验证证据从[Verification](../verification/README.md)进入。已有报告只证明对应代码、配置及执行环境；目录迁移不证明行为验收完成。

旧说明和跨组件草稿已移至[历史归档](../governance/archive/runtime-before-cleanup-2026-09-08/README.md)，不再作为当前事实或开发规范。
