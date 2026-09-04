---
doc_id: L3-CMP-002
level: component
layer: L3 Tool Runtime
component: ToolCallRuntime
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ToolCall 聚合生命周期、执行协调与结果归一化
parent: L3-DES-001
interfaces: [ToolRuntimePort, ToolProviderPort, SandboxPort]
diagrams: []
supersedes: ["[归档工具调用子系统设计](../../../../governance/archive/design-v3-pre-layering/tool-call-subsystem-design.md) 中 ToolCall 生命周期部分"]
---

# ToolCallRuntime 组件设计

## 职责

ToolCallRuntime 接受 L1 提交的已授权工具动作，创建或恢复 ToolCall，调用 Guard 强制 Permit，依据冻结路由选择 L4 执行能力，并持久化规范结果。它不裁决权限、不实现 Provider 或 Sandbox，也不决定业务补偿。

## 状态与不变量

ToolCall 独立记录调用标识、Run/Attempt 引用、ActionDigest、目录与路由版本、Permit 引用、执行状态、尝试摘要和结果/故障引用。合法生命周期覆盖待执行、执行中、成功、失败、取消和结果未知；终态不可因重复消息回退。

Guard 成功前不得触发任何 Provider/Sandbox 副作用。实际参数、目标或路由与 Permit 绑定不一致时必须中止并返回 L1 重新判定。

## 执行算法

先以幂等键获取或创建 ToolCall，再解析冻结路由并调用 Guard；消费成功后将同一动作提交单一 L4 路径。执行结果先耐久记录再通知 L1。大输出写入 ArtifactStorage，只在事件中传播有界摘要与引用。

## 重试、取消与恢复

只读且 Provider 明确幂等的瞬时失败可在 Deadline 内有限重试。副作用调用超时或通道中断时先查询 Provider/执行状态；不可确认则进入结果未知，禁止自动重放。取消阻止新执行，但已发生的外部副作用不以取消回执推定撤销。

## 契约边界

ToolCall DTO、状态枚举、幂等键格式、超时与错误码由 contracts 定义，本文只规定语义。
