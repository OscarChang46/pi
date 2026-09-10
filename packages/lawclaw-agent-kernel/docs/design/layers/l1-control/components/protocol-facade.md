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

目标是让进程内、stdio JSONL 和本机 HTTP Transport 共用同一套稳定协议语义，并在请求进入 Gateway 前完成版本、大小、必填元数据和可信连接上下文校验。本机 HTTP/SSE 是新 TUI 的候选首期绑定，尚未完成实现。

本组件不创建聚合，不负责认证、租户解析、调度、权限、重试、恢复或 Provider 调用，也不因 Transport 类型改变领域行为。

[TUI-CON-001](../../../contracts/kernel-tui-contract.md) 的 submitConversation 是 Host 意图入口：Host 准备适配器处理候选与 Session 确认后才调用 Facade 的技术 start。Facade 不持有准备操作表，不组装 Context。查询、取消、持久事件及公开投影经已有 Port 机械映射；临时文本 delta 不占权威事件序号。该补充不将新 TUI 协议冒称为旧 Flow HTTP 的现有能力。

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

## CD-1契约细化（2026-09-07）

本页为契约门面，不新增独立状态库或服务。字段与操作见[CD-1](../../../contracts/component-development-contracts-v1.md#protocol-facade)；范围见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

NEW 只接受 initialize；共同主版本不存在则关闭；能力取双方交集，帧上限取 min。READY 中先检查原始 UTF-8 字节、深度、Schema、可信连接绑定、截止时间，再按封闭方法表映射。逐个映射结果；事件返回权威 Run sequence，客户端 ACK 只影响本连接窗口。DRAINING 拒绝新写但允许查询，30 秒后关闭。

KernelHost 创建不可从 JSON 伪造的 TrustedConnectionContext；Facade 从该上下文取得信封，载荷中的信封不能覆盖它。shutdown/审批/诊断分别需管理/审批/诊断能力，普通 Run 权限不够。

断线后丢弃连接表。重连重新协商并以最后已持久确认的 Run sequence 补拉；write 超时由客户端查询原 commandId，不重建 Run。GONE 返回最早可读序号，不伪造空列表。

容量：每连接 32 个在途请求、128 条未 ACK 事件、帧 64KiB、深度 32；连接最多 64；初始化超时 5 秒；映射 P99≤5ms。

验收用例（待实现/执行）：

- L1-CMP-001-TC-01：版本2.0.0且服务仅1.0.0：拒绝 PROTOCOL_UNSUPPORTED，Gateway调用=0。
- L1-CMP-001-TC-02：帧65537字节：FRAME_LIMIT，分配完整JSON对象前拒绝。
- L1-CMP-001-TC-03：断线发生在start已提交后：重连同command只返回原runId。
- L1-CMP-001-TC-04：ACK=10后服务重启：补拉11起，迟到ACK不得倒退。
- L1-CMP-001-TC-05：普通调用者shutdown或伪造信封：ACCESS_DENIED，生命周期调用=0。
- L1-CMP-001-TC-06：128个未ACK事件后停读：暂停发送且内存不超过窗口；恢复ACK继续。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
