# ACR-2026-0008：Agent Kernel System Boundary V3

- 状态：DRAFT
- 级别：L2（Agent 子系统核心对象、调度、公共接口和安全策略变化）
- 提议人：用户
- 子系统所有者：Agent Kernel
- 批准人：待五步评审完成后确认
- 创建时间：2026-09-03
- 候选基线：AKB-2026-09-03-09
- 父基线：AKB-2026-09-03-08

## 1. 触发原因

活动基线 `ACR-2026-0007` 把 Runtime 建模为唯一聚合根、Session 建模为 AgentRun 所有者，并让 Runtime 绑定租户。后续评审确认系统边界应是管理多个 Agent、多个 Run、调度、权限、工具、记忆与 Multi-agent 的 Agent Kernel System；单次用户交互和单个 Runtime 都不足以表达系统职责。

本变更先修订架构基线，不修改已经合入 `develop` 的运行代码。

## 2. 候选变更

- 把 `Agent Kernel System` 定义为限界上下文，不创建巨型系统聚合根；
- 把 `AgentRun` 定义为核心执行聚合根，Root Run 表示外部执行意图，Child Run 表示受控委派；
- 把 `AgentRuntime` 从聚合根调整为可重建的执行领域服务，由 `AgentRuntimePool` 管理 Worker；
- 增加 `AgentControlPlane`、`RunScheduler`、`AgentRegistry`、`RunRegistry` 和 Runtime Lease；
- 使用 `AgentRunAttempt` 表达一次 Runtime 执行尝试，使用 `AgentLoopStep` 表达 Attempt 内模型、工具、记忆和委派步骤；
- 把 Session 降为可选 `AgentContextThread`，仅关联多个 Root Run 的上下文版本，不拥有调度和权限；
- `PermissionSystem` 统一裁决工具、记忆、委派、Secret、Artifact 和外部资源访问，返回 Allow/Ask/Deny；
- Ask 通过外部 `ApprovalPort` 获得决定，但 Kernel 不拥有业务 ApprovalCase、审批人选择和通知；
- `ToolRuntime`、Memory Gateway、Delegation Gateway 等权限执行点只接受匹配的一次性 `ExecutionPermit`；
- `MemorySpace` 成为独立聚合，Agent 只提交 `MemoryCandidate`，共享记忆 append-only；
- Child/Participant Run 统一经过 RunScheduler，不允许 Runtime 递归创建游离执行器；
- 在同一 Draw.io 中增加核心领域对象和系统服务协作两张 UML 类图。

## 3. 上层职责一致性

业务编排仍决定为什么执行、何时发起以及是否采纳结果；RunScheduler 只负责 Agent 技术执行调度。Backend 仍负责认证、Tenant Resolver 和 RBAC。具体容器、进程、文件、存储、Secret 和网络仍通过 Infrastructure Port 提供。

候选方案不把业务 Workflow、业务 Conversation、业务审批和租户领域规则引入纯 Kernel，因此不扩大总体架构授予 Agent Kernel 的业务职责。但它改变了 Agent Kernel 内部对象所有权、系统级调度、安全 Port 和对外能力名称，必须完成 L2 五步评审。

## 4. 身份与租户处理

系统级 `AgentGateway Facade / KernelHost` 消费可信 TenantContext、UserContext 和 RBAC，并编译不可变 `AgentExecutionEnvelope`：

- `AgentExecutionIdentity`：Agent、Run、Parent、Team 和 Role 标识；
- `ExecutionAuthoritySnapshot`：Capability、Tool、Memory、Delegation 和 Sandbox 授权；
- `ResourceBindingSet`：Workspace、MemorySpace、ArtifactStore 和 Secret 的不透明 Handle；
- `OperationContext`：Trace、Correlation、Deadline 和时间上下文。

纯 Kernel 执行身份可审计但不解释 tenantId、userId、组织和 RBAC。真实隔离由 KernelHost 预绑定的 Scoped Adapter 执行。

## 5. 与 ACR-2026-0007 的演进关系

