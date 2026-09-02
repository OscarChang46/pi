# ACR-2026-0008：Agent Kernel System Boundary V3

- 状态：DRAFT
- 级别：L2（Agent 子系统内部边界、公共接口、聚合和安全策略变化）
- 提议人：用户
- 子系统所有者：Agent Kernel
- 批准人：待五步评审完成后确认
- 创建时间：2026-09-02
- 候选基线：AKB-2026-09-03-09
- 父基线：AKB-2026-09-03-08

## 1. 触发原因

当前 Kernel 公共契约和核心组件直接理解 TenantContext，并且只有单层委派探针，尚未形成权限系统、可扩展工具、结构化 Subagent、角色化 Multi-agent 和共享长记忆的完整边界。用户要求先完成五步架构评审，再授权代码修改。

## 2. 候选变更

- 在纯 Kernel 外增加 `AgentGateway Facade / KernelHost`，负责认证结果消费、RBAC、租户解析、隔离分区和 Scoped Adapter 装配；
- 纯 Kernel 暴露不含 Tenant/RBAC 的 `AgentRuntimeGateway`；
- 增加 Agent 技术权限系统：CapabilityGrant、ActionProposal、Allow/Ask/Deny 和 ExecutionPermit；
- 把工具扩展拆为 Registry、ToolRuntime、Permission、ProviderPort 和 SandboxPort；
- 以 AgentExecutionScope 管理 Parent/Subagent 的结构化并发生命周期；
- 以 MultiAgentRun、Participant 和 AgentRoleDescriptor 管理多 Agent 协作；
- 增加 Private、ExecutionScope、Team 和 Host-bound 长期 MemorySpace；
- 共享记忆使用 Candidate、Grant、版本化 View 和 append-only Entry，不共享可变 Agent Context。

## 3. 上层冲突与处理

现有总体图和详细架构把 TenantContext 作为 AgentGateway 的显式参数。候选方案不删除系统级可信上下文，而是把系统级 AgentGateway 解释为 Kernel 外部 Facade：Facade 消费 TenantContext 并装配隔离后的依赖，纯 Kernel 的 AgentRuntimeGateway 不再接触租户语义。

该解释仍需步骤四进行上层一致性评审。若确认系统级 AgentGateway 必须属于纯 Kernel，则本候选方案与上层架构冲突，必须停止并修改总体 Draw.io，不能通过重命名绕过。

## 4. 不扩权替代方案

- 保留当前租户感知 Kernel，只增加 Tool 和 Multi-agent：实现成本低，但继续让 Agent 领域承担接入层安全语义，不建议；
- 完全删除系统级 TenantContext：会使共享存储和工具缺少可信隔离绑定，不接受；
- 推荐方案：保留 Tenant-aware Facade，纯 Kernel tenant-agnostic，并由 Scoped Adapter 保持隔离。

## 5. 明确不做

- 本 ACR 未批准前不修改运行代码；
- 不把业务 Workflow、业务 ApprovalCase 或业务角色放入 Kernel；
- 不默认开放 Shell、Web、MCP、文件写入或任意网络工具；
- 不允许无限递归 Subagent、Detached Subagent 或无角色 Multi-agent；
- 不允许 Agent 直接写共享记忆；
- 不把具体容器、进程、数据库或网络机制变成 Kernel 领域职责。

## 6. 五步评审状态

| 步骤 | 状态 | 证据 |
|---|---|---|
| 1. 职责边界与核心概念 | REVIEWING | `docs/design/agent-kernel-v2-architecture-review.md`、候选 Draw.io |
| 2. 接口与数据契约 | PENDING | 待步骤一确认 |
| 3. 生命周期、数据流与韧性 | PENDING | 待步骤二确认 |
| 4. 安全与架构一致性 | PENDING | 待步骤三确认 |
| 5. 基线批准与代码授权 | PENDING | 待步骤四确认 |

## 7. 当前候选图

- [可编辑 Draw.io](../../design/agent-kernel-v2-review.drawio)
- [组件预览](../../design/agent-kernel-v2-components.svg)
- [工具权限预览](../../design/agent-kernel-v2-tool-security.svg)
- [生命周期与共享记忆预览](../../design/agent-kernel-v2-multiagent-memory.svg)

## 8. 计划验证

- Kernel contracts/core 中 Tenant/RBAC 类型和字段为 0；
- 只有 AgentGateway Facade / KernelHost 可以解析租户并装配 Scoped Adapter；
- Agent Runtime 绕过 ToolRuntime/PermissionSystem 的路径为 0；
- ToolProvider 接受缺失、过期、已消费或动作不匹配 Permit 的成功用例为 0；
- Parent 终态后活动 Child 为 0；
- Child 权限、预算和 Deadline 超过 Parent 的成功用例为 0；
- 无角色 Participant 为 0；
- 未授权跨 Agent/Team Memory 读取和写入成功用例为 0；
- 循环依赖、Runtime 原生类型泄漏和业务类型进入 Kernel 均为 0。

## 9. 回退

在代码阶段开始前只需放弃候选基线并关闭本 ACR。进入实现后必须保留 `AKB-2026-09-02-07` Tag 和兼容/回退说明；任何持久化 Schema 变更必须另行评审迁移与降级路径。
