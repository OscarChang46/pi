---
doc_id: SYS-CON-001
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "边界契约、公共元数据或契约语义的唯一来源"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: [docs/design/c4-boundary-protocols.md]
---

# Agent Kernel 边界契约注册表

本目录是跨层 Port、DTO、稳定错误、幂等、超时、重试和版本兼容的唯一权威来源。层与组件文档只引用契约，不复制完整签名。当前操作名和载荷均为步骤二候选，不构成已接受代码基线。

| ID | 边界 | 契约 |
|---|---|---|
| `BND-EXT-001` | Client/Backend ↔ L1 | [外部入口](bnd-ext-001.md) |
| `BND-L1-001` | L1 内部组件 | [L1 内部](bnd-l1-001.md) |
| `BND-L12-001` | L1 ↔ L2 | [Runtime 控制与事件](bnd-l12-001.md) |
| `BND-SEC-001` | PEP ↔ PDP/Permit | [安全决策](bnd-sec-001.md) |
| `BND-L13-001` | L1/PEP ↔ L3 | [工具运行时](bnd-l13-001.md) |
| `BND-L34-001` | L3 ↔ L4 | [沙箱执行](bnd-l34-001.md) |
| `BND-MEM-001` | Context/Runtime ↔ Memory | [记忆访问](bnd-mem-001.md) |
| `BND-MOD-001` | Pi Adapter ↔ Model Provider | [模型私有边界](bnd-mod-001.md) |
| `BND-OPS-001` | Kernel → Operations | [运维边界](bnd-ops-001.md) |
| `BND-INF-001` | Kernel → Infrastructure | [基础设施边界](bnd-inf-001.md) |

公共字段见[组合式元数据](common-metadata.md)，交付、错误、重试和版本规则见[契约语义](contract-semantics.md)。
