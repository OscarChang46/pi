# Agent Kernel 工具调用与沙箱子系统设计

> 状态：`ACR-2026-0008` 五步评审步骤二候选
> 返回主文档：[10 工具扩展与沙箱](agent-kernel-design.md#10-工具扩展与沙箱)
> 权威类图：[10 工具、调用与沙箱](diagrams/domain/10-tool-sandbox.puml)
> 权限设计：[权限、审批与执行授权设计](technical-approval-subsystem-design.md)
> 相关设计：[Run、调度与 Runtime](run-scheduling-runtime-subsystem-design.md)、[C4 边界协议](c4-boundary-protocols.md)

## 1. 设计结论

`ToolRuntime` 是 Agent Kernel System 内唯一的工具执行编排入口。`AgentRuntime` 只通过 `RuntimeEventPort` 向 L1 Action Coordinator 提交 `ToolCallCandidate`；L1 的 PEP 完成统一控制后调用 `ToolRuntimePort`。首版同步有界执行是默认路径；只有工具明确声明 `ASYNC_EXECUTION` 时才使用可选 `AsyncToolRuntimePort`。ToolRuntime 负责描述符解析、Schema 校验、权限申请、Permit 消费、沙箱规划、Provider 调用、结果归一化、状态持久化和事件发布，结果由 L1 通过 `RuntimeControlPort.resumeAttempt` 交回 Runtime。

`ToolCall` 是独立聚合根，不再作为 Runtime、Session、Loop 或 Run 聚合内的附属实体。Run Domain 通过已提交的工具事件获得执行投影，不能直接修改 ToolCall；ToolCall 通过 `runId` 和 `AgentExecutionEnvelopeRef` 保持关联。

## 2. 职责边界

### 2.1 Tool Domain 拥有

- `ToolDefinition`、版本化 `ToolDescriptor` 和风险/沙箱要求；
- `ToolCall` 技术生命周期；
- `ToolCallCandidate` 规范化、Schema 和参数摘要；
- `AuthorizedToolRequest` 的形成；
- Provider 选择与规范化 `ToolResult`；
- ToolCall 持久化、取消和已提交事件。

### 2.2 Tool Domain 不拥有

- 用户、租户、RBAC 和业务审批；
- AgentRun 调度、Runtime Lease 和业务 Workflow；
- PermissionRequest 或 ExecutionPermit 的权威状态；
- 具体容器、进程、文件系统、网络、Secret 和 Artifact 机制；
- Provider 私有 SDK 类型或 Pi 原生 Tool 对象。

## 3. 对象模型

| 对象 | 类型 | 生命周期 |
|---|---|---|
| `ToolDefinition` | 聚合根 | 工具注册、版本发布到退役 |
| `ToolDescriptor` | 值对象 | 单一发布版本，发布后不可变 |
| `ToolCall` | 聚合根 | proposed → authorizing → waiting_approval/authorized → executing → 终态 |
| `ToolCallCandidate` | 值对象 | 单次模型工具请求的规范化输入 |
| `AuthorizedToolRequest` | 值对象 | Candidate 与已消费 Permit 绑定后的 Provider 请求 |
| `ToolResult` | 值对象 | success、failed、denied 或 cancelled 的规范化结果 |
| `SandboxProfile` | 值对象 | 工具版本声明的最小隔离要求 |
| `SandboxRequest` | 值对象 | Permit 权限子集内的单次沙箱请求 |

## 4. Port 与调用方向

| Port | 方向 | 调用关系 |
|---|---|---|
| `ToolRuntimePort` | 入站 | L1 Action Coordinator/PEP → ToolRuntime；describeTools、executeTool，同步有界返回 |
| `AsyncToolRuntimePort` | 可选入站 | 仅 `ASYNC_EXECUTION` 工具；start、get、cancel、stream |
| `PermissionDecisionPort` | 出站 | ToolRuntime → PermissionSystem；authorize |
| `PermitValidationPort` | 出站 | ToolRuntime → PermissionSystem；validateAndConsume |
| `ToolProviderPort` | 出站 | ToolExecutionGuard → Tool Provider；只接受 AuthorizedToolRequest |
| `SandboxPort` | 出站 | ToolExecutionGuard → Sandbox Infrastructure |
| `SecretResolverPort` | 出站 | ToolExecutionGuard → Secret Infrastructure；只解析不透明 Handle |
| `ToolArtifactPort` | 出站 | ToolRuntime → Artifact Infrastructure；保存大结果或敏感内容 |
| `ToolEventPort` | 出站 | ToolRuntime → Run/Event Domain；发布已提交工具事件 |
| `ToolCallRepositoryPort` | 出站 | ToolRuntime → Persistence；ToolCall CAS 与查询 |

Tool Provider、Sandbox 和 Secret 实现不能反向调用 PermissionSystem 请求扩权，也不能定义 Agent 路由、业务政策或 ToolCall 状态。

## 5. 唯一合法调用链

```text
AgentRuntime
  → RuntimeEventPort.publish(ToolCallCandidate)
  → L1 Action Coordinator / PEP
  → ToolRuntimePort.executeTool(candidate, envelopeRef)
  → ToolRuntime 创建 ToolCall(PROPOSED)
  → 解析 ToolDescriptor + 校验 Schema
  → 构造 ActionProposal
  → PermissionDecisionPort.authorize
      ├── Deny → ToolCall(DENIED) + 事件
      ├── Ask  → ToolCall(WAITING_APPROVAL)，等待 resume
      └── Allow → ExecutionPermitRef
  → PermitValidationPort.validateAndConsume(permitRef, actionDigest, envelopeRef)
  → 形成 AuthorizedToolRequest
  → SandboxPort.execute(SandboxRequest ⊆ Permit, AuthorizedToolRequest)
  → SecretResolverPort.resolve(Handle, ExecutionScope)
  → ToolProviderPort.execute
  → 结果写 Artifact（需要时）
  → ToolCall 终态 CAS
  → ToolEventPort 发布已提交事件
  → L1 获取 ToolResultRef
  → RuntimeControlPort.resumeAttempt(ToolResultRef)
```

禁止路径：Candidate 直接进入 Provider、Runtime 传入自制 Permit、Provider 自行申请权限、Sandbox 扩大资源范围、ToolRuntime 直接修改 AgentRun。

## 6. ToolCall 与 AgentRun 的一致性

ToolCall 和 AgentRun 是不同聚合，采用事件同步：

1. ToolCall 状态先在 Tool Repository 内提交；
2. 随后通过 ToolEventPort 发布规范化事件；
3. Run/Event Domain 保存自己的事件投影；
4. 首版由本地 Event Journal 记录已提交事件并由有界 dispatcher 补发，不引入独立消息中间件；
5. AgentRun 查询工具状态时以 ToolCall 权威快照或已提交事件为准。

不能用跨聚合数据库事务假装模型、Provider 和文件系统副作用具备强一致性。安全边界依靠幂等 ToolCall、Permit 单次消费、Provider 幂等能力声明和未知副作用失败关闭。

## 7. 工具扩展规则

- 工具通过版本化 `ToolDefinition` 注册，不在 AgentRuntime 中硬编码。
- Descriptor 必须声明输入/输出 Schema 摘要、风险级别、只读属性、所需能力和 SandboxProfile。
- Provider 通过 `ToolProviderPort` 插拔，私有 SDK 类型不得越过 Adapter。
- 工具集合由 RouteSnapshot/ToolSet 引用冻结；运行中不能静默替换版本。
- Shell、文件写入、Web、MCP 和业务工具必须分别经过新的安全评审，不能通过“通用工具”绕过权限模型。

## 8. 沙箱与资源约束

`SandboxRequest` 必须是 ToolDescriptor 要求、ExecutionPermit、父 Run 预算和系统安全上限的交集。任何约束无法落实时拒绝执行。

Sandbox 默认限制：文件路径、只读/写入模式、CPU、内存、进程数、执行时间、输出大小、网络出口和环境变量。Secret 只以短期 Lease 注入，不得写入 Prompt、日志、事件或 ToolResult。

## 9. 取消与韧性

| 场景 | 行为 |
|---|---|
| WAITING_APPROVAL 取消 | 关闭 ToolCall，后续审批回写不得恢复执行 |
| Permit 消费前崩溃 | 可重新加载 ToolCall 并重新校验 Permit |
| Permit 消费后、Provider 调用前崩溃 | 按 Provider 幂等能力决定恢复；未知时失败关闭 |
| Provider 调用中失联 | 标记未知副作用，不自动重放非幂等工具 |
| 结果持久化后事件发布失败 | 补发已提交事件，不重复调用 Provider |
| Sandbox/Secret 不可用 | ToolCall 失败，不降级到宿主直连 |

## 10. 可观测性

记录 ToolCall 状态变化、Descriptor 版本、风险类别、Permission 决策、Permit 消费结果、Sandbox/Profile、Provider 延迟、结果大小、错误码和 Trace。不得记录原始参数、Prompt、Secret 或受保护正文。

## 11. 评审步骤二待固化

- `ToolRuntimePort`、可选 `AsyncToolRuntimePort`、Repository 和 Provider Port 的完整中文契约；
- ToolCall 状态迁移与事件目录；
- Provider 幂等/副作用能力声明；
- Artifact、Sandbox、Secret 的 DTO 和错误码；
- ToolCall/Run 最终一致性的 outbox 与补拉协议。

在步骤二确认前，本文件不授权修改运行代码。
