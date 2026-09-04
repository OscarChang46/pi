---
doc_id: L3-DES-001
level: layer
layer: L3 Tool Runtime
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 工具目录、ToolCall 生命周期、Permit 强制与 L4 协调
parent: SYS-DES-001
interfaces: [BND-L13-001, BND-L34-001]
diagrams: []
supersedes: ["[归档工具调用子系统设计](../../../governance/archive/design-v3-pre-layering/tool-call-subsystem-design.md) 中 ToolRuntime 部分"]
---

# L3 Tool Runtime 层设计

## 1. 职责与边界

L3 是 Kernel 内工具执行的唯一协调入口，拥有 ToolDefinition 目录投影和 ToolCall 执行聚合，校验并消费已由 Security Plane 签发的 Permit，选择 L4 Provider 或 Sandbox 路径并归一化结果。

L3 不进行 Allow/Ask/Deny 权限裁决，不解释 Token/Tenant/RBAC，不直接实现容器、进程或远程 Provider 协议。L2 不得调用 L3；只有 L1 PEP 可以提交已授权动作。

## 2. 组件

| 组件 | 唯一职责 | 详细设计 |
|---|---|---|
| ToolCatalogRouter | 提供版本化、作用域化的可见工具目录与路由快照 | [ToolCatalogRouter](components/tool-catalog-router.md) |
| ToolCallRuntime | 管理 ToolCall 生命周期并协调一次有界执行 | [ToolCallRuntime](components/tool-call-runtime.md) |
| ToolExecutionGuard | 在真实执行点校验并消费 Permit | [ToolExecutionGuard](components/tool-execution-guard.md) |

## 3. 依赖规则

合法路径是 `L2 Candidate → L1 PEP/PDP → L3 → L4`。L1 可查询可见工具目录快照和提交已授权 ToolCall；L3 经 `ToolProviderPort` 或 `SandboxPort` 使用 L4。禁止 L2→L3、L1→L4、Provider 反向访问 Kernel 聚合，以及任何无 Permit 的受保护执行路径。

## 4. 主控制流

1. L1 在派发 Attempt 前从 L3 取得并冻结可见 ToolCatalogSnapshotRef。
2. L2 依据该快照产生 ToolCallCandidate 并返回 L1。
3. L1 冻结实际动作并完成安全判定，将 Permit 与动作引用提交 L3。
4. ToolCallRuntime 创建或恢复 ToolCall；ToolExecutionGuard 校验实际参数摘要并原子消费 Permit。
5. L3 依据冻结路由选择远程 Tool Provider 或一次性 Sandbox 执行。
6. L4 返回有界结果或状态引用；L3 归一化并耐久记录终态，再把结果引用交回 L1。

## 5. 数据、重试与故障隔离

ToolCall 是独立聚合，记录动作摘要、路由版本、Permit 引用、执行尝试和结果引用。副作用调用超时后不得盲重试；先查询已知状态，无法确认则标记未知并由 L1 决定。目录、参数、输出、日志和执行时间均有界，Secret 不进入 ToolCall 领域数据。

## 6. 非目标与评审边界

L3 不拥有具体工具业务逻辑、沙箱机制、业务补偿或 Multi-agent 协作。本层只收敛接口所有权和安全顺序，不冻结 DTO、错误码、Provider 协议或 Tool Schema 格式。
