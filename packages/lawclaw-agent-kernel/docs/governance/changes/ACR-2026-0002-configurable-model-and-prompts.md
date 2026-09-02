# ACR-2026-0002：模型选择配置化与系统提示词集中管理

- 状态：BASELINED
- 级别：L1（内部装配和配置治理；不改变对外职责）
- 提议人：用户
- 子系统所有者：Agent Kernel
- 批准人：用户（2026-09-02 明确要求重构模型提供方和系统提示词硬编码）
- 创建时间：2026-09-02
- 目标基线：AKB-2026-09-02-03

## 1. 触发原因与目标

程序化 能力探针在 Composition Root 中写死 Faux Provider 标识，Pi CLI、主 Agent 和子 Agent 的系统提示词分散在 TypeScript 源码。目标是用严格、版本化 YAML 选择模型来源、Provider 和 Model，并用统一 Prompt Catalog 管理系统提示词。

## 2. 明确不做

- 不把配置解析放进 Kernel；
- 不把 API Key、Token 或其他 Secret 写入 YAML；
- 不提供配置热更新或远程配置中心；
- 不改变 `AgentGateway`、Agent Loop、Context、Tool 或 Delegation 的职责；
- 不改变总体 Draw.io 或现有 PlantUML 的组件边界。

## 3. 方案与边界

- `src/config` 在 Composition Root/CLI 入口侧加载严格 YAML，未知字段、未知版本和缺失 Prompt 默认拒绝；
- `model.source=faux` 用于确定性测试，`model.source=builtin` 从 Pi 内置目录选择真实 Provider/Model；
- `PromptCatalog` 只按稳定 ID 返回完整系统提示词，不解析业务 Prompt 或用户输入；
- Kernel 仍只接收普通 `systemPrompt: string`，不依赖 YAML、Pi Provider 或 Prompt 文件；
- Pi CLI 子进程继承 `LAWCLAW_CONFIG_FILE`，确保父子 Agent 使用同一配置基线。

## 4. 不扩权替代方案

仅使用环境变量分别覆盖各处字符串会继续造成配置漂移，也无法启动时验证 Prompt 引用，因此采用单一主配置加 Prompt Catalog。该方案保持配置加载在 Composition Root 一侧，不扩大 Kernel 职责。

## 5. 安全与韧性

- 配置文件上限 64 KiB，Prompt Catalog 上限 256 KiB；
- Schema 版本、对象形状、未知字段和所有 Prompt 引用在模型调用前校验；
- 配置错误不输出 Prompt 正文或凭据；
- 模型凭据继续由 Pi 标准认证机制解析；
- CLI 显式参数可以覆盖配置中的模型选择，但不会修改配置文件。

## 6. 上层约束追踪

| 约束编号 | 落实方式 | 验证 |
|---|---|---|
| UP-AGT-003 | Pi 模型类型仅存在于 Adapter/Composition Root | 依赖扫描、类型检查 |
| UP-AGT-010 | Provider/Model 通过配置选择，Pi 版本保持锁定 | 配置测试、版本门禁 |
| UP-SEC-001 | YAML 不存 Secret，错误不回显 Prompt | 配置负向测试、源码扫描 |
| UP-DEP-001 | Kernel 不依赖配置加载器或具体 Provider | 架构依赖门禁 |

## 7. 图、文档、契约、代码和测试清单

- 总体 Draw.io：对外职责不变，无需修改；
- PlantUML：组件和依赖方向不变，无需修改；
- 设计与使用文档：补充模型配置和 Prompt Catalog 规则；
- 代码：新增严格配置加载器、Prompt Catalog 和配置化 CLI Launcher；
- 测试：新增配置选择、未知字段、缺失 Prompt 和未知模型测试。

## 8. 验证证据

- `npm run typecheck`：通过；
- `npm test`：12/12 通过；
- `npm run pi -- --version`：0.84.4；
- `npm run pi:smoke`：通过；
- `npm run check:architecture`：配置文件、硬编码、依赖和中文注释门禁通过；
- `npm audit --audit-level=high`：0 vulnerabilities。

## 9. 基线结论

2026-09-02：变更未扩大 Agent Kernel 对外职责，验证通过并并入 `AKB-2026-09-02-03`。
