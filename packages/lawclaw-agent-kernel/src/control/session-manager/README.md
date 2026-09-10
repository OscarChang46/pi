# SessionManager（L1-CMP-005）

设计依据：[SessionManager](../../../docs/design/layers/l1-control/components/session-manager.md)。

- [agent-session.ts](agent-session.ts)：`AgentSession` 聚合的首个实现切片，只维护 `0..1 ActiveRunBinding`。
- [Session 契约](../../contracts/control/session-manager/session-manager-contract.ts)：`SessionCreationIntent`、`SessionAnchor`、`lookup/ensure` Port、确认结果及绑定状态的唯一源码定义。

当前切片由进程内 `AgentSystem` 实现 logicalKey 唯一目录和 ensure 幂等回执，应用层 `RootSessionPreparationCoordinator` 负责候选失败零写入与竞争赢家重组。尚未实现持久 Repository、跨进程唯一约束、受理 outbox/inbox、候选保存/条件采纳、分支或 `SubSessionCoordinator`。因此它只提供单进程行为证据，不构成完整 SessionManager 或分布式恢复证据。
