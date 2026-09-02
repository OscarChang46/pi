# Pi Kernel Runtime 使用与设计说明

> 状态：正式代码基线，当前为内存型首版
> 基线：`AKB-2026-09-02-06`

## 1. 能力范围

Agent Kernel 通过 Pi 的单轮流式原语执行模型 Turn，同时把以下控制权保留在 Kernel：

- 规范化 `ContextFrame` 的组装、预算和裁剪；
- 工具目录、风险政策、参数与结果边界；
- 父子 Run、最大深度和委派预算；
- Run 轮次、输出、工具次数和截止时间；
- UTC 时间、IANA 时区上下文和单调耗时；
- Pi 原生消息与公共契约隔离。

当前版本使用内存事件与会话引用；持久化 Journal、崩溃恢复和 JSONL Sidecar 属于后续里程碑。该限制不改变现有公共契约和职责边界。

## 2. 模块与依赖

| 模块 | 职责 | 边界 |
|---|---|---|
| `src/contracts` | 公共 DTO、Port、事件和稳定错误码 | 不导入 Pi、Node 基础设施或业务模型 |
| `src/kernel` | Agent Loop、Context、Tool、Delegation 和上下文守卫 | 只依赖公共契约 |
| `src/adapters` | Pi、只读工具、委派和系统时间适配 | 原生类型不得越过 Port |
| `src/application/composition-root.ts` | 唯一程序化装配点 | 创建并注入所有具体 Adapter |
| `src/pi-cli` | Pi CLI 开发入口与只读扩展 | 不替代正式 AgentGateway/Sidecar |

## 3. 单次 Run 调用路径

```text
StartAgentRunCommand
  → ContextEngine.assemble
  → AgentLoopEngine.run
      → PiAgentAdapter.executeTurn
      → ToolRuntime.execute 或 DelegationEngine.delegate
      → ContextEngine.appendTurn
      → 下一轮 PiAgentAdapter.executeTurn
  → AgentRunResult + AgentEvent[] + ContextFrame
```

Pi 返回工具调用时不会直接执行 Provider。Kernel 先验证预算和政策，再把已授权请求交给 `ToolProviderPort`。`lawclaw_delegate` 由 `DelegationEngine` 接管，子 Agent 的摘要以工具结果进入父 Run 下一轮上下文。

## 4. 数据、安全与故障语义

- `RequestContext` 显式携带 `TenantContext`、`OperationContext` 和 IANA `TimeContext`。
- `ContextFrame` 是技术执行投影，不是业务 Conversation 的权威状态。
- Pi `AssistantMessage` 只存在于 Adapter 私有 Map；Kernel 只保存不可解释引用和规范化内容。
- Secret 内联上下文、未知工具、路径逃逸、递归子 Agent 和无效时区默认拒绝。
- 工具、模型输出、Context、子 Agent、文件扫描和时间预算全部有界。
- 当前内存会话无法跨进程恢复，引用失效时返回 `ADAPTER_PROTOCOL_ERROR`。

## 5. 配置与运行

默认配置为 `config/agent-kernel.yaml`，系统提示词位于 `config/prompts.zh-CN.yaml`。可通过 `LAWCLAW_CONFIG_FILE` 指定另一份严格 YAML；父子 Pi CLI 继承同一个绝对配置路径。

确定性 Faux Provider 纵切：

```bash
npm start
```

交互式 Pi CLI：

```bash
npm run pi
```

`model.source=builtin` 时，Launcher 使用配置中的 Provider/Model；命令行显式 `--provider/--model` 优先。真实密钥由 Pi 标准认证或环境变量提供，不能进入 YAML、日志或事件。

交互中可以执行 `/lawclaw-status` 查看租户、委派深度和只读模式。父 Agent 可调用 `lawclaw_delegate`；子进程以 `LAWCLAW_CHILD_DEPTH=1` 启动，不会再次注册委派工具。

## 6. 验收

```bash
npm run build
npm run check
bash scripts/verify-milestone-one.sh
```

验收覆盖类型检查、19 个自动化场景、确定性纵切、Pi CLI RPC、依赖/职责门禁、中文公共契约注释、依赖审计和 10 张 PlantUML/SVG 一致性检查。
