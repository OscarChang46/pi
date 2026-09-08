---
doc_id: OPS-CMP-004
level: component
layer: operations-plane
component: SecurityAudit
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SecurityAudit 的状态、生命周期、算法与 Port 使用"
parent: OPS-DES-001
interfaces: [BND-OPS-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# SecurityAudit 组件设计

## 职责与权威状态

保存 Permit 决策/消费、审批、Sandbox 越权、SecretHandle 使用摘要等安全事实。权威状态是按 `auditEventId` 去重的 append-only Journal；禁止更新或删除既有事实。

## 写入规则

事件只含稳定主体/动作引用、策略 epoch、结果、时间和因果链，不含 Secret、Token、原始参数、正文或物理路径。受保护副作用必须在规定的审计写入点成功后才能继续；普通遥测不能替代安全审计。

## Ports 与恢复

入站为 `SecurityAuditPort`，出站为 Scoped Audit Repository；候选契约见 [`BND-OPS-001`](../../../contracts/bnd-ops-001.md)。重复事件返回同一接受结果；存储不可用时失败关闭。可选导出只从 Journal 读取，导出游标不影响权威记录。
