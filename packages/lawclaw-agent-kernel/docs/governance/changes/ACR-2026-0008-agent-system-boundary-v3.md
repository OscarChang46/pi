# ACR-2026-0008：Agent Kernel System Boundary V3

- 状态：DRAFT
- 级别：L2（Agent 子系统核心对象、调度、公共接口和安全策略变化）
- 提议人：用户
- 子系统所有者：Agent Kernel
- 批准人：待五步评审完成后确认
- 创建时间：2026-09-03
- 候选基线：AKB-2026-09-03-09
- 父基线：AKB-2026-09-03-08

> 口径说明：本 ACR 取代 ACR-2026-0007 的目标设计口径，但其 Session、FlowEngine、Multi-agent 和本地运行边界已由 [ACR-2026-0009](ACR-2026-0009-session-flow-engine-boundary.md) 修订；候选资料的权威结构由 [ACR-2026-0010](ACR-2026-0010-layered-design-documentation.md) 规定。冲突处以 0009 为准；未经五步批准不得迁移代码或激活候选基线。

## 1. 触发原因

活动基线 `ACR-2026-0007` 把 Runtime 建模为唯一聚合根、Session 建模为 AgentRun 所有者，并让 Runtime 绑定租户。后续评审确认系统边界应是管理多个 Agent、多个 Run、调度、权限、工具、记忆与 Multi-agent 的 Agent Kernel System；单次用户交互和单个 Runtime 都不足以表达系统职责。

本变更先修订候选架构文档，不修改活动基线，也不修改已经合入 `develop` 的运行代码。

## 2. 候选变更

- 把 `Agent Kernel System` 定义为限界上下文，不创建巨型系统聚合根；
- 把 `AgentRun` 定义为核心执行聚合根，Root Run 表示外部执行意图，Child Run 表示受控委派；
- 把 `AgentRuntime` 从聚合根调整为可重建的执行领域服务，由 `AgentRuntimePool` 管理 Worker；
- 增加 `AgentControlPlane`、`RunScheduler`、`AgentRegistry`、`RunRegistry` 和 Runtime Lease；
- 使用 `AgentRunAttempt` 表达一次 Runtime 执行尝试，使用 `AgentLoopStep` 表达 Attempt 内模型、工具、记忆和委派步骤；
- 把 Session 降为可选 `AgentContextThread`，仅关联多个 Root Run 的上下文版本，不拥有调度和权限；
- `PermissionSystem` 统一裁决工具、记忆、委派、Secret、Artifact 和外部资源访问，返回 Allow/Ask/Deny；
- Ask 通过 `ApprovalRequestPort` 向外提交审批请求，由 `ApprovalDecisionPort` 异步回写决定；Kernel 不拥有业务 ApprovalCase、审批人选择和通知；
- `ToolRuntime`、Memory Gateway、Delegation Gateway 等权限执行点只接受匹配的一次性 `ExecutionPermit`；
- `MemorySpace` 成为独立聚合，Agent 只提交 `MemoryCandidate`，共享记忆 append-only；
- Child/Participant Run 统一经过 RunScheduler，不允许 Runtime 递归创建游离执行器；
- 建立领域对象全集、系统服务 C4 组件协作图和六张分领域 UML 类图；`.puml` 是正式图形内容权威源，Draw.io 继续作为历史评审和人工调整画布，本轮不执行批量导入。C4 图中的逻辑组件允许与代码模块非一一映射，但必须在主设计中维护到 V3 服务、Port 和数据所有权的规范映射。
- C4 总览明确分隔 Agent Kernel System、Operations Plane 和 Infrastructure Plane：运维只消费脱敏遥测，基础设施只通过 Port 提供机制，二者均不得反向定义或推进 Agent 领域规则。
- 步骤二使用稳定 `BND-*` 编号固化层间语义，并采用 Local-first 部署档案：CLI 与 L1 进程内调用，Desktop Host 使用 stdio JSONL，L1 内部、L1↔L2、PEP↔PDP 和 L1↔L3 首版均为进程内 Port，L3↔L4 使用只读 Adapter 或本地 JSONL 子进程，Memory 使用本地 SQLite/Artifact Adapter，运维使用本地结构化日志、Trace ID、指标快照和耐久审计；gRPC、Temporal、Event Bus、MicroVM/Vsock、OTLP 集中导出和跨主机 mTLS 均为后续部署档案。L1 仍禁止直接访问 L4。
- 外部协议由薄 `AgentKernelProtocolFacade` 稳定呈现；In-process、JSONL 和未来 HTTP Adapter 只负责编解码、校验和机械映射，不拥有调度、权限、持久化、重试或恢复语义，也不得绕过 `AgentSystemGateway` 访问内部服务。

### 2.1 步骤一候选领域边界

