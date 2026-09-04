---
doc_id: SYS-REF-001
level: reference
layer: Agent Kernel System
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 领域对象标识、类型、生命周期与唯一状态所有者索引
parent: SYS-DES-001
interfaces: []
diagrams: [VIEW-SYS-DOMAIN]
supersedes: [docs/design/agent-kernel-domain-object-catalog.md]
---

# Agent Kernel 领域对象目录

- 对应变更：[ACR-2026-0008](../../governance/changes/ACR-2026-0008-agent-system-boundary-v3.md)、[ACR-2026-0009](../../governance/changes/ACR-2026-0009-session-flow-engine-boundary.md)
- 全集索引：[Agent System 领域对象全集](../diagrams/system/04-agent-system-domain-universe.puml)
- 服务协作索引：[系统服务 C4 组件协作图](../diagrams/system/05-system-service-collaboration.puml)

本文档给每个候选领域对象分配稳定 ID，记录其唯一详细定义来源、生命周期、权威状态和跨边界接口。它是领域对象的目录，不是步骤二的最终 TypeScript 或 JSON Schema 契约。

## 1. 目录使用规则

- `对象 ID` 在对象改名时保持稳定；对象拆分、合并或跨子域迁移必须通过新的 ACR，并保留旧 ID 的演进记录。
- `权威状态/数据所有者` 指唯一有权校验不变量并提交状态变化的聚合或外部信任边界，不等同于持久化介质。
- `主要调用方` 只记录角色或外部子域。调用方不能直接修改对象，必须经过表中的入站 Port。
- `出站接口` 只表达当前子域需要的能力；外部实现不得通过该接口反向定义 Kernel 领域规则。
- 每个对象必须出现在全集图中，且只能由一个组件文档提供行为定义。其他图只能以 `<<reference>>`、字段引用或简化外部子域表示。
- 全集图是对象索引，系统服务 C4 图是层级协作索引；二者不取代层设计或组件设计。完整字段契约留到评审步骤二。

Agent Kernel System 是一个 `<<bounded_context>>`，下列 Registry、Session、Run、Context、Memory、Permission、Tool 和 Structured Subagent 是其内部领域模块。Multi-agent 团队模型属于上层业务编排。类型名称对应 UML stereotype：`聚合根`、`实体`、`值对象`、`引用`、`领域服务`和`应用服务`。

## 2. Agent Registry 领域模块

详细定义：[AgentRegistry](../layers/l1-control/components/agent-registry.md)与[CapabilityRouter](../layers/l1-control/components/capability-router.md)。

| 对象 ID | 对象 | 类型 | 生命周期 | 权威状态/数据所有者 | 主要调用方 | 入站接口 | 出站接口 | 详细图页 |
|---|---|---|---|---|---|---|---|---|
| `AKO-REG-001` | `AgentDefinition` | 聚合根 | Agent 定义级；从创建、发布版本到退役 | AgentRegistry；保护 Agent 标识、活动版本和状态 | AgentSystemGateway、CapabilityRouter、RunScheduler | `AgentRegistryCommandPort`、`AgentRegistryQueryPort` | `AdapterCapabilityPort`（经 Registry 服务） | 06 |
| `AKO-REG-002` | `AgentDefinitionVersion` | 实体 | 定义版本级；发布后不可变，随定义长期保留 | `AgentDefinition` | AgentRegistryService、CapabilityMatcher | 随 `AgentDefinition` 经 Registry Port 访问 | 无直接出站调用 | 06 |
| `AKO-REG-003` | `AgentDescriptor` | 值对象 | 单一定义版本级；随版本冻结 | `AgentDefinitionVersion` | AgentRegistryService、TechnicalRouter | 随 Registry 查询结果返回 | 无直接出站调用 | 06 |
| `AKO-REG-004` | `CapabilityDescriptor` | 值对象 | 单一定义版本级；能力探测变化只能产生新版本或新路由候选 | `AgentDefinitionVersion` 定义；CapabilityMatcher 消费 | CapabilityMatcher、TechnicalRouter、RunScheduler | `AgentRegistryQueryPort.match` | `AdapterCapabilityPort.describeCapabilities/health`（由路由服务调用） | 06 |
| `AKO-REG-005` | `AgentRoleDescriptor` | 值对象 | 定义版本级；表示技术 Persona，不表示团队业务角色 | `AgentDefinitionVersion` | AgentSystemGateway、CapabilityRouter、上层业务编排（只读） | `AgentRegistryCommandPort`、`AgentRegistryQueryPort` | 无直接出站调用 | 06 |

