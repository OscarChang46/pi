---
doc_id: VER-INDEX-001
level: verification
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SFMEA、系统场景与验证证据"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# Agent Kernel Verification 索引

当前代码入口见 [首期验证框架](framework.md)、[验收清单](acceptance.json) 和 [测试说明](../../test/README.md)。报告生成实际执行结果，不把候选设计用例标记为已实现。

[Kernel TUI设计验证](kernel-tui-design-validation.md)记录客户端文档检查与未来端到端验收；TUI用例按功能域SR维护，未实现/未运行，不复用System FM/ST编号。

[测试覆盖率统计](test-coverage.md) 定义覆盖率报告协议、门禁使用方法与失败处理。

[System SFMEA 与系统测试清单](system-sfmea.md) 是全部 `FM-*`、`ST-*` 的唯一权威定义；层文件只建立风险/测试所有权视图，不复制评分或预期结果。

| 层 | 验证视图 |
|---|---|
| L1 Control | [L1](l1-control.md) |
| L2 Cognitive Runtime | [L2](l2-cognitive.md) |
| Security Plane | [Security](security-plane.md) |
| L3 Tool Runtime | [L3](l3-tool-runtime.md) |
| L4 Execution Runtime | [L4](l4-execution-runtime.md) |
| Operations Plane | [Operations](operations-plane.md) |
| Infrastructure Plane | [Infrastructure](infrastructure-plane.md) |

跨层端到端、协议、数据一致性和业务边界用例仍由 System SFMEA 统一维护。层设计不得改写 `FM/ST` 含义；调整必须先修改 System SFMEA，再更新本索引。
