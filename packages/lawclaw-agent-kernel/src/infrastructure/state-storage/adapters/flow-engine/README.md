# FlowEngine SQLite 日志

`flow-journal-database.ts`管理系统日志连接，`sqlite-flow-journal.ts`实现FlowJournal。运行状态、条件写入和Activity回放遵循FlowEngine契约。

目录分类不改变现有数据库和表名；不能将业务AgentRun生命周期状态写入通用系统状态字段。
