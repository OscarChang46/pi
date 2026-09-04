# 上下文与长期记忆子系统设计

> 状态：`ACR-2026-0008` 五步评审步骤二候选
> 返回主文档：[11 上下文与长期记忆](agent-kernel-design.md#11-上下文与长期记忆)
> 权威类图：[08 上下文与长期记忆](diagrams/domain/08-context-memory.puml)
> 对象目录：[Context 模块](agent-kernel-domain-object-catalog.md#5-context-领域模块)、[Memory 模块](agent-kernel-domain-object-catalog.md#6-memory-领域模块)

## 1. 两个独立聚合边界

`AgentSession` 是技术会话聚合根，保护多个 Run 之间的 `ContextDelta`、`ContextSnapshot`、Artifact 引用和版本顺序。它关联 Run ID，但不拥有 Run 状态，也不是业务 Conversation 或进程。

`MemorySpace` 是长期记忆聚合根，保护 Entry、Version、授权范围和 append-only 演进。Context 可以读取冻结的 `MemoryView`，但不能修改 MemorySpace。

```text
AgentSession → ContextSnapshot → ContextFrame → AgentRuntime
MemorySpace → MemoryView → ContextEngine → ContextFrame
AgentRuntime → MemoryCandidate → Permission → MemoryManager → MemoryEntry
```

## 2. Context Engine

`ContextEngine` 根据 `ContextSpec` 选择系统约束、当前任务、历史事件、工具结果、Artifact 和授权 MemoryView，执行预算估算、裁剪、摘要与冻结，生成一次模型调用使用的不可变 `ContextFrame`。

`ContextFrame` 是可重建投影，不是权威会话状态。`ContextReductionTrace` 必须记录来源、选择理由、裁剪和摘要决策；系统约束和未完成工具因果链不能被普通摘要覆盖。

## 3. 长期记忆

- Agent 只能提交 `MemoryCandidate`，不能直接写 `MemoryEntry`；
- 共享更新采用 append-only 和 `supersedes`，不原地覆盖；
- `MemoryView` 绑定 MemorySpace 版本与授权范围；
- 跨 Agent 或 ExecutionScope 的读写必须经过权限判断；
- 上层 Multi-agent 共享记忆时也必须显式获得 MemoryView/Grant，不隐式共享完整上下文。

## 4. Port 与调用方

| 调用方 | Port | 关键语义 |
|---|---|---|
| AgentRuntime | `ContextPort` | 组装 Frame、记录 Delta，不直接写 Thread 内部对象 |
| ContextEngine | `MemoryQueryPort` | 获取冻结且已授权的 MemoryView |
| AgentRuntime/SubagentCoordinator | `MemoryCandidatePort` | 只提交候选，不承诺写入共享 Memory |
| MemoryManager | `PermissionDecisionPort` / `PermitValidationPort` | 敏感读取和候选提交授权 |
| Context/Memory | Artifact Port | 保存大对象，只传播不透明引用 |

## 5. Local-first 持久化

首版使用进程内 Port、本地 SQLite 和文件 Artifact Adapter，不要求独立 Memory Service。未来只有在多 Kernel 共享、独立治理或独立扩缩容出现后才评审服务化。

## 6. 故障语义

- Memory 不可用时只能按显式策略无长期记忆运行或失败，不能使用越权缓存；
- 授权 epoch 在 Frame 提交前失效时必须丢弃对应 MemoryView；
- Context 超预算必须有界裁剪，不能让模型调用突破限制；
- Runtime 崩溃后从 Snapshot 与 Run Event 重建 Frame，不依赖 Runtime 隐藏状态。

## 7. 关联设计

- Run 与 ContextThread 的非所有权关系见[Run、调度与 Runtime 子系统](run-scheduling-runtime-subsystem-design.md)。
- Memory 权限见[权限、审批与执行授权子系统](technical-approval-subsystem-design.md)。
- Session、Child Run 与上层 Multi-agent 边界见[AgentSession、FlowEngine 与本地资源调度](session-flow-engine-resource-subsystem-design.md)。
