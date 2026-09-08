---
doc_id: BND-INF-001
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "BND-INF-001 Kernel 与 Infrastructure Plane 的边界契约"
parent: SYS-DES-001
interfaces: [BND-INF-001]
diagrams: []
supersedes: [docs/design/c4-boundary-protocols.md]
---

# BND-INF-001：Kernel → Infrastructure Plane

基础设施边界由 Repository、Artifact、ExecutionResource、Process/Container、Transport、ModelEgress、SecretResolver 和 Clock/Time 等代码级 Port 组成；具体签名待步骤二确认。

Adapter 可私有使用 SQLite、文件系统、HTTPS、JSONL、Docker 或后续实现，但只返回机制结果和不透明 Handle。具体技术类型不得进入 Kernel DTO，本层不得定义 Agent 路由、权限、业务编排或多 Agent 规则。存储提交、Artifact 发布和资源获取必须原子或显式失败；Secret、Clock 或副作用机制不可验证时失败关闭。
