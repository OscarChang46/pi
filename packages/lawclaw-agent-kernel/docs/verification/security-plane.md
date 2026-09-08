---
doc_id: SEC-VER-001
level: verification
layer: security-plane
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SFMEA、系统场景与验证证据"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# Security Plane 验证视图

权威定义见 [System SFMEA](system-sfmea.md)。本层主责风险：`FM-SEC-001..004`；协同承担 `FM-TOL-001`、`FM-SBX-001`、`FM-MEM-001` 与 `FM-INF-002`。

主责测试：`ST-SEC-001..008`、`ST-E2E-003..005`、`ST-OBS-011`。必须证明默认拒绝、审批不扩权、Permit 与动作摘要完整绑定且仅消费一次、策略 epoch 撤销生效、PDP 与审计故障时受保护副作用失败关闭。
