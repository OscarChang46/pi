---
doc_id: SYS-CON-002
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

# 组合式协议元数据

每个接口只组合自身需要的技术元数据，禁止构造包含大量可选字段的万能信封。

| 元数据 | 必需语义 | 禁止项 |
|---|---|---|
| `RequestMetadata` | `protocolVersion`、`requestId`、W3C `traceparent`、`correlationId`、UTC `deadlineUtc` | Tenant、User、RBAC、Token |
| `CommandMetadata` | 写命令使用稳定 `commandId`；需要幂等受理时使用 `idempotencyKey` | 重试时生成新 ID |
| `RunScopeMetadata` | `runId`、可选 `attemptId`、`executionEnvelopeRef` | 原始身份或授权载荷 |
| `LeaseProof` | 仅多 Worker/接管档案使用 `leaseId + fenceToken` | 首版单 Worker 强制分布式 Lease |
| `BoundaryError` | 稳定 `code`、类别、`retryable`、可选退避与脱敏 `detailsRef` | Prompt、Secret、工具参数、物理路径 |

`deadlineUtc` 是端到端预算，下游只能缩短。`executionEnvelopeRef` 是 Backend/KernelHost 已验证后的不透明引用；原始 User Token 必须在 `BND-EXT-001` 外侧终止。
