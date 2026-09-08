---
doc_id: INF-CMP-002
level: component
layer: infrastructure-plane
component: ArtifactStorage
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "ArtifactStorage 的状态、生命周期、算法与 Port 使用"
parent: INF-DES-001
interfaces: [BND-INF-001]
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# ArtifactStorage 组件设计

## 职责与状态

保存超大工具结果、诊断包和临时资产，返回不透明 `ArtifactReference`。拥有内容摘要、提交状态、作用域和回收标记，不把物理路径或 Bucket 暴露给 Kernel。

## 算法

写入采用临时对象 → 校验大小/摘要 → 原子发布；中断对象不可读且可回收。读取必须在调用方执行信封作用域内授权，并采用有界流。引用包含逻辑 ID、摘要和媒体类型，不包含凭据。

## Ports 与恢复

实现 `ArtifactPort` 候选语义，见 [`BND-INF-001`](../../../contracts/bnd-inf-001.md)。写入失败不得发布引用；清理采用幂等标记扫描，不能删除仍被权威状态引用的制品。
