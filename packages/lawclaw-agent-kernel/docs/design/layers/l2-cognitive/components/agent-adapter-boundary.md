---
doc_id: L2-CMP-003
level: component
layer: L2 Cognitive Runtime
component: AgentAdapter Boundary
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Kernel 公共模型适配边界与 Provider 类型隔离
parent: L2-DES-001
interfaces: [AgentAdapterPort, BND-MOD-001]
diagrams: []
supersedes: ["[归档 C4 边界协议设计](../../../../governance/archive/design-v3-pre-layering/c4-boundary-protocols.md) 中公共 ModelInvocationPort 表述"]
---

# AgentAdapter Boundary 组件设计

## 职责

`AgentAdapterPort` 是 Kernel 唯一公共模型适配边界。它接收 Kernel 规范化且有界的模型步骤请求，输出规范化事件、使用量与故障；屏蔽 Pi、ACP、SDK、SSE 和 Provider 差异。

## 边界不变量

- Kernel Core 不导入 Provider SDK、Pi 类型、网络协议或凭证类型。
- Adapter 不执行 Kernel 策略，不裁决权限，不查询 L3 工具目录，也不修改 Run。
- 可见工具由 L1 冻结为目录快照后随执行输入提供；Adapter 只能向模型描述该快照。
- Provider 私有解析、重试和网络调用全部在具体 Adapter 内，且服从上游 Deadline 与预算。
- `ModelInvocationPort` 不是公共 Kernel Port，只能作为具体 Adapter 的私有协作者。

## 生命周期与选择

Adapter 类型和配置由 Kernel 外 Composition Root 绑定；Runtime 只持有作用域化的 `AgentAdapterPort`。运行中不得因 Provider 返回内容切换到权限更大的 Adapter。凭证由外部 Scoped Adapter/Secret 机制注入，不进入 Kernel 领域对象。

## 故障隔离

Adapter 将认证失败、限流、超时、协议错误和内容错误映射为稳定故障类别，并避免泄漏 Secret 或原始 Prompt。只有明确可重试且仍在 Deadline 内的无副作用模型调用可进行有限重试。

## 契约边界

本文定义所有权、方向和隔离规则，不冻结请求、事件、Usage 或错误 DTO。
