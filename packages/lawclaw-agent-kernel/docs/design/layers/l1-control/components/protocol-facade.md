---
doc_id: L1-CMP-001
level: component
layer: L1 Control & Orchestration Runtime
component: Protocol Facade
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Protocol Facade 的协议边界、版本行为与机械映射职责
parent: L1-DES-001
interfaces: [AgentKernelProtocolV1, AgentSystemGateway, ApprovalDecisionPort, HealthPort, ObservabilityQueryPort, KernelLifecyclePort]
diagrams: []
supersedes: [protocol-facade-subsystem-design.md 中的组件级内容]
---

# Protocol Facade 组件设计

## 1. 目标与非目标

目标是让进程内、stdio JSONL 和未来本机 HTTP Transport 共用同一套稳定协议语义，并在请求进入 Gateway 前完成版本、大小、必填元数据和可信连接上下文校验。

本组件不创建聚合，不负责认证、租户解析、调度、权限、重试、恢复或 Provider 调用，也不因 Transport 类型改变领域行为。

## 2. 状态与不变量

组件没有领域权威状态。可保存有界连接状态、`requestId` 关联和协商能力缓存；断线即可丢弃并重建。原始 Token 必须在 KernelHost 终止，Facade 只接收可信连接上下文并传播不透明 `ExecutionEnvelopeRef`。

稳定的是命令、查询、事件、错误和版本语义，不是 JSONL、HTTP 或进程内绑定。未知主版本立即拒绝；相同幂等键异载荷必须报告冲突。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `AgentKernelProtocolV1` | 初始化、Agent 查询、Run 命令/查询/事件、决定回写、健康、指标和关闭的公共协议面 |
| 出站 | `AgentSystemGateway` | 机械转发 Agent 与 Run 用例 |
| 出站 | `ApprovalDecisionPort` | 回写既有技术审批决定，不创建业务审批 |
| 出站 | `HealthPort`、`ObservabilityQueryPort` | 查询脱敏健康与低基数指标 |
| 出站 | `KernelLifecyclePort` | 有界停止接收新请求 |

## 4. 生命周期与算法

连接建立时协商版本、能力和上限；每个请求依次执行帧限制、Schema、元数据、Deadline 与调用上下文校验，再完成 DTO 的机械映射和 Port 调用。响应与事件映射回稳定协议模型；事件以 Run sequence 支持补拉。Transport 断开不触发 Run 取消。

## 5. 韧性与可观测性

- 每连接未确认请求、事件窗口和帧大小有界，超限稳定拒绝。
- stdout 作为 JSONL 协议时保持纯净，日志只写脱敏 stderr。
- 记录协议版本、方法族、延迟、错误类别和重连次数；禁止记录 Token、Prompt 与完整载荷。
- Adapter 使用同一黑盒契约测试，相同命令必须产生相同权威结果。

## 6. 验收

- Transport 更换不改变 Gateway 收到的规范化意图。
- 未知主版本、超大帧、过期 Deadline 和不可信上下文在 Gateway 前被拒绝。
- 连接断开后 Run 继续存在，客户端可按已确认 sequence 补拉事件。
- Facade 对 Repository、Runtime、PermissionSystem 和 Provider 的直接依赖为零。
