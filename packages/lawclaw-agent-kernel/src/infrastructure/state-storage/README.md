# StateStorage（INF-CMP-001）

设计依据：[StateStorage](../../../docs/design/layers/infrastructure-plane/components/state-storage.md)。机制位于基础设施层，领域归属由所实现的契约决定。

| 适配目录 | 文件 | 所实现的领域能力 |
| --- | --- | --- |
| adapters/flow-engine | sqlite-flow-journal.ts、flow-journal-database.ts | FE系统日志、CAS、Activity回放 |
| adapters/run-registry | sqlite-run-repository.ts、sqlite-run-commands.ts、sqlite-run-commits.ts、sqlite-run-maintenance.ts | AgentRun存储、命令、提交与维护 |
| adapters/run-registry | agent-run-database.ts、agent-run-transaction.ts | 当前业务档案的SQLite连接与事务上下文；不是AgentSession |

现有业务数据库仍包含Artifact、Adapter消息和Permit表；目录迁移不改变物理表名、版本、事务、幂等键或数据摘要，也不宣称这些领域已完成存储拆分。
