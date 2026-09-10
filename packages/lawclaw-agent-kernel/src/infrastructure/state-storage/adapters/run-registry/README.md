# RunRegistry SQLite 存储

`agent-run-database.ts`管理业务SQLite连接，`agent-run-transaction.ts`提供事务上下文；repository、commands、commits和maintenance文件分别承担查询受理、命令、提交和维护。

本目录实现RunRegistry端口，不是SessionManager持久仓储。现有Artifact、Adapter消息及Permit共用数据库的事实见[StateStorage说明](../../README.md)，不据此宣称领域存储已经拆分。
