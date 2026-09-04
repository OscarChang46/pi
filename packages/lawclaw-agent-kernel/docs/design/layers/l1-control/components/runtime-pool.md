---
doc_id: L1-CMP-012
level: component
layer: L1 Control & Orchestration Runtime
component: RuntimePool
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: L2 Runtime 清单、健康、隔离能力和控制命令派发
parent: L1-DES-001
interfaces: [RuntimeDispatchPort, RuntimeControlPort, RuntimeHealthPort, ProcessPort, TransportPort]
diagrams: []
supersedes: [run-scheduling-runtime-subsystem-design.md 与 session-flow-engine-resource-subsystem-design.md 中的 RuntimePool 内容]
---

# RuntimePool 组件设计

## 1. 目标与非目标

RuntimePool 向 Scheduler 屏蔽单个或多个 L2 Runtime 的进程形态、健康和容量差异，负责 Attempt 的派发、恢复、取消和状态探测适配。

它不拥有 Run/Attempt 权威状态，不执行 FlowEngine 规则，不选择业务优先级，不创建 AgentDefinition，也不允许 L2 绕过 L1 调用 L3。

## 2. 状态与不变量

Runtime 清单、健康和容量是可重建运行投影；RunRegistry 仍拥有 Attempt。首版可以只有一个进程内 Runtime；需要隔离时使用受控 Sidecar。Runtime 断线只形成未知执行状态，不能被 Pool 直接解释为失败或授权重派。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `RuntimeDispatchPort` | 为 Scheduler 选择可用 Runtime 并转发控制命令 |
| 出站 | `RuntimeControlPort` | 向 L2 派发、恢复、取消和查询 Attempt |
| 出站 | `RuntimeHealthPort` | 获取 Runtime 脱敏健康与能力快照 |
| 出站 | `ProcessPort`、`TransportPort` | 可选 Sidecar 生命周期和有界通道机制 |

## 4. 生命周期与算法

启动时发现 Composition Root 装配的 Runtime，验证协议能力并标记容量；派发时按硬能力、隔离等级和可用槽筛选，使用稳定次序选择。命令返回未知时保留派发关联并交由 Scheduler/RunRegistry 查询收敛。停止时先拒绝新派发，再有界取消或排空。

## 5. 韧性与可观测性

- 心跳或进程退出不直接改变 Run 终态。
- 通道缓冲和未确认事件有界；背压向 Scheduler 显式返回。
- 多 Worker 档案只接受有效 Lease/Fence 的派发，旧 Worker 结果由 RunRegistry 拒绝。
- 记录 Runtime 健康、容量、派发延迟、断线、未知结果和协议不兼容。

## 6. 验收

- Runtime 重启不会丢失或重定义 Run 权威状态。
- Runtime 不可用时新派发停止，已知 Run 可由权威查询恢复。
- L2 事件只通过 `RuntimeEventPort` 返回 L1，L2 到 L3 直连路径为零。
- 进程内与 Sidecar 部署保持相同控制语义。