`CapabilityDescriptor` 不是游离能力清单。完整使用链为：`AgentDefinition` → `AgentDefinitionVersion` → `AgentDescriptor` → `CapabilityDescriptor` → `CapabilityMatcher` → `TechnicalRouter` → `RouteProposal` → Run Domain 校验并创建 `RouteSnapshot` → `AgentRun`。`RouteProposal` 是查询 Port DTO，不是领域对象。Adapter 的实时健康信息只参与候选生成，不覆盖已发布定义的权威能力声明。

## 3. Run Domain 领域模块

详细定义：[RunRegistry](../layers/l1-control/components/run-registry.md)、[RunScheduler](../layers/l1-control/components/run-scheduler.md)与[Run 状态图](../diagrams/components/l1-control/04-run-state-machine.puml)。

| 对象 ID | 对象 | 类型 | 生命周期 | 权威状态/数据所有者 | 主要调用方 | 入站接口 | 出站接口 | 详细图页 |
|---|---|---|---|---|---|---|---|---|
| `AKO-RUN-001` | `AgentRun` | 聚合根 | 单次外部请求或受控委派级；从接受到成功、失败或取消 | RunRegistry；保护状态、预算、事件序号、路由和终态不变量 | AgentSystemGateway、SubagentCoordinator、AgentRuntime | `RunCommandPort`、`RunQueryPort`、`ChildRunPort`、`RunExecutionPort` | `RunRepositoryPort`、`DomainEventPort`、`RuntimeDispatchPort`（经 Scheduler） | 07 |
| `AKO-RUN-002` | `AgentRunAttempt` | 实体 | 一次 Runtime 执行尝试；失败恢复创建新 Attempt，不更换 Run ID | `AgentRun` | AgentRuntime、RunRegistry | `RunExecutionPort` | `RunRepositoryPort`、`DomainEventPort` | 07 |
| `AKO-RUN-003` | `AgentLoopStep` | 实体 | Attempt 内步骤级；模型、工具、记忆或委派步骤完成后不可变 | `AgentRunAttempt` | AgentRuntime、RunRegistry | `RunExecutionPort` | `RunRepositoryPort`、`DomainEventPort` | 07 |
| `AKO-RUN-004` | `AgentEvent` | 实体 | Run 事件日志级；提交后不可变，序号在单 Run 内递增 | `AgentRun` | RunRegistry、事件订阅者 | 随各 Run 入站命令产生 | `DomainEventPort`、`RunEventQueryPort` | 07 |
| `AKO-RUN-005` | `RunTrigger` | 值对象 | Run 创建级；创建后冻结 | `AgentRun` | AgentSystemGateway、SubagentCoordinator、恢复扫描器 | `RunCommandPort.submit`、`ChildRunPort.submitChild` | 无直接出站调用 | 07 |
| `AKO-RUN-006` | `RouteSnapshot` | 值对象 | 单次 Run 路由级；创建 Run 时冻结，Run 终态后归档 | `AgentRun` 持有不可变副本；Agent Registry 负责生成规则 | RunScheduler、AgentRun | `AgentRegistryQueryPort.match` 的返回值，经 Run 创建命令写入 | `AdapterCapabilityPort` 仅由 Registry 在生成快照时使用 | 06（07 仅持有引用） |
| `AKO-RUN-007` | `RuntimeLease` | 值对象 | 单次调度租约级；到期、释放或被 fence 后失效 | RunScheduler 签发；`AgentRun` 记录当前有效租约 | RunScheduler、AgentRuntime | 仅由 Scheduler 内部创建 | `RuntimeDispatchPort.dispatch/interrupt` | 07 |
| `AKO-RUN-008` | `RunBudget` | 值对象 | Run 级；Root 创建时冻结，Child 只能取父预算子集 | `AgentRun` | AgentSystemGateway、SubagentCoordinator、AgentRuntime | `RunCommandPort.submit`、`ChildRunPort.submitChild` | 无直接出站调用 | 07 |
| `AKO-RUN-009` | `AgentCheckpoint` | 实体 | Attempt 安全边界级；直到恢复窗口结束或按保留策略清理 | `AgentRunAttempt` | AgentRuntime、恢复扫描器 | `RunExecutionPort` 的执行更新 | `RunRepositoryPort`、Artifact Port（步骤二细化） | 07 |

`RouteSnapshot` 的生成规则属于 Agent Registry，权威副本属于创建后的 `AgentRun`；图 06 是其唯一详细定义来源，图 07 只表达聚合持有关系。Runtime 只能经 `RunExecutionPort` 提交 Attempt、Step 和结果；它不能直接修改调度队列、签发 Lease 或创建 Child Run。

## 4. AgentSession 与 Structured Subagent 领域模块

详细定义：[SessionManager](../layers/l1-control/components/session-manager.md)与[SubagentCoordinator](../layers/l1-control/components/subagent-coordinator.md)；结构化子 Run 关系见[Subagent 生命周期图](../diagrams/components/l1-control/11-subagent-lifecycle.puml)。

