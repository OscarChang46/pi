---
doc_id: L3-TOOL_CATALOG_ROUTER-INDEX
level: functional-domain
layer: L3 Tool Runtime
component: ToolCatalogRouter
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 功能域导航与覆盖状态
parent: L3-CMP-001
interfaces: []
diagrams: []
supersedes: []
---

# ToolCatalogRouter 功能域索引

组件唯一交互标准见[组件设计](../tool-catalog-router.md)。本索引仅导航；域只向上引用组件，不互引定义协议，组件正文不反向依赖域。

| 域 | 功能 | 设计 |
|---|---|---|
| CR-01 | 可见目录投影 | [详细设计](functional-domains/catalog-projection/sr-01-catalog-projection.md) |
| CR-02 | 固定路由解析 | [详细设计](functional-domains/frozen-routing/sr-02-frozen-routing.md) |

每域包含场景、字段级工作结构、类图/流程、算法、局部SFMEA及UT/DT/契约等验收设计。所有用例为未实现/未运行；整体范围和外部保证由层设计C01—C07统一规定。
