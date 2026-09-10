---
doc_id: L1-CMP-002
level: component
layer: L1 Control & Orchestration Runtime
component: AgentSystemGateway
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Agent Kernel 外部用例入口及其协调边界
parent: L1-DES-001
interfaces: [AgentSystemGateway, AgentRegistryQueryPort, SessionCommandPort, SessionQueryPort, RunCommandPort, RunQueryPort, RunEventQueryPort, RunSchedulerPort]
diagrams: []
supersedes: [agent-kernel-design.md 与 protocol-facade-subsystem-design.md 中的 Gateway 组件级内容]
---

# AgentSystemGateway 组件设计

## 1. 目标与非目标

Gateway 为 Backend、KernelHost 和 Protocol Facade 提供 Agent 查询、Run 受理/查询/取消及事件读取的统一入口。它确保外部调用不会绕过 Registry、Run、Session 或 Scheduler 的应用边界。

Gateway 不实现 Transport、认证、Tenant/RBAC 解释、业务 Workflow、调度算法、模型循环、权限裁决或持久化。

## 2. 状态与不变量

Gateway 无领域权威状态，只协调单次用例。写命令必须传播稳定 `commandId`、幂等键、Deadline、OperationContext 和 `ExecutionEnvelopeRef`。Gateway 不得把原始 Token、业务角色或业务审批模型写入 Kernel 对象。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `AgentSystemGateway` | 对外稳定的 Agent 与 Run 用例入口 |
| 出站 | `AgentRegistryQueryPort` | 查询可公开 Agent 描述 |
| 出站 | `SessionCommandPort`、`SessionQueryPort` | 解析或创建技术 Session 引用 |
| 出站 | `RunCommandPort`、`RunQueryPort` | 幂等受理、取消和查询权威 Run |
| 出站 | `RunEventQueryPort` | 按 Run sequence 读取持久事件 |
| 出站 | `RunSchedulerPort` | 通知新 Run 或恢复 Run 进入调度判定 |

## 4. 生命周期与算法

启动 Run 时先验证规范化意图和信封引用，再核对已准备的 Agent/Session 锚点与候选引用，经 SessionRunCommandPort 占用单活绑定，由 SessionManager outbox 经 RunCommandPort 受理；取得 Run 耐久回执后才确认 accepted，最后通知 Scheduler。Scheduler 通知失败不回滚已受理 Run，恢复扫描会重建队列。查询和取消均以 Run 权威状态为准。

## 5. 韧性与可观测性

- 相同命令同载荷返回原回执；同键异载荷冲突。
- Scheduler 短暂不可用时，已持久化 Run 保持可恢复，不以内存通知作为权威事实。
- 记录用例名、command/run 引用、受理延迟和稳定结果类别；不记录业务载荷正文。
- 任何下游部分成功都必须能由权威查询确认，不能凭连接状态推断。

## 6. 验收

- 外部调用不能绕过 Gateway 直接创建 Run 或派发 Runtime。
- start 返回时 Run 已持久化；通知丢失后启动扫描仍能调度。
- 取消只建立取消请求事实，不虚假承诺清理已经完成。
- Gateway 中业务 Workflow、Token、Tenant 和 RBAC 解释逻辑为零。

## CD-1契约细化（2026-09-07）

本页为契约门面，不新增独立状态库或服务。字段与操作见[CD-1](../../../contracts/component-development-contracts-v1.md#agent-system-gateway)；范围见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

身份边界已授权后，先查询同 commandId 受理回执，再解析指定 Agent/Session 历史版本及路由候选，校验请求范围与预算；通过 Session 单活入口受理，由 RunRegistry 创建并冻结，返回耐久回执，最后发调度提示。低层 start 必须给定已确认 Session，不在 start 内隐式创建。新 TUI 的首次输入由 Host 准备适配器按 [CTX-CON-1](../../../contracts/context-assembly-contract.md) 先准备候选，再 ensure/绑定/保存并调用 start；不要求客户端先创建空 Session。准备记录与 Run 受理回执分开查询，见 [TUI-CON-001](../../../contracts/kernel-tui-contract.md)。本段替换旧“调用方可先 Session create”的无条件次序；Gateway 不新增准备存储或 Context 算法。查询/取消均经 RunRegistry。

每次读、取消、事件补拉均验证可信上下文对目标 Run/Session 的访问能力；不存在与越权对外统一 NOT_FOUND，内部审计区分。goalRef 在读取前验证归属及不可变摘要。

通知失败仍返回已受理；扫描补偿。提交超时只查受理键，返回 UNKNOWN 而非新请求；受理索引到期返回 GONE。取消应返回请求已记录，不承诺外部动作已停止。

容量：入口在途 64；查询分页1—256，默认64；受理截止 min(调用剩余,5秒)；受理本地 P99≤100ms；限额按共享档案。

验收用例（待实现/执行）：

- L1-CMP-002-TC-01：同command两并发start：runId一致、Run创建数1。
- L1-CMP-002-TC-02：同command不同goalRef：IDEMPOTENCY_CONFLICT且无第二Run。
- L1-CMP-002-TC-03：提交成功后关闭Scheduler：仍返回原受理，5秒扫描发现。
- L1-CMP-002-TC-04：Session@7受理后追加@8：Run仍冻结7。
- L1-CMP-002-TC-05：T1信封读取T2 Run：正文/事件读取数0。
- L1-CMP-002-TC-06：取消已Completed Run：返回原终态，版本不增加。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
