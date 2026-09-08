---
doc_id: L3-CMP-003
level: component
layer: L3 Tool Runtime
component: ToolExecutionGuard
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: L3 真实执行点的 Permit 校验消费与失败关闭
parent: L3-DES-001
interfaces: [PermitValidationPort]
diagrams: []
supersedes: ["[归档工具调用子系统设计](../../../../governance/archive/design-v3-pre-layering/tool-call-subsystem-design.md) 中 Permit 校验部分"]
---

# ToolExecutionGuard 组件设计

## 职责

ToolExecutionGuard 位于 L3 到 L4 的最后可信边界，在任何真实执行发生前校验并原子消费 Security Plane 签发的 ExecutionPermit。它不是 PDP，不返回 Allow/Ask/Deny，不读取策略源，也不签发新 Permit。

## 校验不变量

Guard 比对 Permit 与实际 ToolCall 的 ActionDigest、Run、Agent、执行信封引用、工具及版本、资源范围、策略版本和有效期，并确认未消费。实际参数解析或路由解析导致目标变化时校验失败，必须回到 L1 重新提案。

## 并发与原子性

同一 Permit 的并发校验只有一个消费者成功。消费结果耐久化后方可进入 L4；校验服务、存储、时钟或审计不可用时失败关闭。Guard 不通过缓存的历史成功结果绕过当前消费状态。

## 故障与审计

拒绝原因以稳定、脱敏类别返回，且记录 Permit、ToolCall 和动作摘要引用。Permit 已消费但 L4 结果未知时，不恢复 Permit，也不自行重试；ToolCallRuntime 负责状态查询与结果收敛。

## 契约边界

本文不冻结 ValidatePermit DTO、签名方案或审计事件结构。
