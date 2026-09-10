---
doc_id: VER-SES-TAKEOVER-001
level: verification
layer: L1 Control & Orchestration Runtime
component: SessionManager
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 单活 Session 中同一 Run 的 Attempt 接管后拒绝旧执行写入的测试场景与验收断言
parent: SR-SESSION-02
interfaces: [SessionRunCommandPort, RunExecutionPort, SessionRepositoryPort]
diagrams: []
supersedes: []
---

# Session 单活 Run 下的执行失联与接管测试

本文件补充 [SR-SESSION-02 测试矩阵](sr-02-single-active-run.md#9-测试闭环)。以下均为**待实现/未运行**。

## 场景与职责边界

前置条件已经冻结：Session S 只有一个 `activeRunBinding`，A、B 必须是同一个 Run R 的两个 Attempt，不能用 B 创建第二个 Run。R 在 A 失联期间仍占用 S；B 的接管只改变 RunRegistry 内 R 的当前 `ExecutionClaim/attemptId/fence`，不改变 Session 的 `runId/bindingVersion`。

问题示例：A 读取 S@10 后失联；RunRegistry 将同一 R 接管给 Attempt B；此时 A 恢复。仅比较 Session version 不够，因为 B 尚未写入时 S 仍可能是10。解决方式是：RunRegistry 是 Attempt 执行资格唯一所有者；只有携带当前 `ExecutionClaim` 并经 RunRegistry T2 提交的 `TranscriptSlice` 才能进入 Session append。SessionManager 只复核 `sourceRunId` 等于当前绑定 R、切片有权威提交回执及期望 Session version，不签发或接管 Attempt lease/fence。

因此不新增 Session 级 lease、失联 timer 或 takeover port。Session 单行绑定解决“是否允许另一个 Run 进入”；RunRegistry claim/fence 解决“同一个 Run 的哪个 Attempt 可提交”。二者职责不可复制。

## SES-TAKEOVER-T-01：B 提交后 A 恢复

层级：持久化并发集成；使用同一临时数据库的两个独立连接或工作进程、ManualClock、ManualGate 和独立写入计数器。

1. S 为 active@10，`activeRunBinding={runId:R,bindingVersion:7,state:ACTIVE}`。Attempt A 持有 claim fence=3，读取版本10并停在 RunRegistry T2 提交前，不持数据库锁。
2. 令 A 的 claim 失效；RunRegistry 通过正式 takeover 为同一 R 创建 Attempt B，fence=4。S 的绑定仍是 R@7，不能创建 R2。
3. B 提交唯一权威 TranscriptSlice TB；SessionManager 复核 R@7 和 TB 的 RunRegistry 提交回执后追加，S 变为11。
4. 恢复 A，使其携带 fence=3 提交 TA，并重复相同旧请求。
5. 重开数据库，从 RunRegistry 与 SessionRepository 核对结果。

必须断言：B 的业务变更恰好一次；A 的两次旧提交均在 RunRegistry 被拒绝，不能产生有效 TranscriptSlice、Session 写入或 outbox；S 最终为11且只含 TB。重开数据库后结果不变。

## SES-TAKEOVER-T-02：B 已接管但尚未写入

沿用 T-01 的前置。B 的 fence=4 已持久化，但尚未提交业务事实，Session 仍为10。先恢复 A 再释放 B。

必须断言：即使 A 的期望 Session version 仍为10，旧 fence=3 也不能通过 RunRegistry T2，因此 SessionManager 收不到可追加的权威切片；B 随后唯一提交，最终 Session 为11且只含 TB。此例证明不能只依赖 Session version CAS。

## SES-TAKEOVER-T-03：旧提交与接管的原子边界

在 A 的 RunRegistry T2 提交和 B takeover 的持久化确认点前设置双屏障，分别运行：

| 确认顺序 | 期望结果 |
|---|---|
| B takeover 先确认，A 后提交 | A 的旧 claim 被拒绝；B 唯一提交；Session 绑定始终是 R@7 |
| A 的 T2 先确认，B 后 takeover | A 已确认的结果保留；B 按同一 Run/命令查询并复用，不重新执行已确认操作；业务增量总数1 |

记录屏障顺序、R 的 attempt/fence、Session `runId/bindingVersion`、Run commit、TranscriptSlice、Session 前后版本和真实派发次数。不能把尚未确认的 takeover 请求当作资格已经切换。

## 已冻结契约与证据要求

- Session 串行范围是当前活跃 Run，基数固定为 `0..1`；第二个不同 Run 返回 `SESSION_RUN_ACTIVE`，不进入接管流程。
- Attempt 执行资格权威所有者、失联判定和 takeover 入口均为 RunRegistry；SM 不新增 Session lease/fence。
- Session append 必须同时验证当前 `activeRunBinding` 的 `runId/bindingVersion`、权威 TranscriptSlice 回执和 Session expectedVersion。
- 当前仅更新测试设计；未新增可执行测试，未运行持久化或系统集成测试。验收时须保存真实本地持久化证据，不能用内存 Fake 代替。