| 对象 ID | 对象 | 类型 | 生命周期 | 权威状态/数据所有者 | 主要调用方 | 入站接口 | 出站接口 | 详细图页 |
|---|---|---|---|---|---|---|---|---|
| `AKO-SES-001` | `AgentSession` | 聚合根 | 创建到显式关闭/归档；可关联多个 Run | SessionManager；保护 ContextDelta、Artifact 索引、版本和可选父 Session 血缘 | AgentSystemGateway、FlowEngine、ContextEngine | `SessionCommandPort`、`SessionQueryPort`、`SessionBranchPort` | `SessionRepositoryPort`、`ArtifactPort` | 08/11 |
| `AKO-COL-001` | `AgentExecutionScope` | 聚合根 | Root Run 执行树级；从打开、排空到所有 Child 被处置后关闭 | Structured Subagent 模块；保护父子树、并发数和无孤儿 Child 不变量 | AgentRuntime、SubagentCoordinator | `ChildRunPort` | `RunSchedulerPort`、`PermissionDecisionPort`、`PermitValidationPort` | 11 |
| `AKO-COL-002` | `DelegationPolicy` | 值对象 | Execution Scope 级；创建后冻结 | `AgentExecutionScope` | SubagentCoordinator、PermissionDecisionEngine | `ChildRunPort` | `PermissionDecisionPort` | 11 |
| `AKO-COL-003` | `DelegationSpec` | 值对象 | 单次委派请求级；被接受后作为 Child Run 创建依据 | `ParentChildRunLink` | AgentRuntime、SubagentCoordinator | `ChildRunPort.submitChild` | `RunSchedulerPort.enqueueChild`、`SessionBranchPort.branch` | 11 |
| `AKO-COL-004` | `ParentChildRunLink` | 实体 | Parent/Child 关系级；直到 Join、Cancel 或受控移交完成 | `AgentExecutionScope` | SubagentCoordinator、RunScheduler | `ChildRunPort` | `RunSchedulerPort` | 11 |

Child Run 必须通过 `RunSchedulerPort` 创建，不能由 Runtime 递归实例化执行器。Multi-agent 的 Team、Participant、RoleAssignment、协调、通信和仲裁对象属于上层业务编排，不进入本目录。

## 5. Context 领域模块

详细定义：[ContextEngine](../layers/l1-control/components/context-engine.md)与[SessionManager](../layers/l1-control/components/session-manager.md)。

| 对象 ID | 对象 | 类型 | 生命周期 | 权威状态/数据所有者 | 主要调用方 | 入站接口 | 出站接口 | 详细图页 |
|---|---|---|---|---|---|---|---|---|
| `AKO-CTX-002` | `ContextDelta` | 实体 | 一次 Run 上下文增量级；记录后不可变 | `AgentSession` | AgentRuntime、ContextEngine | `ContextPort` | `ArtifactPort` | 08 |
| `AKO-CTX-003` | `ContextSpec` | 值对象 | 一次 Context 组装请求级 | ContextEngine 调用期间持有 | AgentRuntime、ContextEngine | `ContextPort` | `MemoryQueryPort`、`ArtifactPort` | 08 |
| `AKO-CTX-004` | `ContextItem` | 值对象 | 单次 Snapshot/Frame 组装级；Frame 生成后不可变 | `ContextSnapshot` | ContextEngine、AgentRuntime | `ContextPort` | `ArtifactPort` | 08 |
| `AKO-CTX-005` | `ContextFrame` | 值对象 | 一次模型调用级；不跨步骤原地修改 | ContextEngine 生成，AgentRuntime 只读消费 | AgentRuntime | `ContextPort.assemble` 返回值 | 无直接出站调用 | 08 |
| `AKO-CTX-006` | `ContextSnapshot` | 实体 | 一个 Turn/归约版本级；随 Session 审计保留 | `AgentSession` | ContextEngine、AgentRuntime | `ContextPort` | `ArtifactPort`、`MemoryQueryPort` | 08 |
| `AKO-CTX-007` | `ContextReductionTrace` | 值对象 | 单次上下文归约决策级；生成后不可变 | `ContextSnapshot` | ContextEngine、诊断/审计读取方 | `ContextPort.assemble` | 无直接出站调用 | 08 |

`ContextFrame` 是模型调用投影，不是权威会话状态。权威上下文演进由 `AgentSession`、`ContextDelta` 和持久化的 `ContextSnapshot` 表达；Runtime 崩溃后可以重新组装 Frame。

## 6. Memory 领域模块

详细定义：[MemoryManager](../layers/l1-control/components/memory-manager.md)。

