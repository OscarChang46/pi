# 本地基础设施实现

## 职责

提供时间、授权快照、SQLite耐久Run目录、原子提交、命令记录、Artifact、Adapter私有消息、Permit和对账事件。

## 边界与非职责

不调度Provider。StateStorage相关实现已归入[组件目录](../state-storage/README.md)：AgentRunTransaction固定连接和作用域，SqliteRunCommits管理跨表提交，SqliteRunCommands保存命令生命周期。领域规则与存储入口尚未完成拆分，不将本次目录归类视为职责整改完成。

## 接口、依赖与生命周期

SystemTimeAdapter 是唯一读取系统时钟的实现；FakeDelegationProvider 只用于 Faux 场景，CLI 真正委派另有适配器。

## 文件与子目录

- [fake-delegation-provider.ts](fake-delegation-provider.ts)
- [in-memory-permission-snapshots.ts](in-memory-permission-snapshots.ts)
- [index.ts](index.ts)
- [system-time-adapter.ts](system-time-adapter.ts)

- [agent-run-database.ts](../state-storage/adapters/run-registry/agent-run-database.ts)
- [agent-run-transaction.ts](../state-storage/adapters/run-registry/agent-run-transaction.ts)
- [sqlite-flow-artifacts.ts](sqlite-flow-artifacts.ts)
- [sqlite-run-commands.ts](../state-storage/adapters/run-registry/sqlite-run-commands.ts)
- [sqlite-run-commits.ts](../state-storage/adapters/run-registry/sqlite-run-commits.ts)
- [sqlite-run-maintenance.ts](../state-storage/adapters/run-registry/sqlite-run-maintenance.ts)
- [sqlite-flow-permits.ts](sqlite-flow-permits.ts)
- [sqlite-run-repository.ts](../state-storage/adapters/run-registry/sqlite-run-repository.ts)

- [flow-journal-database.ts](../state-storage/adapters/flow-engine/flow-journal-database.ts)：独立append-only系统事件库。
- [sqlite-flow-journal.ts](../state-storage/adapters/flow-engine/sqlite-flow-journal.ts)：系统状态、Activity与检查点事务。

## 设计依据

[对应设计](../../../docs/design/layers/infrastructure-plane/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