- Agent Kernel System 是唯一限界上下文；Registry、Run、Context、Memory、Permission、Tool 和 Multi-agent 是其内部领域模块，不嵌套新的限界上下文；
- `AgentRun` 是 Run Domain 的聚合根，`AgentRunAttempt`、`AgentLoopStep`、`AgentEvent`、`RuntimeLease` 和 `AgentCheckpoint` 只能通过 Run 聚合维护；
- `AgentRuntime`、`RunScheduler`、`ContextEngine`、`PermissionSystem`、`ToolRuntime` 和 `MultiAgentManager` 是服务，不是聚合根；
- `AgentDefinition`、`MemorySpace`、`ExecutionPermit`、`ToolCall` 和 `MultiAgentRun` 分别保护各自模块的不变量；
- `RouteSnapshot` 由 Run Domain 拥有，Registry 只生成路由候选，避免同一对象出现两个权威所有者；
- 所有跨模块调用必须经过唯一 Port；外部子域只保留调用角色和接口，不复制其对象模型；
- `CapabilityDescriptor` 必须经过定义版本、能力匹配、路由快照和 Run 消费链，不得成为游离描述对象；
- `AgentExecutionEnvelopeRef` 只引用 KernelHost 编译的执行身份、授权和资源绑定，不把 Tenant、User 或 RBAC 业务字段引入 Kernel 领域对象。

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
| 旧的单聚合边界 | Agent Kernel System 是限界上下文；AgentRun 是核心聚合根 |
| Session 管理多次 AgentRun | AgentContextThread 只关联 Root Run 的上下文版本 |
| AgentRun 是 Session 内实体 | AgentRun 独立保护状态、预算、授权引用和终态不变量 |
| Permission 仅同步 Allow/Deny | Permission 支持 Allow/Ask/Deny；Ask 经 ApprovalRequest/Decision Port |
| Runtime 绑定租户 | KernelHost 绑定租户和资源；Runtime 消费 AgentExecutionEnvelope |

ACR-2026-0007 继续解释当前代码基线，但不再作为后续设计文档的目标口径。所有新增或刷新的架构文档必须使用本 ACR 的候选模型，并明确记录与当前实现的差距；五步评审批准前不得调整代码。

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
| 1. 系统职责、边界与核心对象 | REVIEWING | 由 ACR-2026-0009 修订并以 ACR-2026-0010 的三级文档结构重新提交评审 |
| 2. 接口与数据契约 | PENDING | 候选契约位于 `docs/design/contracts/`；步骤一确认前不冻结签名与 DTO |
| 3. 生命周期、数据流与韧性 | PENDING | 待步骤二确认 |
| 4. 安全与架构一致性 | PENDING | 待步骤三确认 |
| 5. 基线批准与代码授权 | PENDING | 待步骤四确认 |

## 8. 当前候选图

- [可编辑 Draw.io](../../design/agent-kernel-v2-review.drawio)
- [核心领域对象 UML 预览](../../design/agent-kernel-v3-domain-classes.svg)
- [系统服务 C4 组件协作预览](../../design/agent-kernel-v3-service-collaboration.svg)
- [C4 层间边界协议预览](../../design/agent-kernel-v3-boundary-protocols.svg)
- [总设计](../../design/agent-kernel-design.md)
- [文档清单](../../design/document-manifest.yaml)
- [七层设计与组件设计](../../design/layers/)
- [边界契约注册表](../../design/contracts/README.md)
- [Local-first 部署档案](../../design/deployment/local-first-profile.md)
- [SFMEA 与系统测试用例清单](../../verification/system-sfmea.md)
- [领域对象目录](../../design/reference/domain-object-catalog.md)
- [正式 PlantUML 权威源目录](../../design/diagrams/)

## 9. 文档阶段验证

已完成的步骤一文档门禁：

- 十九张正式架构图按 system、layers、components、contracts、scenarios 和 deployment 分类维护；`theme.puml` 与 `drawio-theme.puml` 不计入图数量；
- Draw.io 评审画布未作为本轮正式领域图内容源，也未据此声明与 PlantUML 的页面级一致性；
- 领域对象全集、六张分领域类图、系统服务 C4 组件协作图和领域对象目录之间的所有权映射检查通过；
- Markdown 本地引用与架构职责门禁通过。
- 主设计只保存全局边界和不变量；层与组件细节下放到唯一维护文档，并通过清单连接总设计、七层、组件、契约、对象目录、验证和 PlantUML。

步骤二至五仍须验证：

- 系统边界被建模为限界上下文而非巨型聚合；
- Agent Kernel System 是唯一限界上下文，内部 Registry、Run、Context、Memory、Permission、Tool 和 Multi-agent 采用领域模块表达，不嵌套限界上下文；
- 每个领域对象都进入全集，且只有一张分领域图作为详细定义来源；
- 所有跨子域行为调用都经过 Port，外部子域不展开内部对象；
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

在代码阶段开始前，回退应把本 ACR 标记为 `REJECTED` 或 `ABORTED`，并保留候选文档和图作为审计记录；不得删除架构变更历史。活动代码基线 `AKB-2026-09-03-08` 不受影响。