| 对象 ID | 对象 | 类型 | 生命周期 | 权威状态/数据所有者 | 主要调用方 | 入站接口 | 出站接口 | 详细图页 |
|---|---|---|---|---|---|---|---|---|
| `AKO-MEM-001` | `MemorySpace` | 聚合根 | 记忆空间级；独立于单个 Run，可授权给多个 Agent 使用 | MemoryManager；保护版本、作用域和 append-only 不变量 | MemoryManager、ContextEngine（只读）、AgentRuntime（仅提候选） | `MemoryQueryPort`、`MemoryCandidatePort` | `PermissionDecisionPort`、`PermitValidationPort`、`MemoryRepositoryPort`、`ArtifactPort` | 08 |
| `AKO-MEM-002` | `MemoryEntry` | 实体 | 记忆条目级；追加后不可原地覆盖，通过 supersedes 演进 | `MemorySpace` | MemoryManager、ContextEngine（经视图） | `MemoryCandidatePort` | `MemoryRepositoryPort`、`ArtifactPort` | 08 |
| `AKO-MEM-003` | `MemoryVersion` | 值对象 | 每次已提交空间版本级；永久可审计或按策略归档 | `MemorySpace` | MemoryManager、ContextEngine | `MemoryQueryPort` | 无直接出站调用 | 08 |
| `AKO-MEM-004` | `MemoryView` | 值对象 | 一次授权读取级；绑定空间版本，调用结束后可丢弃 | MemoryManager 生成；`MemorySpace` 是底层权威状态 | ContextEngine、AgentRuntime | `MemoryQueryPort` | 无直接出站调用 | 08 |
| `AKO-MEM-005` | `MemoryGrant` | 值对象 | 授权快照有效期级；到期或 authorization epoch 变化后失效 | KernelHost/Permission 策略编译结果；MemoryManager 执行约束 | ContextEngine、MemoryManager、PermissionDecisionEngine | 随 `MemoryQueryPort` / `MemoryCandidatePort` 请求传入 | `PermissionDecisionPort`（敏感读取或提交时复核） | 08 |
| `AKO-MEM-006` | `MemoryCandidate` | 实体 | 一次候选提交级；从 proposed 到 authorized、committed 或 rejected | MemoryManager 管理候选状态；AgentRuntime 只提出内容 | AgentRuntime、SubagentCoordinator、MemoryManager | `MemoryCandidatePort` | `PermissionDecisionPort`、`PermitValidationPort`、`MemoryRepositoryPort`、`ArtifactPort` | 08 |

`MemoryGrant` 是限定 MemorySpace 与操作集合的静态访问范围，不是可执行副作用的一次性凭证，也不替代 `ExecutionPermit`。Agent 和 Runtime 均不能直接修改 `MemorySpace`。

## 7. Permission 领域模块

详细定义：[PermissionDecisionEngine](../layers/security-plane/components/permission-decision-engine.md)、[ExecutionPermit](../layers/security-plane/components/execution-permit.md)、[PEP Enforcement](../layers/security-plane/components/pep-enforcement.md)与[ApprovalBridge](../layers/security-plane/components/approval-bridge.md)。