| ACR-2026-0007 活动结论 | ACR-2026-0008 候选结论 |
|---|---|
| Runtime 是唯一聚合根 | Agent Kernel System 是限界上下文；AgentRun 是核心聚合根 |
| Session 管理多次 AgentRun | AgentContextThread 只关联 Root Run 的上下文版本 |
| AgentRun 是 Session 内实体 | AgentRun 独立保护状态、预算、授权引用和终态不变量 |
| Permission 仅同步 Allow/Deny | Permission 支持 Allow/Ask/Deny；Ask 经 ApprovalPort |
| Runtime 绑定租户 | KernelHost 绑定租户和资源；Runtime 消费 AgentExecutionEnvelope |

本 ACR 未批准前，ACR-2026-0007 及其代码继续有效。本候选文档必须明确记录与当前实现的差距，不能提前调整代码。

## 6. 明确不做

- 五步评审通过前不修改运行代码、Schema 和数据库迁移；
- 不把业务 Workflow、业务 ApprovalCase、业务 Conversation 或业务角色放入 Kernel；
- 不默认开放 Shell、Web、MCP、文件写入或任意网络工具；
- 不允许无限递归 Subagent、Detached Subagent 或无角色 Multi-agent；
- 不允许 Agent 直接写共享记忆；
- 不把系统边界实现为单事务巨型聚合；
- 不让 RunScheduler 解释业务优先级或业务流程。

## 7. 五步评审状态

| 步骤 | 状态 | 证据 |
|---|---|---|
| 1. 系统职责、边界与核心对象 | REVIEWING | `docs/design/agent-kernel-v2-architecture-review.md`、候选 Draw.io 五页 |
| 2. 接口与数据契约 | PENDING | 待步骤一明确确认 |
| 3. 生命周期、数据流与韧性 | PENDING | 待步骤二确认 |
| 4. 安全与架构一致性 | PENDING | 待步骤三确认 |
| 5. 基线批准与代码授权 | PENDING | 待步骤四确认 |

## 8. 当前候选图

- [可编辑 Draw.io](../../design/agent-kernel-v2-review.drawio)
- [Agent Kernel System 组件预览](../../design/agent-kernel-v2-components.svg)
- [工具权限预览](../../design/agent-kernel-v2-tool-security.svg)
- [生命周期与共享记忆预览](../../design/agent-kernel-v2-multiagent-memory.svg)
- [核心领域对象 UML 预览](../../design/agent-kernel-v3-domain-classes.svg)
- [系统服务协作 UML 预览](../../design/agent-kernel-v3-service-collaboration.svg)

## 9. 计划验证

- 系统边界被建模为限界上下文而非巨型聚合；
- Run 绕过 Scheduler 直接获取 Runtime Lease 的路径为 0；
- 同一 Run 同时有效的 Runtime Lease 不超过 1；
- Kernel contracts/core 中 Tenant/RBAC 业务字段为 0；
- Agent Runtime 绕过 ToolRuntime/PermissionSystem 的路径为 0；
- Provider 接受缺失、过期、已消费或动作不匹配 Permit 的成功用例为 0；
- Ask 请求与动作摘要、Run、授权版本和 Deadline 不匹配的通过用例为 0；
- Parent 终态后活动 Child 为 0；
- Child 权限、预算和 Deadline 超过 Parent 的成功用例为 0；
- 无角色 Participant 为 0；
- 未授权跨 Agent/Team Memory 读取和写入成功用例为 0；
- 循环依赖、Runtime 原生类型泄漏和业务类型进入 Kernel 均为 0。

## 10. 迁移与回退

步骤五批准后另行制定代码迁移：先引入 AgentControlPlane/RunScheduler 和新契约，再迁移 Runtime/Session/Run 所有权，最后扩展 Permission Ask 与 MemorySpace。任何阶段都必须保留旧入口适配或给出明确的不兼容升级策略。

在代码阶段开始前，回退只需关闭本 ACR、删除候选文档和 Draw.io 增量；活动基线 `AKB-2026-09-03-08` 不受影响。
