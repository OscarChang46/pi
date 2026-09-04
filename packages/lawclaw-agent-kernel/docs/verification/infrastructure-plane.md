---
doc_id: INF-VER-001
level: verification
layer: infrastructure-plane
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SFMEA、系统场景与验证证据"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# Infrastructure Plane 验证视图

权威定义见 [System SFMEA](system-sfmea.md)。本层主责风险：`FM-INF-001..003`；协同承担 `FM-DAT-001..002`、`FM-PRO-001..003`、`FM-RES-001`、`FM-LOG-002` 与 `FM-SBX-002`。

主责测试：`ST-TIM-001..002`、`ST-INF-001..008`、`ST-EVT-005..006`、`ST-PRO-001..004`。必须证明 UTC/单调时钟分工、状态与事件原子性、Artifact 原子发布、Secret 明文不外泄、断线不等于未执行、重启从权威状态恢复且所有资源最终清理。
