# Pi Kernel Runtime 实现说明

> 文档性质：当前实现兼容说明，不定义领域架构。
>
> 架构权威：以 [Agent Kernel 主设计](../design/agent-kernel-design.md)、[领域对象目录](../design/reference/domain-object-catalog.md) 和 [ACR-2026-0008](../governance/changes/ACR-2026-0008-agent-system-boundary-v3.md) 为准。

## 1. Runtime 的准确定位

当前 `cognitive/AgentRuntime` 是可重建的单轮执行服务，不是聚合根。`control/AgentSystem` 协调独立 `RunRegistry` 和 Session 档案，`RunFlow` 在轮次间推进执行。RuntimePool 尚未实现。详细现状见[框架边界映射](framework-boundaries.md)。

当前 Pi 接入保留模型单轮调用、上下文预算、只读工具和单层委派。认知层不创建 Run 或调用工具；现有委派尚未接入候选设计中的 RunScheduler。以下目标调用路径不代表已交付能力。

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
      → RuntimeEventPort 把 ToolCallCandidate / ChildRunCandidate 返回 L1
  → L1 PEP 请求 PermissionDecisionPort 完成 Allow / Ask / Deny
  → Allow 后携带 ExecutionPermit 调用 L3 ToolRuntimePort
  → L3 ToolExecutionGuard 校验并消费 Permit，再进入 L4 Provider / Sandbox
  → ChildRunCandidate 由 SubagentCoordinator 经 RunSchedulerPort 创建 Child Run
  → RunExecutionPort 追加规范化 AgentEvent 和终态
```

`AgentExecutionEnvelopeRef` 是 KernelHost 编译后的不透明执行约束引用。Kernel 只消费其中的技术身份、权限快照、资源句柄、预算和时间约束，不解释用户、组织或租户业务语义。

## 3. 上下文、工具和委派

- `AgentContextThread` 负责多轮上下文的连续关联，但不拥有 Run，也不承担调度和权限职责。
- `ContextFrame` 是某个 Loop Step 的只读执行投影，不是业务 Conversation 的权威状态。
- 工具调用必须依次经过 `ToolCallCandidate` 回传 L1、`PermissionDecisionPort`、一次性 `ExecutionPermit`、L3 `PermitValidationPort` 和 `AuthorizedToolRequest`，才能进入 L4 Provider 或 Sandbox；L2 不直接调用 L3。
- 子 Agent 必须形成显式 `ParentChildRunLink`，只能通过 `RunSchedulerPort` 创建；其权限、预算、截止时间和资源范围不得超过父 Run。
- 上层业务编排可以用多个普通 Run/Session 组成 Multi-agent，但 Kernel 不保存团队、参与者角色或仲裁模型；共享长期记忆必须经过 `MemoryQueryPort` / `MemoryCandidatePort` 和权限判断，不能默认共享完整上下文。
- Pi 原生消息、Session、Event 和 Tool 对象只存在于 Adapter 内部，不得进入公共契约。

## 4. 当前代码与目标架构的差距

当前内存型实现已经验证 Pi 的流式 Turn、只读工具、上下文裁剪、时间预算和受控委派，但尚未完成下列 V3 目标：

- RunRegistry 已独立持有内存 Run；其持久化、Scheduler 和 RuntimePool 尚未实现；
- `AgentExecutionEnvelopeRef` 到 Scoped Adapter 的完整装配；
- 独立 `ToolCall`、`PermissionRequest`、`ExecutionPermit` 聚合及异步审批；
- 结构化父子 Run 生命周期；Multi-agent 团队协作仍由 Kernel 上层负责；
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
npm run typecheck
npm test
npm run check:boundaries
npm run check:comments
npm run check:docs
npm run pi:smoke
```

验证必须同时覆盖依赖方向、领域对象所有权、PlantUML/Draw.io 一致性以及 V3 禁止项。当前代码测试通过不代表架构迁移已经完成。
