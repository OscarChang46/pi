---
doc_id: L3-TOOL_CALL_RUNTIME-INDEX
level: functional-domain
layer: L3 Tool Runtime
component: ToolCallRuntime
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 功能域导航与覆盖状态
parent: L3-CMP-002
interfaces: []
diagrams: []
supersedes: []
---

# ToolCallRuntime 功能域索引

组件唯一交互标准见[组件设计](../tool-call-runtime.md)。本索引仅导航；域只向上引用组件，不互引定义协议，组件正文不反向依赖域。

| 域 | 功能 | 设计 |
|---|---|---|
| RT-01 | 调用准备与派发 | [详细设计](functional-domains/invocation-dispatch/sr-01-invocation-dispatch.md) |
| RT-02 | 结果与取消处理 | [详细设计](functional-domains/outcome-cancellation/sr-02-outcome-cancellation.md) |

每域包含场景、字段级工作结构、类图/流程、算法、局部SFMEA及UT/DT/契约等验收设计。所有用例为未实现/未运行；整体范围和外部保证由层设计C01—C07统一规定。
