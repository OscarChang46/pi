# Agent Kernel 权限、审批与执行授权设计

> 状态：`ACR-2026-0008` 五步评审步骤二候选
> 返回主文档：[8 身份、租户与执行信封](agent-kernel-design.md#8-身份租户与执行信封)、[9 权限与外部审批](agent-kernel-design.md#9-权限与外部审批)
> 权威类图：[09 权限、身份与执行授权](diagrams/domain/09-permission-authority.puml)
> 领域目录：[Agent Kernel 领域对象目录](agent-kernel-domain-object-catalog.md)
> 相关设计：[工具调用与沙箱](tool-call-subsystem-design.md)、[稳定协议外观层](protocol-facade-subsystem-design.md)

## 1. 设计结论

`PermissionSystem` 是 Agent Kernel System 内统一的技术权限决策点。工具调用、共享记忆读写、Agent 委派、Artifact 导出和 Secret 解析等受保护动作都必须提交 `ActionProposal`，得到 `Allow | Ask | Deny` 结论后才能继续。

权限组件不认证用户、不解析租户、不执行 Backend RBAC，也不拥有业务 `ApprovalCase`。`KernelHost` 把外部可信身份和资源范围编译为不可变 `AgentExecutionEnvelope`；Kernel 聚合只保存 `AgentExecutionEnvelopeRef`，按需通过 Port 加载。

系统内唯一能够触发实际执行的授权制品是 `ExecutionPermit`。不存在第二套通用授权对象或同步审批入口，权限决定本身也不能直接触发执行。

## 2. 职责边界

### 2.1 Permission System 拥有

- `ActionProposal` 的规范化与动作摘要校验；
- 执行信封、授权 epoch、资源绑定和父级权限的交集计算；
- `Allow | Ask | Deny` 技术决策；
- `PermissionRequest` 的创建、超时和技术状态；
- `ExecutionPermit` 的签发、一次性消费、撤销和过期；
- 权限决定、审批回写和 Permit 消费的安全审计事实。

### 2.2 Permission System 不拥有

- 用户、租户、组织和 RBAC 领域模型；
- 审批人选择、通知、业务审批流程和 `ApprovalCase`；
- Tool Provider、Sandbox、Secret、Artifact 或 Memory 的执行机制；
- 业务 Workflow、业务角色和结果采纳规则；
- Agent Runtime 的模型循环和调度队列。

## 3. 对象模型

| 对象 | 类型 | 权威职责 |
|---|---|---|
| `AgentExecutionEnvelope` | 值对象 | KernelHost 编译的执行身份、授权快照、资源绑定和运维上下文 |
| `ActionProposal` | 值对象 | 一个具体受保护动作及其资源、预算和参数摘要 |
| `PermissionDecision` | 值对象 | `ALLOW`、`ASK` 或 `DENY` 的不可变判断 |
| `PermissionRequest` | 聚合根 | ASK 从 requested 到 approved、denied 或 expired 的技术生命周期 |
| `ApprovalDecision` | 值对象 | 外部审批边界回写的不可变证据；不得扩大原提案 |
| `ExecutionPermit` | 聚合根 | 绑定动作摘要和授权版本的一次性、可撤销、可过期执行凭证 |

`ExecutionPermit` 必须绑定 `runId`、`agentId`、`actionDigest`、资源子集、授权 epoch、期限和消费状态。复制 Permit 数据不能复制其消费权威状态；消费使用 Repository CAS 防止并发重放。

## 4. Port 与调用方

| Port | 方向 | 唯一角色 | 关键语义 |
|---|---|---|---|
| `PermissionDecisionPort` | 入站 | ToolRuntime、MemoryManager、SubagentCoordinator 等权限执行点 | 对规范化 `ActionProposal` 作 Allow、Ask、Deny 决策 |
| `PermitValidationPort` | 入站 | 已获授权的权限执行点 | 在副作用前校验并原子消费一次性 Permit；可撤销未消费 Permit |
| `PermissionQueryPort` | 入站 | 受授权查询方 | 查询 Request/Permit 技术快照，不返回业务审批内部数据 |
| `ApprovalRequestPort` | 出站 | PermissionSystem → Backend/业务审批边界 | 异步提交审批请求并返回不透明外部引用 |
| `ApprovalDecisionPort` | 入站 | Backend/业务审批边界 → PermissionSystem | `decision.submit`，回写批准或拒绝证据 |
| `PolicySnapshotPort` | 出站 | PermissionSystem → KernelHost | 校验冻结策略和 authorization epoch |
| `ExecutionEnvelopePort` | 出站 | PermissionSystem → KernelHost | 按 Ref 加载可信执行信封 |
| `PermissionRepositoryPort` | 出站 | PermissionSystem → Persistence | 保存 Request、Permit 及其 CAS 消费状态 |

外部审批是异步边界。`ApprovalRequestPort` 不同步返回最终决定；`ApprovalDecisionPort` 只能裁决既有请求，不能替换 `ActionProposal`、增加资源或延长超出原始 Deadline 的有效期。

## 5. 授权流程

```text
权限执行点
  → PermissionDecisionPort.authorize(ActionProposal, AgentExecutionEnvelopeRef)
  → 加载执行信封与策略 epoch
  → 计算 proposal ∩ authority ∩ resource binding ∩ parent limit
      ├── Deny  → 记录拒绝并返回稳定原因码
      ├── Allow → 持久化 ExecutionPermit 后返回 permitRef
      └── Ask   → 持久化 PermissionRequest
                  → ApprovalRequestPort.requestDecision
                  → WAITING_APPROVAL
                  → ApprovalDecisionPort.submitDecision
                  → Permit 或拒绝终态
```

实际副作用执行前，权限执行点必须调用 `PermitValidationPort.validateAndConsume(permitRef, actionDigest, envelopeRef)`。消费失败、已消费、过期、撤销、epoch 变化或动作摘要不匹配均失败关闭。首版在本进程内完成决策和 SQLite CAS，不引入远程 PDP 往返；所有受保护动作仍使用一次性 Permit，Local-first 不降低授权强度。

## 6. 最小权限不变量

1. `Allow` 只能产生原提案与执行信封授权的交集。
2. `Ask` 不代表临时允许；审批完成前不得调用 Provider 或 Infrastructure。
3. `ApprovalDecision` 只能维持或缩小提案，不能扩权。
4. `ExecutionPermit` 默认单动作、短期限、一次性消费。
5. Child Run 的权限、预算和 Deadline 必须是 Parent 的子集。
6. SandboxRequest、SecretLease、Memory commit 和 Artifact export 都不得超过 Permit。
7. PermissionSystem 不直接执行受保护动作；执行点也不得自行生成 Permit。
8. 不透明 PrincipalRef 和资源 Handle 不得被 Kernel 解释成租户或用户业务模型。

## 7. 故障与韧性

| 故障 | 默认行为 |
|---|---|
| 策略或信封不可加载 | Deny，记录稳定错误码 |
| 审批系统不可用 | Request 保持等待直至 Deadline；不得降级 Allow |
| 重复审批回写 | 同决定幂等；异决定冲突并审计 |
| Permit 并发消费 | 只有一次 CAS 成功，其余返回已消费 |
| 授权 epoch 变化 | 未消费 Permit 失效 |
| Permission Repository 不可用 | 不签发 Permit，不执行副作用 |
| 审计发布失败 | 权威状态先提交；事件可补发，但不得重复执行动作 |

## 8. 安全日志

允许记录：requestId、permitId、runId、agentId、动作类别、资源类别、摘要、决定、原因码、策略引用、epoch、耗时和 Trace 标识。

禁止记录：Prompt、正文、工具原始参数、Secret、外部身份明文、资源内容和未经脱敏的审批备注。

## 9. 评审步骤二待固化

- `PermissionDecisionPort`、`PermitValidationPort` 等 Port 的完整 TypeScript/Python 签名和中文 TSDoc；
- PermissionRequest 与 ExecutionPermit 状态迁移矩阵；
- ApprovalDecision 的签名、重放保护和幂等键；
- Permit Repository 的事务/CAS 约束；
- 稳定错误码、事件目录和超时策略。

在步骤二确认前，本文件只确定职责、方向和安全不变量，不授权修改运行代码。
