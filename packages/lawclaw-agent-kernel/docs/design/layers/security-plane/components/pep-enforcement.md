---
doc_id: SEC-CMP-003
level: component
layer: Security Plane
component: PEP Enforcement
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 权限强制点分工、L1 决策协调与执行点 Permit 强制
parent: SEC-DES-001
interfaces: [PermissionDecisionPort, PermitValidationPort, BND-L13-001]
diagrams: []
supersedes: ["[归档技术审批子系统设计](../../../../governance/archive/design-v3-pre-layering/technical-approval-subsystem-design.md) 中 PEP 部分"]
---

# PEP Enforcement 组件设计

## 职责分工

PEP 是跨组件强制模式而非新的规则聚合。L1 PEP 冻结动作提案、请求 PDP 判定、处理 Ask/Deny，并只向下游提交带 Permit 的已授权动作。真实执行点的 Guard 在副作用发生前验证并消费 Permit。

## 不变量

- L2 只产生候选，不接触 Permit，也不直接调用 L3。
- L1 不以“已请求判定”替代真实执行点检查。
- L3 Guard 只校验与消费 Permit，不再次调用 PDP，不得产生第二套 Allow/Ask/Deny。
- ActionProposal 与实际执行参数的摘要必须相同；任何变更返回 L1 重新判定。
- 无 Permit、过期、已消费、策略版本不匹配或验证状态未知均拒绝执行。

## 控制流与 TOCTOU

判定完成后，L1 以稳定动作引用和 Permit 调用执行层；执行层在最靠近 Provider/Sandbox 的位置完成原子消费，再立即执行完全相同的动作。资源解析结果若改变实际目标，必须中止而非静默重绑。

## 故障与审计

每次判定、审批转移、校验、消费和拒绝都产生脱敏安全审计。审计与消费无法满足规定的耐久性时，高风险动作失败关闭。重复请求通过动作与 Permit 标识去重。

## 契约边界

本组件不冻结调用签名或审计事件字段，仅定义分工和强制顺序。
