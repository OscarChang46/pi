# Agent Kernel 稳定协议外观层设计

> 状态：`ACR-2026-0008` 五步评审步骤二候选
> 返回主文档：[6.3 层间协议与接口候选](agent-kernel-design.md#63-层间协议与接口候选)
> 边界协议：[C4 边界协议与接口设计](c4-boundary-protocols.md)
> 架构图：[12 C4 层间边界协议](diagrams/domain/12-c4-boundary-protocols.puml)

## 1. 设计目的

`AgentKernelProtocolFacade` 是位于 Transport Adapter 与 `AgentSystemGateway` 之间的薄协议外观。它向 CLI、Desktop Host 和未来本机 HTTP 调用方稳定呈现 `AgentKernelProtocolV1`，让内部模块、对象和传输机制可以独立演进。

稳定的是方法、命令、事件、错误和版本语义，不是 JSONL、HTTP 或进程内调用方式。

```text
CLI / Desktop Host
  → InProcessAdapter / JsonlAdapter / HttpAdapter（可选）
  → AgentKernelProtocolFacade
  → AgentSystemGateway
  → Agent Control Plane
```

## 2. 职责边界

外观层只负责：

- 协议版本和能力协商；
- 帧大小、Schema 与必填元数据校验；
- Transport DTO 与公共 Command/Query/Event 的机械映射；
- `requestId` 多路复用、事件序列化和稳定错误映射；
- 将 Host 已建立的可信连接上下文转换为不透明 `executionEnvelopeRef`。

外观层不得：

- 创建、持久化或恢复任何聚合；
- 决定调度、重试、权限、审批或工具路由；
- 执行模型、工具、Sandbox 或 Memory 查询；
- 直接访问 Repository、Runtime、PermissionSystem 或 Provider；
- 根据 Transport 类型改变领域语义。

## 3. 首版公共能力面

| 方法族 | 语义 | 下游应用 Port |
|---|---|---|
| `initialize` | 协商协议版本、能力和限制 | Facade 本地处理 |
| `agent.describe` | 查询可公开的 Agent 描述 | `AgentSystemGateway` |
| `run.start/get/cancel` | 受理、查询和取消 Run | `AgentSystemGateway` |
| `run.events.read/subscribe` | 补拉和订阅已规范化事件 | `AgentSystemGateway` |
| `decision.submit` | 回写既有技术审批请求的决定 | `ApprovalDecisionPort` 的公开门面 |
| `health.get` | 查询本机组件健康 | `HealthPort` 的公开门面 |
| `metrics.snapshot` | 获取低基数本地指标快照 | `ObservabilityQueryPort` |
| `shutdown` | 有界停止接收新任务并关闭 Host | `KernelLifecyclePort` |

公共协议不得暴露 `AgentRunAttempt`、`RuntimeLease`、Fence、Permit 存储结构、ToolCall Repository 字段、SQLite 类型或 Pi 原生对象。

## 4. Transport Adapter

| Adapter | 首版地位 | 约束 |
|---|---|---|
| `InProcessAdapter` | CLI 默认 | 仍必须经过 Facade，不得直接调用内部服务 |
| `JsonlAdapter` | Desktop Sidecar 默认 | stdout 协议纯净；stderr 结构化日志；帧和未确认事件有界 |
| `LoopbackHttpAdapter` | 可选 | 只监听回环地址；不能成为内部组件通信总线 |
| gRPC Adapter | 后续 | 跨主机 Worker 出现后另行评审 |

所有 Adapter 使用同一组黑盒契约测试。相同命令必须得到相同稳定错误码、权威结果和持久事件序列。

## 5. 版本规则

- 新增可选响应字段或可忽略事件类型允许保持主版本；
- 删除字段、增加新的必填语义、改变错误含义或状态迁移必须提升主版本；
- 未知主版本立即拒绝，不能猜测降级；
- 幂等命令重传时保持 `commandId`，相同键异载荷返回冲突；
- 连接断开不等于 Run 取消，也不等于工具未执行。

## 6. 关联设计

- Run 的受理和权威状态见[Run、调度与 Runtime 子系统](run-scheduling-runtime-subsystem-design.md)。
- 审批回写见[权限、审批与执行授权子系统](technical-approval-subsystem-design.md)。
- 完整边界编号、Local-first 绑定和重试语义见[C4 边界协议](c4-boundary-protocols.md)。
- 系统测试见[SFMEA 与系统测试计划](agent-kernel-system-sfmea-test-plan.md)中的 `ST-PRO-*`。
