# LawClaw Agent Kernel

LawClaw Agent Kernel 是基于 Pi Runtime 构建的独立 Agent 技术执行内核。Kernel 拥有规范化上下文、有界 Agent Loop、工具政策、受限子 Agent 和统一时间语义；业务编排仍负责决定何时调用以及是否采纳候选结果。

当前代码基线提供：

- `AgentAdapter` 下的 Pi 单轮流式适配；
- `ContextEngine` 的上下文选择与预算控制；
- `ToolProviderPort` 和三个内置只读工具；
- 最大深度为 1 的技术子 Agent；
- UTC `TimePoint`、IANA `TimeContext` 和基础设施 `TimePort`；
- 严格 YAML 配置、集中 Prompt Catalog 和 Pi CLI 开发入口。

当前版本尚未交付持久化 Journal、生产 Sidecar、Backend、业务编排或业务审批；Shell、文件写入、MCP 和任意网络工具保持禁用。

## 快速开始

要求 Node.js `>=22.19.0`。本包作为 Pi monorepo workspace 参与构建，程序化 Adapter 与 CLI 统一使用仓库基线 `0.84.4`；Pi 原生类型仍由规范化契约隔离。

```bash
npm install --ignore-scripts
npm run check --workspace=lawclaw-agent-kernel
```

运行配置中的确定性 Faux Provider 纵切：

```bash
npm start --workspace=lawclaw-agent-kernel
```

启动带 LawClaw 安全扩展的 Pi CLI：

```bash
npm run pi --workspace=lawclaw-agent-kernel
```

全部可调运行参数统一配置在 `config/agent-kernel.yaml`，包括模型、Context 估算、Run 预算、工具/委派政策、只读扫描、Pi Adapter、CLI、RequestContext、IANA 时区/locale 和本地 Run 档案。系统提示词正文集中位于 `config/prompts.zh-CN.yaml`，运行时代码只引用 Prompt ID。

使用其他配置文件时设置：

```bash
LAWCLAW_CONFIG_FILE=/absolute/path/runtime.yaml npm start --workspace=lawclaw-agent-kernel
LAWCLAW_CONFIG_FILE=/absolute/path/runtime.yaml npm run pi --workspace=lawclaw-agent-kernel
```

真实模型调用需要把 `model.source` 改为 `builtin`，并填写 Pi 模型目录中的 `providerId` 和 `modelId`。密钥由 Pi 标准认证或环境变量机制提供，禁止写入 YAML、日志或事件。

CLI 默认使用 `--no-builtin-tools`，只启用：

- `lawclaw_list_files`
- `lawclaw_read_text`
- `lawclaw_search_text`
- `lawclaw_delegate`（仅父 Agent；子 Agent 不会再次注册）

可以把 Pi 原生参数追加在 `--` 后，例如：

```bash
npm run pi --workspace=lawclaw-agent-kernel -- --provider anthropic --model claude-sonnet-4-6
```

## 架构边界

`src/contracts` 和 `src/kernel` 不导入 Pi；`src/adapters` 和 `src/pi-cli` 可以导入 Pi。具体 Adapter/Provider 只在 `src/application/composition-root.ts` 或 Pi CLI 扩展工厂中装配。程序化入口使用 Pi 单轮流式 API，Kernel 保持 Loop、Context、Tool 和 Delegation 决策权。

架构说明见 [Agent Kernel 完整设计文档](docs/design/agent-kernel-design.md)，运行说明见 [Pi Kernel Runtime 使用与设计说明](docs/runtime/pi-kernel-runtime.md)，治理流程见 [LawClaw 架构设计变更标准流程](docs/governance/architecture-change-process.md)。
