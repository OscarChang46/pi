---
doc_id: L4-VER-001
level: verification
layer: l4-execution-runtime
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SFMEA、系统场景与验证证据"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# L4 Execution Runtime 验证视图

权威定义见 [System SFMEA](system-sfmea.md)。本层主责风险：`FM-SBX-001..002`；协同承担 `FM-TOL-002..003`、`FM-RES-001` 与 `FM-INF-002`。

主责测试：`ST-SBX-001..006`、`ST-RES-002`、`ST-INF-008`。必须证明 SandboxRequest 不超过 Permit、帧/输出/进程/挂载/出口有界、stdout 协议纯净、失败不回退宿主执行以及执行结束后所有资源和 Secret Lease 被回收。
