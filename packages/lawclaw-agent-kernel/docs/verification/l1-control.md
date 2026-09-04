---
doc_id: L1-VER-001
level: verification
layer: l1-control
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SFMEA、系统场景与验证证据"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# L1 Control 验证视图

权威定义见 [System SFMEA](system-sfmea.md)。本层主责风险：`FM-SCH-001..004`、`FM-SES-001`、`FM-RES-001`、`FM-MAG-001..002`、`FM-DAT-001..002`、`FM-ARC-001`；协同承担 `FM-PRO-001..004` 与 `FM-RUN-003`。

主责测试：`ST-SCH-001..008`、`ST-SES-001..002`、`ST-RES-001..002`、`ST-MAG-001..006`、`ST-EVT-001..009`、`ST-ARC-001`。必须证明 FlowEngine 无状态、Session 不常驻进程、Child Run 结构化并发、动作候选经 L1 以及状态/事件原子提交。