| 对象 ID | 对象 | 类型 | 生命周期 | 权威状态/数据所有者 | 主要调用方 | 入站接口 | 出站接口 | 详细图页 |
|---|---|---|---|---|---|---|---|---|
| `AKO-PER-001` | `AgentExecutionEnvelope` | 值对象 | Run/Attempt 执行上下文级；编译后不可变，到期或 epoch 变化后失效 | KernelHost 编译；Security Plane 按引用加载只读快照 | AgentSystemGateway、PermissionDecisionEngine、AgentRuntime | `ExecutionEnvelopePort`；`PermissionDecisionPort` 按 Ref 消费 | `PolicySnapshotPort`（验证版本/epoch） | 09 |
| `AKO-PER-002` | `AgentExecutionIdentity` | 值对象 | Envelope 有效期级 | KernelHost；Kernel 只解释 Agent、Run、Parent Run 和不透明 PrincipalRef | PermissionDecisionEngine、审计组件 | 随 Envelope 传入 | 无直接出站调用 | 09 |
| `AKO-PER-003` | `ExecutionAuthoritySnapshot` | 值对象 | 策略快照有效期级；到期或 authorization epoch 变化后失效 | KernelHost/策略边界编译；PermissionDecisionEngine 强制决策范围 | PEP Enforcement、ToolExecutionGuard、MemoryManager、SubagentCoordinator | 随 Envelope 传入 | `PolicySnapshotPort` | 09 |
| `AKO-PER-004` | `ResourceBindingSet` | 值对象 | Envelope 有效期级；Handle 只能解析到预绑定资源 | KernelHost/Scoped Adapter；Kernel 不解释租户资源命名 | PEP Enforcement、ToolCallRuntime、MemoryManager、SecretResolver | 随 Envelope 传入 | 各资源 Port 使用不透明 Handle | 09 |
| `AKO-PER-005` | `ActionProposal` | 值对象 | 单次敏感动作提议级；摘要生成后不可变 | 提议调用方生成，PermissionDecisionEngine 校验 | PEP Enforcement、MemoryManager、SubagentCoordinator、ArtifactExporter、SecretResolver | `PermissionDecisionPort` | `ApprovalRequestPort`（ASK 时） | 09 |
| `AKO-PER-006` | `PermissionDecision` | 值对象 | 单次授权判断级；Allow/Ask/Deny 结果不可变 | PermissionDecisionEngine | PEP Enforcement 与其他权限协调点 | `PermissionDecisionPort`、`ApprovalDecisionPort` 返回值 | `ApprovalRequestPort` 或生成 `ExecutionPermit` | 09 |
| `AKO-PER-007` | `PermissionRequest` | 聚合根 | ASK 审批请求级；从 requested 到 approved、denied 或 expired | PermissionDecisionEngine；只拥有技术审批状态，不拥有业务 ApprovalCase | ApprovalBridge、Backend/业务审批边界 | `PermissionDecisionPort` 间接创建、`ApprovalDecisionPort` 更新、`PermissionQueryPort` 查询 | `ApprovalRequestPort`、`PermissionRepositoryPort` | 09 |
| `AKO-PER-008` | `ApprovalDecision` | 值对象 | 一次外部审批结果级；写入后不可变 | Backend/业务审批边界产生；PermissionRequest 保存不透明决定引用 | ApprovalBridge、PermissionDecisionEngine | `ApprovalDecisionPort` | 无直接出站调用 | 09 |
| `AKO-PER-009` | `ExecutionPermit` | 聚合根 | 单动作、短时、一次性消费级；从 active 到 consumed、revoked 或 expired | ExecutionPermit 组件；以 CAS 持久化并保护单次消费不变量 | PEP Enforcement、ToolExecutionGuard、MemoryManager、SubagentCoordinator | `PermissionDecisionPort` 触发签发、`PermitValidationPort` 校验消费、`PermissionQueryPort` 查询 | `PermissionRepositoryPort`；绑定到 Authorized Request 后才能调用机制 Port | 09 |

纯 Kernel 不拥有 Tenant、User 或 RBAC 模型。`externalPrincipalRef` 是审计用不透明引用，资源隔离依赖 KernelHost 预绑定的 Scoped Adapter，而不是 Runtime 解析租户。

## 8. Tool 领域模块

详细定义：[ToolCatalogRouter](../layers/l3-tool-runtime/components/tool-catalog-router.md)、[ToolCallRuntime](../layers/l3-tool-runtime/components/tool-call-runtime.md)、[ToolExecutionGuard](../layers/l3-tool-runtime/components/tool-execution-guard.md)及[L4 执行层](../layers/l4-execution-runtime/README.md)。

| 对象 ID | 对象 | 类型 | 生命周期 | 权威状态/数据所有者 | 主要调用方 | 入站接口 | 出站接口 | 详细图页 |
|---|---|---|---|---|---|---|---|---|
| `AKO-TOL-001` | `ToolDefinition` | 聚合根 | 工具定义级；从注册版本到退役 | ToolCatalogRouter；保护活动版本、Schema 和风险属性 | ToolCatalogRouter、管理面（步骤二定义） | `ToolRuntimePort`；管理入站 Port 留步骤二 | `ToolProviderPort` | 10 |
| `AKO-TOL-002` | `ToolDescriptor` | 值对象 | 工具版本级；版本发布后不可变 | `ToolDefinition` | L1 PEP Enforcement、AgentRuntime、ToolCatalogRouter、PermissionDecisionEngine | L1 经 `ToolRuntimePort` 获取并冻结 `ToolCatalogSnapshotRef`，再通过 `RuntimeControlPort` 提供给 Runtime | 无直接出站调用 | 10 |
| `AKO-TOL-003` | `ToolCall` | 聚合根 | 单次工具调用级；从 proposed、authorized、executing 到终态 | Tool Domain；ToolCallRuntime 是唯一状态协调入口，Run Domain 仅接收事件 | L1 PEP Enforcement、ToolCallRuntime | `ToolRuntimePort` | `ToolCallRepositoryPort`、`ToolEventPort`、`PermitValidationPort`、`ToolProviderPort`、`SandboxPort` | 10 |
| `AKO-TOL-004` | `ToolCallCandidate` | 值对象 | 一次模型工具请求级；参数与资源声明摘要冻结 | AgentRuntime 产生的规范化候选；尚不是 ToolCall 权威状态 | AgentRuntime 产生；L1 RunRegistry 与 PEP Enforcement 消费 | `RuntimeEventPort` 发布并返回 L1 | `PermissionDecisionPort` | 10 |
| `AKO-TOL-005` | `AuthorizedToolRequest` | 值对象 | 单次已授权 Provider 请求级；随 Permit 消费后失效 | ToolCallRuntime/ToolExecutionGuard | ToolExecutionGuard、L4 ToolProviderAdapter | `ToolRuntimePort` 内部形成 | `ToolProviderPort` | 10 |
| `AKO-TOL-006` | `ToolResult` | 值对象 | 单次 ToolCall 结果级；终态后不可变 | ToolCallRuntime；大结果内容由 ArtifactStorage 保存 | AgentRuntime、RunRegistry | `ToolProviderPort` 或 `SandboxPort` 返回 | `ToolEventPort`、`ArtifactPort` | 10 |
| `AKO-TOL-007` | `SandboxProfile` | 值对象 | 工具定义版本级；随 ToolDescriptor 绑定 | Tool Domain 定义隔离要求；L4 实现受控执行语义 | ToolExecutionGuard、L4 SandboxRuntime | 随 ToolDescriptor 解析 | `SandboxPort` | 10 |
| `AKO-TOL-008` | `SandboxRequest` | 值对象 | 单次工具执行级；Sandbox 结束后失效 | ToolExecutionGuard；必须是 Permit 权限子集 | L4 SandboxRuntime | ToolExecutionGuard 内部生成 | `SandboxPort` | 10 |

