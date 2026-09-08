---
doc_id: SEC-CMP-001
level: component
layer: Security Plane
component: PermissionDecisionEngine
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ActionProposal 的 Allow Ask Deny 技术判定
parent: SEC-DES-001
interfaces: [PermissionDecisionPort, PolicySnapshotPort]
diagrams: []
supersedes: ["[归档技术审批子系统设计](../../../../governance/archive/design-v3-pre-layering/technical-approval-subsystem-design.md) 中 PermissionSystem 决策部分"]
---

# PermissionDecisionEngine 组件设计

## 职责

PermissionDecisionEngine 是技术权限 PDP。它对不可变 ActionProposal 和已编译策略快照进行确定性判定，返回 Allow、Ask 或 Deny；不调用工具、不创建业务审批、不解释 Token/Tenant/RBAC，也不在执行点消费 Permit。

## 输入、状态与不变量

输入必须引用可信 `ExecutionEnvelopeRef`、策略版本、Run/Agent、动作摘要、资源范围和 Deadline。策略缺失、版本未知、提案不完整或资源超界均默认拒绝。引擎不拥有 RBAC/ABAC 权威库，仅缓存可验证且有界的编译策略快照。

## 判定算法

先验证提案完整性与快照版本，再应用显式拒绝、资源上限和动作风险规则；结果为 Ask 时创建技术审批意图，Allow 时请求签发绑定同一 ActionDigest 的 Permit。相同输入与策略版本必须产生可审计的一致结果。

## 并发与故障

决策可并发执行且无共享可变领域状态；缓存失效不能放宽权限。策略源超时、反序列化失败或审计上下文缺失均失败关闭。重试只能重做判定，不能重复执行动作。

## 契约边界

本文不定义策略 DSL、ActionProposal 字段全集或 Decision DTO。
