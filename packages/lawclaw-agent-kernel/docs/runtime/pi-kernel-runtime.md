# Pi Kernel Runtime 实现说明

> 文档性质：当前实现兼容说明，不定义领域架构。
>
> 架构权威：以 [Agent Kernel 主设计](../design/agent-kernel-design.md)、[领域对象目录](../design/agent-kernel-domain-object-catalog.md) 和 [ACR-2026-0008](../governance/changes/ACR-2026-0008-agent-system-boundary-v3.md) 为准。

## 1. Runtime 的准确定位

`AgentRuntime` 是长期存在、可重建的执行服务，不是聚合根，也不等同于一次用户对话。它由 `AgentRuntimePool` 管理，可以先后执行多个 `AgentRun`；单个 Run 的权威生命周期由 Run Domain 管理。

当前 Pi 接入用于验证模型循环、上下文组装、工具扩展和委派原语。它不能绕过 `RunScheduler` 创建 Run，不能直接改变调度状态，也不能成为权限、记忆或业务会话的权威数据源。

## 2. 目标调用路径

```text
AgentSystemGateway
  → RunCommandPort.submit(command, executionEnvelopeRef)
  → AgentRegistryQueryPort.resolve(agentDefinitionVersion)
  → RunScheduler 接受并调度 AgentRun
  → RuntimeDispatchPort.dispatch(runId, runtimeLease)
  → AgentRuntime 执行 AgentLoopStep
      → ContextPort 构造 ContextFrame
      → AgentAdapterPort 执行模型 Turn
      → ToolRuntimePort 执行工具候选
      → DelegationPort 申请 Child Run
  → RunExecutionPort 追加规范化 AgentEvent 和终态
```

`AgentExecutionEnvelopeRef` 是 KernelHost 编译后的不透明执行约束引用。Kernel 只消费其中的技术身份、权限快照、资源句柄、预算和时间约束，不解释用户、组织或租户业务语义。

## 3. 上下文、工具和委派

- `AgentContextThread` 负责多轮上下文的连续关联，但不拥有 Run，也不承担调度和权限职责。
- `ContextFrame` 是某个 Loop Step 的只读执行投影，不是业务 Conversation 的权威状态。
- 工具调用必须依次经过 `ToolCallCandidate`、`PermissionPort`、一次性 `ExecutionPermit` 和 `AuthorizedToolRequest`，才能进入 Provider 或 Sandbox。
- 子 Agent 必须形成显式 `ParentChildRunLink`，只能通过 `RunSchedulerPort` 创建；其权限、预算、截止时间和资源范围不得超过父 Run。
- 多 Agent 参与者必须绑定明确的技术角色；共享长期记忆必须经过 `MemoryPort` 和权限判断，不能默认共享完整上下文。
- Pi 原生消息、Session、Event 和 Tool 对象只存在于 Adapter 内部，不得进入公共契约。

## 4. 当前代码与目标架构的差距

当前内存型实现已经验证 Pi 的流式 Turn、只读工具、上下文裁剪、时间预算和受控委派，但尚未完成下列 V3 目标：

- Run Registry、Scheduler 和 Runtime Pool 的独立实现；
- `AgentExecutionEnvelopeRef` 到 Scoped Adapter 的完整装配；
- 独立 `ToolCall`、`PermissionRequest`、`ExecutionPermit` 聚合及异步审批；
- 结构化父子 Run 生命周期与 Multi-agent 协作；
- Context 与共享长期记忆的持久化边界；
- Event Journal、租约恢复和 JSONL Sidecar。

这些属于后续评审和迁移工作。本页只如实描述兼容状态，不赋予当前代码偏离 V3 的架构合法性。

## 5. 配置与运行

默认配置为 `config/agent-kernel.yaml`，系统提示词位于 `config/prompts.zh-CN.yaml`。可通过 `LAWCLAW_CONFIG_FILE` 指定另一份严格 YAML。真实密钥由 Pi 标准认证或环境变量提供，不能进入 YAML、日志或事件。

```bash
npm start
npm run pi
```

CLI 是开发与兼容入口，不是领域边界。它最终也必须通过 `AgentSystemGateway` 和调度链进入 Kernel，不得直接把 Pi Runtime 暴露给上层。

## 6. 验证

```bash
npm run build
npm run check
bash scripts/verify-milestone-one.sh
```

验证必须同时覆盖依赖方向、领域对象所有权、PlantUML/Draw.io 一致性以及 V3 禁止项。当前代码测试通过不代表架构迁移已经完成。
