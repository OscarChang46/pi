---
doc_id: SEC-CMP-004
level: component
layer: Security Plane
component: ApprovalBridge
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Kernel Ask 状态与外部技术审批通道的异步桥接
parent: SEC-DES-001
interfaces: [ApprovalRequestPort, ApprovalDecisionPort]
diagrams: []
supersedes: ["[归档技术审批子系统设计](../../../../governance/archive/design-v3-pre-layering/technical-approval-subsystem-design.md) 中外部审批桥接部分"]
---

# ApprovalBridge 组件设计

## 职责

ApprovalBridge 把 Kernel 的 Ask 判定和技术 PermissionRequest 交给 Kernel 外部审批能力，并将经过认证、可关联的决定带回 PermissionDecisionEngine。它不选择审批人、不解释业务审批流程、不发送业务通知，也不执行受保护动作。

## 状态与不变量

Kernel 只保存技术请求标识、ActionDigest、截止时间、当前状态和外部关联引用。等待期间 Runtime/同步 RPC 不得被占用。外部决定必须绑定同一请求、动作摘要和策略上下文；迟到、重复、无法认证或已终结决定不得改变状态。

## 生命周期

Ask 持久化后异步提交；桥接器记录提交回执并允许幂等重投。外部 Allow 回来后仍需签发新的短时 Permit，外部响应本身不是 Permit。Deny、过期或取消使请求收敛，不能通过重放旧响应恢复。

## 故障与安全

通道超时保持等待或按 Deadline 过期，不默认允许。回调身份由 KernelHost/Transport 边界验证后再进入 Kernel，原始 User Token 不得传入本组件。日志与通知仅包含脱敏摘要和引用。

## 契约边界

外部审批协议、回调 DTO、通知渠道和业务审批模型不在本文冻结。
