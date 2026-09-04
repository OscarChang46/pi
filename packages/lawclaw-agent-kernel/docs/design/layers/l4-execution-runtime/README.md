---
doc_id: L4-DES-001
level: layer
layer: L4 Execution Runtime
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Tool Provider 适配与 Sandbox 执行机制层边界
parent: SYS-DES-001
interfaces: [BND-L34-001]
diagrams: []
supersedes: ["[归档工具调用子系统设计](../../../governance/archive/design-v3-pre-layering/tool-call-subsystem-design.md) 中 Provider 与 Sandbox 机制部分"]
---

# L4 Execution Runtime 层设计

## 1. 职责与边界

L4 为 L3 提供工具执行机制：远程或进程内业务工具通过 ToolProviderAdapter 调用，不可信本地工作负载通过 SandboxRuntime 一次性、有界执行。L4 不拥有 ToolCall、Permit、AgentRun、工具路由或权限策略，也不解释业务身份。

L4 只接受 L3 ToolExecutionGuard 已完成 Permit 校验与消费后的调用。L1 和 L2 都不得直接调用 L4；不存在无授权的 Sandbox 或 Provider 入口。

## 2. 组件

| 组件 | 唯一职责 | 详细设计 |
|---|---|---|
| ToolProviderAdapter | 封装远程/进程内 Tool Provider 私有协议 | [ToolProviderAdapter](components/tool-provider-adapter.md) |
| SandboxRuntime | 一次性创建、执行、限制并回收隔离环境 | [SandboxRuntime](components/sandbox-runtime.md) |

## 3. 允许依赖

合法方向为 `L3 → ToolProviderPort/SandboxPort → L4 Adapter → 外部机制`。L4 可使用 Infrastructure 的 Process、Container、Transport、ModelEgress、Secret 和 Clock 等作用域化机制，但不能持有 Kernel Repository 或调用 Security PDP。

## 4. 执行语义

ToolProviderPort 面向已注册 Provider 的单次有界调用与可选状态查询；SandboxPort 统一为一次性 `execute` 语义，每次调用创建隔离上下文、施加 CPU/内存/时间/文件/网络/输出上限，执行后无论成功失败都回收。Sandbox 不是长期 AgentRuntime、Session 或多轮工作区。

## 5. 故障隔离

Provider/Sandbox 原生异常映射为规范结果，Secret 和内部地址不得泄漏。stdout/结果帧有界，协议通道与业务输出分离。超时、进程丢失或远程断线只说明结果未知，不得由 L4 自行重放副作用动作。

## 6. 非目标与评审边界

本层不定义工具目录、权限规则、调度或 Multi-agent 协作，也不冻结容器产品、JSONL 帧、Provider DTO、资源默认值或部署拓扑。