`ToolCallCandidate` 不能直接进入 L3 或 Provider。合法路径是：L2 Candidate → `RuntimeEventPort` → L1 PEP → `PermissionDecisionPort` → `ExecutionPermit` → L3 `ToolRuntimePort` → `PermitValidationPort` → `AuthorizedToolRequest` → L4 `ToolProviderPort` / `SandboxPort`。Provider 不得在执行中请求 Permit 之外的新能力，L3 Guard 不进行第二次 Allow/Ask/Deny 裁决。

## 9. 共享技术值对象

共享对象在[领域对象全集](../diagrams/system/04-agent-system-domain-universe.puml)中定义身份，不属于任何业务聚合。步骤二会为其建立完整公共契约；在此之前，组件文档只可引用，不能复制定义。

| 对象 ID | 对象 | 类型 | 生命周期 | 权威状态/数据所有者 | 主要调用方 | 入站接口 | 出站接口 | 详细图页 |
|---|---|---|---|---|---|---|---|---|
| `AKO-SHR-001` | `ArtifactReference` | 值对象 | 被引用数据的保留期；引用本身不可变 | Artifact Infrastructure 保存内容；领域对象保存不透明引用 | Session、Context、Memory、Tool、Subagent 模块 | 各子域入站 Port 中作为字段传递 | `ArtifactPort` | 04（步骤二补契约） |
| `AKO-SHR-002` | `OperationContext` | 值对象 | 一次操作传播链级；Deadline 到期后终止 | 调用入口创建；各层只派生 Trace/Span，不改写身份 | 所有 Application/Domain Service、Observability | 随所有跨边界 Port 传播 | Observability Port、Clock Port（步骤二细化） | 04（步骤二补契约） |
| `AKO-SHR-003` | `TimeContext` | 值对象 | 一次操作或 Run 级；时区和历法解释规则冻结 | Time Infrastructure/调用入口生成 | Runtime、Scheduler、Context、Permission | 随 OperationContext 或命令传入 | Clock Port | 04（步骤二补契约） |
| `AKO-SHR-004` | `TimePoint` | 值对象 | 永久值语义；以绝对时间保存，展示时才应用时区 | Clock Port 生成；领域对象按值保存 | 所有含 Deadline、过期时间和事件时间的对象 | 各业务 Port 的 DTO 字段 | Clock Port | 04（步骤二补契约） |
| `AKO-SHR-005` | `CommandReceipt` | 值对象 | 幂等命令保留期 | RunRegistry 命令事务；不属于 `AgentRun` 聚合 | AgentSystemGateway、RunRegistry | `RunCommandPort`、`ChildRunPort` | `CommandReceiptRepositoryPort` | 07 |
| `AKO-SHR-006` | `AgentExecutionEnvelopeRef` | 引用 | Envelope 有效期；只要 Run、ToolCall 或权限记录仍需审计就保留稳定引用 | KernelHost 持有 Envelope 权威内容；Kernel 聚合只冻结不透明 Ref | AgentSystemGateway、Run、Permission、Tool、Subagent 模块 | 随所有敏感入站命令传播 | `ExecutionEnvelopePort.load` | 04（09 定义加载语义） |

## 10. 领域服务与应用服务引用

