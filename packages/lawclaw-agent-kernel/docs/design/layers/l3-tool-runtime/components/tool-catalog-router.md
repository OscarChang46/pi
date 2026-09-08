---
doc_id: L3-CMP-001
level: component
layer: L3 Tool Runtime
component: ToolCatalogRouter
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ToolDefinition 目录投影、可见性过滤与冻结路由快照
parent: L3-DES-001
interfaces: [ToolRuntimePort]
diagrams: []
supersedes: ["[归档工具调用子系统设计](../../../../governance/archive/design-v3-pre-layering/tool-call-subsystem-design.md) 中工具目录与路由部分"]
---

# ToolCatalogRouter 组件设计

## 职责

ToolCatalogRouter 维护版本化 ToolDefinition 目录投影，根据 L1 提供的技术执行范围生成可见工具集合和冻结路由快照。它描述“有哪些候选工具和如何定位执行端”，不判断某次调用是否获准，也不执行工具。

## 状态与不变量

目录条目包含稳定工具标识、版本、能力描述、参数契约引用、风险标签、执行类型和 Provider/Sandbox 路由引用。运行中的 Attempt 使用不可变快照；目录热更新不能改变已派发 Attempt 的工具含义。Secret、业务身份和 Provider 私有句柄不进入公开快照。

## 入站与出站

L1 查询作用域化目录并获得 `ToolCatalogSnapshotRef`；ToolCallRuntime 使用同一快照解析冻结路由。L2 只接收 L1 转交的目录快照，不直接查询本组件。

## 并发与故障

目录发布采用新版本原子可见，读者不会观察半更新。工具版本缺失、路由失效或快照过期时拒绝执行，不回退到同名其他版本。Provider 健康可以影响新快照选择，但不能改写已冻结授权目标。

## 契约边界

本文不冻结 ToolDefinition/Schema DTO、匹配算法权重或注册协议。
