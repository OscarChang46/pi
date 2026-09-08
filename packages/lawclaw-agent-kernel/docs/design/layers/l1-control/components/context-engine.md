---
doc_id: L1-CMP-009
level: component
layer: L1 Control & Orchestration Runtime
component: ContextEngine
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ContextFrame 的选择、预算、裁剪、摘要、追踪与冻结算法
parent: L1-DES-001
interfaces: [ContextPort, SessionQueryPort, MemoryQueryPort, ArtifactPort, ContextEstimatorPort]
diagrams: []
supersedes: [context-memory-subsystem-design.md 中的 ContextEngine 内容]
---

# ContextEngine 组件设计

## 1. 目标与非目标

ContextEngine 从系统约束、当前任务、Session 快照、工具观察、Artifact 和已授权 MemoryView 生成一次模型调用使用的有界 `ContextFrame`。

它不拥有 AgentSession 或 MemorySpace，不保存业务 Conversation，不写长期记忆，也不解释 Provider 私有 token 类型。

## 2. 状态与不变量

`ContextFrame` 和 `ContextReductionTrace` 是可重建、不可变投影，不是权威聚合。Trace 必须说明来源版本、选择理由、裁剪、摘要和拒绝决策。系统安全约束、当前任务和未完成工具因果链不能被普通摘要覆盖。

MemoryView 必须绑定授权范围与 MemorySpace 版本；授权 epoch 在 Frame 冻结前失效时必须丢弃对应视图。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `ContextPort` | 按 ContextSpec 组装并冻结 Frame |
| 出站 | `SessionQueryPort` | 读取带版本的 SessionSnapshot |
| 出站 | `MemoryQueryPort` | 获取授权且冻结的 MemoryView |
| 出站 | `ArtifactPort` | 在授权范围内读取大对象引用 |
| 出站 | `ContextEstimatorPort` | 使用 Provider 无关能力估算预算 |

## 4. 算法

按强制约束、当前因果链、相关历史、授权记忆和补充 Artifact 的顺序收集候选；先去重和敏感级别过滤，再按预算裁剪或摘要，最后校验来源版本并冻结。超预算且不能安全裁剪时显式失败或请求挂起，不突破硬上限。

## 5. 韧性与可观测性

- Memory 不可用时只按明确策略无记忆运行或失败，禁止使用越权缓存。
- Artifact 缺失产生可解释降级或失败，不把物理路径暴露给 Runtime。
- 摘要失败不能删除原权威事实；调用方可缩小输入后重试。
- 记录 Frame 大小、来源数量、裁剪原因、摘要耗时和授权视图失效次数。

## 6. 验收

- 任意输入生成的 Frame 不超过 token/byte 硬上限。
- ReductionTrace 能解释每个保留、裁剪和摘要决定。
- ContextEngine 对 Session/Memory 的写权限和业务 Conversation 依赖为零。
- Runtime 崩溃后能从相同版本快照重建等价 Frame。