这些对象协调聚合和 Port，不是聚合根，也不持有跨 Run 的隐藏权威状态。服务的高层关系以[系统服务 C4 组件协作图](../diagrams/system/05-system-service-collaboration.puml)为索引；完整签名留到评审步骤二。

| 服务 ID | 服务 | 类型 | 生命周期 | 管理或调用的权威对象 | 主要入站 Port | 主要出站 Port |
|---|---|---|---|---|---|---|
| `AKS-SYS-001` | `AgentSystemGateway` | 入站门面 | Kernel Host 进程级 | 不直接拥有聚合；路由命令和查询 | 外部公开接口 | Registry、Session、Run 相关 Port |
| `AKS-SYS-003` | `FlowEngine` | 无状态领域服务 | Host 进程级；首版一个实例 | 不拥有权威状态；读取规范化快照与事件计算下一动作 | `FlowAdvancePort` | 无直接 I/O Port；只返回命令意图 |
| `AKS-RES-001` | `ResourceManager` | L1 资源协调服务 | Host 进程级 | 当前执行槽和临时资源占用；不拥有 Run 状态 | `ExecutionResourcePort` | `ExecutionCapacityPort`、`ProcessPort`、`ClockPort` |
| `AKS-REG-001` | `AgentRegistry` | 领域服务 | 进程级，可重建 | `AgentDefinition` | `AgentRegistryCommandPort`、`AgentRegistryQueryPort` | `AdapterCapabilityPort` |
| `AKS-RUN-001` | `RunScheduler` | 领域服务 | 进程级，可重建调度器 | 可运行队列投影与 RuntimeLease 规则；AgentRun 状态仍归 RunRegistry | `RunSchedulerPort` | `RunQueryPort`、`RunExecutionPort`、`RuntimeDispatchPort`、`ExecutionResourcePort` |
| `AKS-RUN-002` | `RunRegistry` | 领域服务 | 进程级，可由 Run Repository 重建索引 | AgentRun 查询索引、状态变更、事件 Journal 和 Lease/fence 协作 | `RunCommandPort`、`RunQueryPort`、`RunExecutionPort`、`RuntimeEventPort`、`RunEventQueryPort` | `RunRepositoryPort`、`DomainEventPort` |
| `AKS-RUN-003` | `RuntimePool` | 领域服务 | Kernel Host 进程级 | Worker 健康和容量，不拥有 AgentRun | `RuntimeDispatchPort` | `RuntimeControlPort`、`RuntimeHealthPort`、`ProcessPort`、`TransportPort` |
| `AKS-EXE-001` | `AgentRuntime` | 可重建执行领域服务 | Worker/组件级；连续执行多个 Run | 不拥有长期权威状态；消费 `AgentRunAttempt` 和 Envelope | `RuntimeControlPort` | `RuntimeEventPort`、`AgentAdapterPort`；工具与委派候选必须返回 L1 |
| `AKS-CTX-001` | `ContextEngine` | 领域服务 | 进程级，可重建 | `AgentSession`、`ContextSnapshot` | `ContextPort` | `MemoryQueryPort`、`ArtifactPort` |
| `AKS-MEM-001` | `MemoryManager` | 应用服务 | 进程级，可重建 | `MemorySpace` | `MemoryQueryPort`、`MemoryCandidatePort` | `PermissionDecisionPort`、`PermitValidationPort`、`MemoryRepositoryPort`、`ArtifactPort` |
| `AKS-PER-001` | `PermissionDecisionEngine` | 领域服务 | 进程级，可重建；PermissionRequest 与 Permit 账本需持久化 | `PermissionRequest`；按 ExecutionPermit 组件规则签发授权 | `PermissionDecisionPort`、`ApprovalDecisionPort`、`PermissionQueryPort` | `ApprovalRequestPort`、`PolicySnapshotPort`、`PermissionRepositoryPort` |
| `AKS-TOL-001` | `ToolCallRuntime` | 应用服务 | 进程级，可重建；ToolCall 状态持久化 | `ToolDefinition`、`ToolCall` | `ToolRuntimePort` | `PermitValidationPort`、`ToolProviderPort`、`SandboxPort`、`ArtifactPort`、`ToolEventPort`；不再次请求 PDP 决策 |
| `AKS-COL-001` | `SubagentCoordinator` | 应用服务 | 进程级，可重建 | `AgentExecutionScope`、`ParentChildRunLink` | `ChildRunPort` | `RunSchedulerPort`、`SessionBranchPort`、`PermissionDecisionPort`、`PermitValidationPort` |

## 11. ExecutionPermit 命名收敛

`ExecutionPermit` 是系统内唯一表示“某个具体动作可以实际执行”的授权制品。不得增加第二套通用授权对象，也不得把 `ApprovalDecision`、`PermissionDecision` 或静态能力声明直接传给 Provider、Sandbox、Secret、Memory commit 或委派执行点。

