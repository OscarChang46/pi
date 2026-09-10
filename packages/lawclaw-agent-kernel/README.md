# LawClaw Agent Kernel

基于 Pi 单轮模型能力构建的上层技术内核。代码按职责组织；Pi 核心和其他 workspace 包保持不变。业务编排决定何时调用及是否采纳结果。

## 当前状态

本次仅迁移已有能力、拆分职责边界并补齐框架。V3.1 候选文档的完整协议和审批状态没有改变。

| 状态 | 能力 |
|---|---|
| 已有能力，已重排 | 内存 Run/Session、单轮 Pi 适配、上下文预算、三个只读工具、Grant 判定及复核、停止开关、单层委派、UTC/IANA 时间 |
| 框架边界 | 控制、认知、工具、安全、执行、运维、基础设施的职责与 Port；见源码导航和边界映射 |
| 尚未实现 | 持久化 Journal、调度器、独立 Attempt/Lease 恢复、Memory、一次性 Permit、异步审批、运维后端、生产隔离和存储机制 |

当前 Grant 不具备一次性原子消费。只读 Sandbox 依赖 Provider 路径检查，不提供 OS 隔离。程序化默认场景使用 Faux 模型和 Fake 子调用；CLI 委派使用真实受限子进程。现有身份快照仍采用旧隔离字段，尚未实现完整 ExecutionEnvelope 协议。

## 目录与调用关系

入口导航见 [src/README.md](src/README.md)。各维护目录均有 README，公开接口用中文 TSDoc 解释职责、约束与生命周期。

```text
application → control → cognitive → AgentAdapter → Pi
                  │          │
                  │          └─ 候选交回 control
                  ├─ security：技术判定
                  └─ tools：授权检查 → execution：Provider/Sandbox
                           执行结果 → control → 下一轮 cognitive
```

跨职责调用经 contracts 中的 Port；application 和 CLI 扩展负责装配。AgentSystem 管理 Session 档案并协调独立 RunRegistry；AgentRuntime 不持有 Session 或 Run 目录。Session 只保存当前 Run 绑定，查询状态使用 `kernel.getRun(runId)`。

详细映射和待实现装配点见 [框架边界映射](docs/runtime/framework-boundaries.md)。

## 运行与检查

要求 Node.js >=22.19.0，使用同一 Pi monorepo 的依赖。从仓库根目录安装：

```bash
npm install --ignore-scripts
```

进入本包目录后：

仓库根目录的 `npm run build` 和 `npm run build:offline` 均包含本包，在 Pi AI 和 Pi CLI 依赖构建完成后构建上层内核。以下命令用于单独操作本包：

```bash
npm run typecheck
npm run build
npm test
npm run test:all
npm run verify
npm run test:coverage
npm run test:coverage:gate
npm run check:boundaries
npm run check:comments
npm run check:docs
npm start
npm run pi:smoke
```

`npm run build` 优先使用 Pi 工作区包已生成的声明文件；依赖声明尚未生成时，会
自动切换到 `scripts/type-stubs` 中的编译期最小类型桩。类型桩不包含运行时实现，
因此独立构建通过只说明上层内核可以编译，不代表缺少真实 Pi 包时可以启动。

`npm start` 执行默认配置中的确定性 Faux 场景。`npm run pi` 启动只读 CLI，原生参数可以通过 `--` 追加。真实模型需使用 `model.source: builtin` 并配置目录中的模型标识；凭据仍交给 Pi 标准认证机制。

`npm run verify` 生成 `.artifacts/verification/report.json` 和 `report.md`。支持按 UT、DT、Contract、Integration、System 分层执行及按 ID 复现；未来能力单独登记，不以占位测试计为通过。详见 [验证框架](docs/verification/framework.md)。

`npm run test:all` 一次执行全部登记用例，输出总耗时、各层耗时和最慢用例，并生成 JSON、Markdown 报告。统计口径见[全量测试与耗时统计](docs/verification/test-all-timing.md)。

`npm run test:coverage` 生成本地覆盖率报告；`npm run test:coverage:gate` 按版本化配置检查测试结果、行覆盖率和分支覆盖率，可直接作为 PR 门禁步骤。配置、门禁协议及流水线扩展方式见[覆盖率统计说明](docs/verification/test-coverage.md)。

## 最小程序化调用

下面示例从本包根目录运行；同份代码受类型检查和测试验证：

```ts
import {
	createAgentKernel,
	createRequestContext,
	createRootSessionCommand,
	createRunCommand,
	loadRuntimeSettings,
	resolveConfiguredPath,
} from "./src/index.ts";

const settings = loadRuntimeSettings();
const workspace = resolveConfiguredPath(settings, settings.config.runtime.workspaceRoot);
const kernel = await createAgentKernel(workspace, settings);
const requestContext = createRequestContext(settings);
const ensured = kernel.ensure(
	requestContext,
	createRootSessionCommand({
		logicalKey: `logical-session:${crypto.randomUUID()}`,
		agentDefinitionRef: kernel.agentId,
		contextPolicyRef: settings.config.prompts.agentSystemPromptId,
	}),
);
const command = createRunCommand({ sessionId: ensured.anchor.sessionId, workspaceRoot: workspace }, settings);
const result = await kernel.run(requestContext, command, new AbortController().signal);
console.log(result.status, result.output);
```

服务接入时由可信主机提供 RequestContext、稳定 logicalKey、Agent 定义和 Context 策略引用；本地 `createRequestContext` 不是认证服务。Session ID 只由显式 `ensure` 产生，调用方不能预先指定。完整新链路应通过 `RootSessionPreparationCoordinator` 在候选成功后调用 ensure；上例仍是旧 ContextFrame Run 纵切，不代表新 AssemblyCandidate 的保存/采纳已经接通。运行事件尚未持久化，不应宣称具有重放或崩溃恢复能力。

## 配置与设计

- [配置说明](config/README.md)：预算、时区和模型选择，使用 `LAWCLAW_CONFIG_FILE` 覆盖配置路径。
- [测试说明](test/README.md)与[脚本说明](scripts/README.md)。
- [当前设计文档](docs/design/agent-kernel-design.md)与[契约索引](docs/design/contracts/README.md)。
