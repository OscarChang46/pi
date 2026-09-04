---
doc_id: L1-CMP-005
level: component
layer: L1 Control & Orchestration Runtime
component: SessionManager
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: AgentSession 聚合、上下文增量、Artifact 索引和分支血缘
parent: L1-DES-001
interfaces: [SessionCommandPort, SessionQueryPort, SessionBranchPort, SessionRepositoryPort, ArtifactPort, DomainEventPort]
diagrams: []
supersedes: [session-flow-engine-resource-subsystem-design.md 与 context-memory-subsystem-design.md 中的 Session 内容]
---

# SessionManager 组件设计

## 1. 目标与非目标

SessionManager 管理可持久、可卸载、可分支的技术会话档案，使多个 Run 可以在明确版本上读取和追加上下文事实。Session 不是业务 Conversation，不拥有 Run 状态，也不对应进程、线程、Runtime 或执行槽。

## 2. 所有状态与不变量

`AgentSession` 是本组件权威聚合，拥有上下文增量、消息/观察记录、Artifact 引用、版本、归档状态和可选父 Session 快照引用。它只保存 Run 引用，不复制 Run 的 queued/running/terminal 状态。

模型私有原始 chain-of-thought 不持久化。分支默认使用父快照引用加增量，不复制整个历史；并发追加必须以期望版本提交。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `SessionCommandPort` | 创建、追加增量、归档技术 Session |
| 入站 | `SessionQueryPort` | 读取带版本的不可变 SessionSnapshot |
| 入站 | `SessionBranchPort` | 从确定父版本创建隔离分支 |
| 出站 | `SessionRepositoryPort` | 持久化 Session 聚合 |
| 出站 | `ArtifactPort` | 保存大对象并只保留不透明引用 |
| 出站 | `DomainEventPort` | 提交后发布 Session 事实 |

## 4. 生命周期与算法

创建时绑定技术 Agent/上下文策略引用；Run 执行期间按 sequence 追加经过筛选的 Delta；分支冻结父版本并建立血缘；归档后禁止普通追加但保留查询和审计。ContextEngine 始终从 Snapshot 构建 Frame，不持有共享可变 Session。

## 5. 韧性与可观测性

- CAS 冲突时调用方重新加载并重算 Delta，不执行最后写入者覆盖。
- Artifact 写入成功但 Session 提交失败时保留可回收引用，由清理任务处理。
- 存储或 Artifact 不可用时有界失败，不在内存中伪造已提交 Session。
- 记录增量大小、冲突、分支深度、归档和重建耗时；内容必须脱敏。

## 6. 验收

- 1000 个挂起 Session 不产生 1000 个进程或常驻协程。
- Session 中 Run 权威状态字段和业务 Conversation 字段数量为零。
- 两个并发追加最多一个在同一版本成功，另一方必须重载。
- Child Session 只保存增量与父快照引用，且不会扩大父级权限。
