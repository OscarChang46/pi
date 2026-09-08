---
doc_id: L2-VER-001
level: verification
layer: l2-cognitive
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SFMEA、系统场景与验证证据"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# L2 Cognitive Runtime 验证视图

权威定义见 [System SFMEA](system-sfmea.md)。本层主责风险：`FM-RUN-001..003`、`FM-PRO-001..002`；协同承担 `FM-CTX-001..002` 与 `FM-TOL-001`。

主责测试：`ST-RUN-001..006`、`ST-PRO-003..004`、`ST-TOL-002`。必须证明 Provider 私有解析止于 Adapter、Parser 只校验规范化事件、ToolCallCandidate 回到 L1、取消后不产生新动作，未知副作用不被自动重放。
