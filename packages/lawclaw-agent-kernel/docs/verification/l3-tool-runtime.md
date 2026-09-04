---
doc_id: L3-VER-001
level: verification
layer: l3-tool-runtime
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SFMEA、系统场景与验证证据"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# L3 Tool Runtime 验证视图

权威定义见 [System SFMEA](system-sfmea.md)。本层主责风险：`FM-TOL-001..003`；协同承担 `FM-RUN-002`、`FM-SEC-002..004` 与 `FM-SBX-001`。

主责测试：`ST-TOL-001..009`、`ST-E2E-003..005`。必须证明 L1/PEP 是唯一上游、ExecutionGuard 只消费 Permit 而不二次裁决、Provider DTO 被归一化、结果有界或转 Artifact、外部副作用未知时进入 `UNKNOWN_SIDE_EFFECT`。
