---
doc_id: L2-DES-001
level: layer
layer: L2 Cognitive Runtime
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: L2 职责、组件边界、允许依赖、控制流与故障隔离
parent: SYS-DES-001
interfaces: [BND-L12-001, BND-MOD-001]
diagrams: [VIEW-L2-COMPONENTS]
supersedes: ["[归档 Run 调度与 Runtime 设计](../../../governance/archive/design-v3-pre-layering/run-scheduling-runtime-subsystem-design.md) 中的 AgentRuntime 部分"]
---

# L2 Cognitive Runtime 层设计

![L2 认知运行层组件图](../../diagrams/rendered/layers/02-l2-cognitive-components.svg)

[查看 PlantUML 权威源](../../diagrams/layers/02-l2-cognitive-components.puml)

## 1. 职责与边界

L2 在 L1 已派发的 `AgentRunAttempt` 内执行可重建的 Agent Loop，把模型侧输出转换为 Kernel 规范事件。L2 不拥有 Run、Session、权限、ToolCall、调度或长期记忆的权威状态，也不解释用户、租户、Token、RBAC 或业务工作流。

L2 只能通过 L1 提供的运行控制边界接收已冻结的上下文、工具目录快照引用和执行信封引用。模型产生的工具动作必须作为 `ToolCallCandidate` 返回 L1；L2 不直接调用 L3、L4 或任何 Tool Provider。

## 2. 组件

| 组件 | 唯一职责 | 详细设计 |
|---|---|---|
| AgentRuntime / AgentLoop | 执行一个已派发 Attempt 的有界认知循环 | [AgentRuntime / AgentLoop](components/agent-runtime-loop.md) |
| ParserNormalizer | 校验 Adapter 已规范化的事件和动作候选 | [ParserNormalizer](components/parser-normalizer.md) |
| AgentAdapter Boundary | 定义 Kernel 唯一公共模型适配边界 | [AgentAdapter Boundary](components/agent-adapter-boundary.md) |
| PiAgentAdapter | 在边界下封装 Pi 原生协议与模型调用 | [PiAgentAdapter](components/pi-agent-adapter.md) |

## 3. 依赖规则

允许依赖为 `L1 → L2 → AgentAdapterPort → Adapter/Model Provider`。L2 可使用 Operations 和 Infrastructure 的窄 Port，但不得反向推进 L1 权威状态。禁止：

- `L2 → L3/L4` 直接调用；
- 将 Provider 原生类型、流事件、异常或凭证暴露给 Kernel Core；
- 在 Runtime 内创建 Child Run、裁决权限、消费 Permit 或持久化 ToolCall；
- 把 `ModelInvocationPort` 提升为 Kernel 公共 Port；它只属于 Pi Adapter 内部；
- 在 Kernel 内解释原始 User Token、Tenant 或 RBAC。

## 4. 主控制流

1. L1 派发 Attempt，并给出冻结的 ContextFrame、可见工具目录快照引用、Deadline 和执行信封引用。
2. AgentRuntime 恢复或初始化循环，调用 `AgentAdapterPort`。
3. Adapter 在私有边界内调用模型并输出规范化事件。
4. ParserNormalizer 验证事件顺序、大小、引用和动作候选形状。
5. 普通事件追加回 L1；遇到工具或委派候选时，Runtime 暂停并把候选交回 L1。
6. L1 完成决策和执行后，以结果引用或拒绝结果恢复 Attempt。
7. Runtime 到达终态、Deadline、取消或预算边界后停止产生新动作并报告终态事件。

## 5. 数据与并发

L2 只持有 Attempt 期间的临时循环状态和可重建投影。Run 与 Attempt 的权威状态、事件 Journal 和幂等记录均由 L1 拥有。单个 Attempt 内事件严格有序；不同 Attempt 不承诺全局顺序。取消先关闭新模型调用和新动作产生，再等待当前有界调用收敛。

## 6. 故障隔离

Provider 超时、流中断、非法输出和 Adapter 崩溃统一映射为规范化故障，不泄漏私有异常。动作执行结果未知时，L2 不猜测、不盲重试；由 L1 查询权威状态并决定恢复。队列、事件帧、循环步数和模型调用均必须有界。

## 7. 非目标与评审边界

Multi-agent 团队、角色、通信、仲裁和结果采纳由 Kernel 上层拥有；L2 只执行普通 Root/Child Run。本文不冻结 Port 签名、DTO 字段、错误码或 Provider 配置，这些内容属于后续契约评审。
