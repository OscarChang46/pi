---
doc_id: L4-CMP-001
level: component
layer: L4 Execution Runtime
component: ToolProviderAdapter
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 业务 Tool Provider 私有协议隔离与规范结果映射
parent: L4-DES-001
interfaces: [ToolProviderPort]
diagrams: []
supersedes: ["[归档工具调用子系统设计](../../../../governance/archive/design-v3-pre-layering/tool-call-subsystem-design.md) 中 ToolProviderPort 实现部分"]
---

# ToolProviderAdapter 组件设计

## 职责

ToolProviderAdapter 把 L3 的规范化、已授权执行请求映射为远程或进程内业务 Tool Provider 的私有协议，并将结果、状态和故障归一化。Provider 业务类型、SDK、认证机制和传输细节不得越过 `ToolProviderPort`。

## 状态与不变量

Adapter 只持有单次调用的传输状态、Provider 请求标识和有界缓冲。路由、工具版本和动作参数由 L3 冻结；Adapter 不改写目标、不扩大资源范围、不调用 PDP，也不能访问 Run/Permit Repository。

## 执行与状态查询

调用服从端到端 Deadline、取消和输出上限。对可能有副作用的 Provider，Adapter 应传播稳定调用标识并支持能力允许时的状态查询；连接断开后先报告未知，不自动换 Provider 或盲重试。

## Secret 与故障隔离

凭证由 Scoped Secret/Transport Adapter 在边界内解析，不写入请求领域数据、日志或 Artifact。认证失败、限流、协议错误和响应超限映射为稳定故障类别，原生异常仅以脱敏详情引用保存。

## 契约边界

Provider 协议、认证字段、重试参数和结果 DTO 留待具体 Adapter 与 contracts 评审。
