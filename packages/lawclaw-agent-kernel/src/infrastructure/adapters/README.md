# 本地基础设施实现

## 职责

提供时间、授权快照、SQLite耐久Run目录、原子提交、命令记录、Artifact、Adapter私有消息、Permit和对账事件。

## 边界与非职责

不计算Core迁移或业务授权，不调度Provider。FlowSqliteSession固定连接和作用域；SqliteFlowCommits独占跨表提交事务，SqliteFlowCommands管理命令生命周期。

## 接口、依赖与生命周期

SystemTimeAdapter 是唯一读取系统时钟的实现；FakeDelegationProvider 只用于 Faux 场景，CLI 真正委派另有适配器。

## 文件与子目录

- [fake-delegation-provider.ts](fake-delegation-provider.ts)
- [in-memory-permission-snapshots.ts](in-memory-permission-snapshots.ts)
- [index.ts](index.ts)
- [system-time-adapter.ts](system-time-adapter.ts)

- [flow-sqlite-database.ts](flow-sqlite-database.ts)
- [flow-sqlite-session.ts](flow-sqlite-session.ts)
- [sqlite-flow-artifacts.ts](sqlite-flow-artifacts.ts)
- [sqlite-flow-commands.ts](sqlite-flow-commands.ts)
- [sqlite-flow-commits.ts](sqlite-flow-commits.ts)
- [sqlite-flow-maintenance.ts](sqlite-flow-maintenance.ts)
- [sqlite-flow-permits.ts](sqlite-flow-permits.ts)
- [sqlite-flow-store.ts](sqlite-flow-store.ts)

- [flow-journal-database.ts](flow-journal-database.ts)：独立append-only系统事件库。
- [sqlite-flow-journal.ts](sqlite-flow-journal.ts)：系统状态、Activity与检查点事务。

## 设计依据

[对应设计](../../../docs/design/layers/infrastructure-plane/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