| 概念 | 允许表达的语义 | 是否可直接触发执行 |
|---|---|---|
| `CapabilityGrant`、`ToolGrant`、`DelegationGrant` | `ExecutionAuthoritySnapshot` 中预编译的最大能力范围 | 否 |
| `MemoryGrant` | 特定 MemorySpace、操作集合和有效期的访问范围 | 否 |
| `PermissionDecision` | 对 ActionProposal 的 Allow/Ask/Deny 裁决结果 | 否；Allow 必须签发 Permit |
| `ApprovalDecision` | 外部审批边界对既有 ActionProposal 的同意或拒绝证据 | 否；只能维持或缩小请求，不能扩权 |
| `ExecutionPermit` | 绑定 Run、Agent、ActionDigest、资源范围、epoch 和期限的一次性执行授权 | 是，且必须由对应执行点消费 |
| `AuthorizedToolRequest` | Candidate 与有效 Permit 绑定后的工具调用封装 | 仅可进入匹配的 `ToolProviderPort` |

Permit 的资源、预算、Deadline 和动作摘要必须是原始 `ActionProposal`、执行信封与父级授权的交集。任何不匹配、过期、已消费或 authorization epoch 失效的 Permit 都必须拒绝。

## 12. 跨子域引用与边界治理

1. 跨子域调用必须经过明确 Port。领域对象不能直接调用外部聚合、Repository、Adapter 或 Infrastructure。
2. 外部子域在分领域图中只显示 `<<external_subdomain>>` 方框、调用角色和接口名；不得复制其内部字段、方法或聚合关系。
3. 其他子域拥有的类型统一标为 `<<reference>>`，只保存稳定 ID、版本、摘要或不透明 Handle；不得共享可变对象引用。
4. Snapshot 表示调用时冻结的事实。Registry 的后续定义、策略或健康变化不得静默改写既有 `RouteSnapshot`、`ExecutionAuthoritySnapshot`、`ContextSnapshot` 或 `MemoryView`。
5. `AgentRuntime`、RunScheduler、ContextEngine、PermissionDecisionEngine 等服务不是聚合根。服务崩溃后应能从权威聚合、事件或租约状态重建。
6. Agent Kernel 不解释 Tenant、User、组织或 RBAC。KernelHost 把可信身份和资源范围编译成 `AgentExecutionEnvelope`；Kernel 只使用不透明 PrincipalRef、Handle 和 Scoped Adapter。
7. `RunSchedulerPort` 是 Root/Child Run 的唯一调度入口；Runtime 不得签发 Lease、直接修改队列或递归创建游离 Runtime。
8. `PermissionDecisionPort` 是敏感动作的统一裁决入口；`PermitValidationPort` 是执行前校验与原子消费入口。二者共同构成权限边界，执行点不得绕过任一阶段。
9. Agent 只能提交 `MemoryCandidate`，不能直接写 `MemorySpace`；跨 Agent 读取只能使用绑定版本和授权范围的 `MemoryView`。
10. Backend/业务审批只通过 `ApprovalRequestPort` 接收请求、通过 `ApprovalDecisionPort` 回写裁决；它不进入 Permission 聚合，也不把业务 `ApprovalCase`、审批人或通知规则带入 Kernel。
11. Infrastructure Port 只提供存储、进程/容器、Artifact、Secret、Clock 和通信机制，不包含 Sandbox 受控执行语义、Agent 路由、业务工作流或权限策略；Sandbox 执行语义由 L4 拥有。
12. 当前因 ACR-2026-0009 回到评审步骤一。层间协议候选见[边界契约注册表](../contracts/README.md)；表中 Port、DTO、错误码、回调方式和事务语义仍须在步骤二确认，未经确认不得固化为运行代码。

## 13. 完整性检查清单

- 全集图中的领域对象均有唯一 `AKO-*` ID；领域服务均有唯一 `AKS-*` ID。
- 每个对象只有一个详细定义图；跨图出现时使用引用或不可变副本语义。
- `CapabilityDescriptor` 同时具有定义者、匹配者、路由消费者和 Run 落点。
- `AgentRuntime` 不拥有 Run、Session、租户或权限权威状态。
- Runtime 绕过 Scheduler、工具绕过 Permission、Agent 直接写共享记忆和孤儿 Child Run 的合法路径均为零；Kernel 内 Multi-agent Team/Participant/Role 类型为零。
- Kernel 对象中不存在 Tenant、User、RBAC、Workflow、业务 Conversation 或业务 ApprovalCase 字段。
- 第二套通用执行授权对象数量为零；所有实际执行授权收敛为 `ExecutionPermit`。
