# FlowEngine 独立架构评审

结论：**有条件通过，以下两项 P1 修正前不建议冻结为开发契约。**

评审范围：完整阅读 `packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine.md`（2509 行），交叉阅读 RunRegistry、RunScheduler 组件设计。仅评审文档，不把候选状态、未实现代码或未执行测试列为缺陷。下列行号对应本次读取版本，统一修订后需更新。

Core 的纯计算边界、Coordinator 的 I/O 协调职责、RunRegistry 的权威状态所有权及提交后派发原则一致。FE-CON-1 明确了大部分早期概念名和恢复语义；剩余问题集中在失败收口和事件调度可实现性。

## 1. [P1] 已受理但不可迁移的队首事件没有退出路径

- 位置：flow-engine.md:2252–2254、2322–2324、2334、2397–2399。
- 具体轨迹：Ready 状态下两个不同 eventId 的合法 `AdvanceRequested` 先后入 Inbox，sequence=11、12；消费 11 后进入 AwaitingModel；12 在该状态触发 `FLOW_INVALID_TRANSITION`，按 2322 不消费序号。模型正常完成入 Inbox，sequence=13，但 2254 禁止越过 12。随后重试 12 永远非法，处理 13 永远存在缺口。当前接收规则只按 eventId 去重，未禁止两个独立唤醒事件；2334 的“提前到达合法事件持久化并等待”同样不能解开队首阻塞。
- 为何阻塞开发：Coordinator 无法同时满足严格按序、不消费拒绝、持续推进三项要求；开发者必须自行添加丢弃/跳序规则或等待到 Deadline，改变正常运行语义。2449 的 superseded 只覆盖接管后的旧 Attempt，不能解决同 Attempt 内此问题。
- 修正建议：明确 Scheduler 唤醒与业务事实的入队契约，以及 RunRegistry 的拒绝/隔离消费事务。可将多余 `AdvanceRequested` 在非 Ready 状态定义成“只消费、不产生动作”的合法迁移；不可处理业务事件则需要有权威、带原因和原摘要的 disposition 收据及可推进序号的规则。不能让 Coordinator 私自改 sequence。增加上述 11/12/13 轨迹验收。

## 2. [P1] Context 组装失败仍缺少唯一的状态迁移入口

- 位置：flow-engine.md:1375–1380、2205–2224、2338–2341、2399；职责约束见 443–448、2366。
- 具体轨迹：Ready 收到 AdvanceRequested，ContextEngine 确认冻结历史无法在预算内组装 ContextFrame，context=null。Core 只能返回 `FLOW_CONTEXT_REQUIRED`，保持同一事件未消费；RuntimePayload 没有上下文失败事件。图 E06 却允许调用方“通过权威状态端口记录失败”。当前 StateCommitPort 只接受 Core 的 AdvanceDecision，没有此失败路径。
- 为何阻塞开发：若“记录失败”表示 Run=Failed，则 Coordinator 必须伪造 AdvanceDecision 或新增绕过 Resolver 的状态修改能力，形成两个迁移规则所有者；若仅记录诊断，则文档没有定义永久失败何时及通过什么事实终止，无法实现文中承诺的上下文失败收敛。
- 修正建议：给出明确唯一方案。推荐添加可信 Context 失败事实及其 Ready→Failed 迁移，并定义失败发生在已有 AdvanceRequested 待处理期间时如何替代/处置该事件，避免追加到队尾后又被前项阻塞；瞬时不可用的有界重试也应指定次数和失败事件生成者。同步修改 E06，保留 Core 唯一计算位置、RunRegistry 原子提交的职责。

## 3. [P2] 主架构图仍把提交画在外部副作用之后

- 位置：flow-engine.md:282–304，尤其 290、295–298、303–304。
- 具体轨迹：按 FE-DGM-001 的编号执行，Core 返回命令（8）后直接请求模型（9），继而授权并执行工具（12–15），直到 Observation 返回之后才执行 CAS 提交（18–19）。若模型或工具后、18 前崩溃，图示轨迹缺少可恢复的已提交命令。
- 为何影响开发：该图在 311 明确解释为“一次推进中的请求、结果或命令流”，不能仅视作无序依赖图；它与 1.3、6.7 共同提交规则及 T2/Outbox 的必要顺序相反。21.3 的概念名映射并未覆盖此时序矛盾。
- 修正建议：将图改成不编号的逻辑依赖图并明确不得据此读执行顺序，或重画为每轮“Core→T2→Outbox→边界调用→T1→下一次 Core”的顺序。同时将 Router→L4 表达为经 L3 Tool/Sandbox 边界，避免 3.5 已禁止的 L1→L4 直连被图形误读。

建议修订后复核以上三个短轨迹。没有生产实现验证结论；本报告只指出文档内可直接复现的契约缺口。
