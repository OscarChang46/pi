---
doc_id: SYS-CON-INDEX
level: index
layer: Cross-cutting
component: FlowEngine
status: implementing
baseline: AKB-2026-09-03-09
authoritative_for: SYS-CON-INDEX
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# Agent Kernel 边界契约导览

本文件只负责导览，不定义任何规范性内容。每个层间边界的权威定义位于对应的 `BND-*` 文档；公共元数据和通用契约语义分别位于独立文档中。层与组件文档只引用这些文档，不复制完整签名。

## 边界契约

| ID | 边界 | 契约 |
|---|---|---|
| `BND-EXT-001` | Client/Backend ↔ L1 | [外部入口](bnd-ext-001.md) |
| `BND-L1-001` | L1 内部组件 | [L1 内部](bnd-l1-001.md) |
| `BND-L12-001` | L1 ↔ L2 | [Runtime 控制与事件](bnd-l12-001.md) |
| `BND-SEC-001` | PEP ↔ PDP/Permit | [安全决策](bnd-sec-001.md) |
| `BND-L13-001` | L1/PEP ↔ L3 | [工具运行时](bnd-l13-001.md) |
| `BND-L34-001` | L3 ↔ L4 | [执行协议 L34-SPEC-1.0.0（规范已基线）](bnd-l34-001.md) |
| `BND-MEM-001` | Context/Runtime ↔ Memory | [记忆访问](bnd-mem-001.md) |
| `BND-MOD-001` | Pi Adapter ↔ Model Provider | [模型私有边界](bnd-mod-001.md) |
| `BND-OPS-001` | Kernel → Operations | [运维边界](bnd-ops-001.md) |
| `BND-INF-001` | Kernel → Infrastructure | [基础设施边界](bnd-inf-001.md) |

## 公共契约

- [TUI-CON-001](kernel-tui-contract.md)：客户端与本地 Host 的候选意图、会话、事件和恢复协议；功能设计在客户端组件目录，Host 准备语义不下沉为 Facade 职责。

- PEP/PDP详细候选：[SEC-DEC-1](../layers/security-plane/contracts/security-decision-contract.md)，补齐资源上限、确定性求值、决策提交和恢复；基础安全DTO继续由CD-1维护。

- L3内部数据与执行确认补充：[L3-FD-2](l3-tool-runtime-detail.md)，组件候选，L34字段按规范基线；公共DTO继续引用CD-1。

- 本轮开发候选：[CD-1组件补充契约](component-development-contracts-v1.md)，集中维护组件字段、操作、错误与恢复协议；尚未发布Schema。

- 公共字段：[组合式元数据](common-metadata.md)
- 交付、错误、重试和版本规则：[契约语义](contract-semantics.md)
