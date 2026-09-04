> **非规范性归档：** 已由 L1 的 [AgentRegistry](../../../design/layers/l1-control/components/agent-registry.md)与[CapabilityRouter](../../../design/layers/l1-control/components/capability-router.md)取代。

# Agent Registry、能力与技术路由子系统设计

> 状态：`ACR-2026-0008` 五步评审步骤二候选
> 返回主文档：[5 领域对象与聚合边界](agent-kernel-design.md#5-领域对象与聚合边界)
> 权威类图：[06 Agent 定义、能力与技术路由](diagrams/domain/06-agent-definition-capability-routing.puml)
> 对象目录：[Agent Registry 领域模块](agent-kernel-domain-object-catalog.md#2-agent-registry-领域模块)

## 1. 设计结论

Agent Registry 管理可版本化的 Agent 技术定义，负责能力匹配和技术路由候选生成。它不执行 Agent、不解释业务优先级，也不直接创建 `AgentRun`。

`CapabilityDescriptor` 不是游离对象，完整使用链为：

```text
AgentDefinition
  → AgentDefinitionVersion
  → AgentDescriptor
  → CapabilityDescriptor
  → CapabilityMatcher
  → TechnicalRouter
  → RouteProposal
  → Run Domain 创建 RouteSnapshot
  → AgentRun
```

## 2. 聚合边界

`AgentDefinition` 是聚合根，拥有发布后的版本历史。`AgentDefinitionVersion` 发布后不可变，并组合 `AgentDescriptor`、`CapabilityDescriptor` 与 `AgentRoleDescriptor`。

Registry 只生成 `RouteProposal`。`RouteProposal` 是查询 DTO，不是领域对象；Run Domain 校验候选后创建并唯一拥有冻结的 `RouteSnapshot`，从而避免 Registry 与 Run 同时拥有路由权威状态。

## 3. Port 与调用方

| 调用方 | Port | 关键语义 |
|---|---|---|
| Agent Control Plane | `AgentRegistryCommandPort` | 发布版本、退役定义；不修改已发布版本 |
| RunScheduler | `AgentRegistryQueryPort` | 按能力要求产生路由候选 |
| Registry → Agent Adapter | `AdapterCapabilityPort` | 查询 Adapter 实时能力和健康，不泄漏私有类型 |

## 4. 路由不变量

- Agent 定义、模型配置、工具集合和上下文策略必须版本化；
- 健康状态只能影响新路由候选，不能静默修改运行中 Run 的 `RouteSnapshot`；
- 路由选择只解释技术能力，不解释法律业务、业务优先级或结果采纳；
- Adapter、Provider 和 Pi 原生类型不得进入公共 Descriptor；
- `AgentRoleDescriptor` 只描述单个 Agent 的技术 Persona；上层团队角色不得写入 Registry 聚合。

## 5. Local-first 实现边界

首版可以使用进程内 Registry 和本地配置/SQLite Adapter，不要求独立注册中心或服务发现。只有多个 Kernel 实例需要共享定义和路由健康时，才评审远程 Registry。

## 6. 关联设计

- Run 如何冻结路由见[Run、调度与 Runtime 子系统](run-scheduling-runtime-subsystem-design.md)。
- 上层 Multi-agent 可以选择不同 AgentDefinition，但 Kernel 不拥有团队角色绑定；边界见[AgentSession、FlowEngine 与本地资源调度](session-flow-engine-resource-subsystem-design.md)。
- Pi 的能力适配边界见[主设计第 15 节](agent-kernel-design.md#15-pi-adapter运维与基础设施)。
