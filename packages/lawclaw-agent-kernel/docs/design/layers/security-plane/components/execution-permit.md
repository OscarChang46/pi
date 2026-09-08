---
doc_id: SEC-CMP-002
level: component
layer: Security Plane
component: ExecutionPermit
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 一次性 ExecutionPermit 的生命周期、绑定与消费不变量
parent: SEC-DES-001
interfaces: [PermitValidationPort]
diagrams: []
supersedes: ["[归档技术审批子系统设计](../../../../governance/archive/design-v3-pre-layering/technical-approval-subsystem-design.md) 中 ExecutionPermit 部分"]
---

# ExecutionPermit 组件设计

## 职责

ExecutionPermit 是独立授权聚合，证明某个已判定动作在限定时间、资源和执行上下文内可被执行一次。它不是角色或长期凭证，也不能替代动作执行结果。

## 状态与不变量

Permit 至少在语义上绑定 ActionDigest、Run、Agent、执行信封引用、策略版本、资源范围、有效期和唯一消费标识。生命周期为未消费、已消费、过期或撤销；终态不可回退。任何字段或目标变化都必须重新判定并签发新 Permit。

所有受保护动作均执行一次性消费；只读动作可以使用较低隔离强度，但不能绕过消费约束。校验和消费必须在耐久存储中原子完成，并发调用至多一个成功。

## 操作边界

PermitValidationPort 只验证真实性、绑定、时效、策略版本和消费状态，不重新运行策略规则。验证者不能扩大资源范围、延长有效期或替换 ActionDigest。

## 恢复与故障

执行超时后“Permit 已消费”不等于“动作成功”；调用方必须查询 ToolCall 等权威状态。存储不可用、时钟不可信、验签失败或状态未知时失败关闭，禁止补发等效 Permit 后盲重试副作用动作。

## 契约边界

签名材料、字段类型、持久化 Schema 和错误码留待契约评审。
