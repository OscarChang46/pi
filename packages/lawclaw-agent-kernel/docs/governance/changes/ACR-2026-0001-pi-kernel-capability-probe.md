# ACR-2026-0001：固化架构变更流程并实施 Pi Kernel 能力探针

- 状态：BASELINED
- 级别：L1（内部能力探针；不改变对外职责）
- 提议人：用户
- 子系统所有者：Agent Kernel
- 批准人：用户（2026-09-02 明确要求基于当前设计实现 能力探针，并保证 Pi CLI 可用）
- 创建时间：2026-09-02
- 目标基线：AKB-2026-09-02-02

## 1. 触发原因与目标

把架构设计变更固化为标准流程，并用可运行能力探针验证 Pi 的单轮模型原语、规范化上下文、只读工具扩展、受限委派和 Pi CLI 扩展能力。该探针当时采用一层深度只是测试配置，不构成后续 Subagent 领域边界。

## 2. 明确不做

- 不把 能力探针作为生产 Sidecar；
- 不实现 SQLite、事件持久化、业务编排、Backend 鉴权或业务审批；
- 不提供 Shell、文件写入、MCP、任意网络工具或递归子 Agent；
- 不修改旧工程；
- 不改变 Agent Kernel 对业务编排暴露的职责。

## 3. 当前架构与问题证据

设计已完成 Context Engine、Tool Runtime、Delegation Engine 和 Pi Adapter 边界，但缺少可执行证据；此前也缺少统一的 ACR/ADR、门禁、批准与基线登记流程。

## 4. 建议方案

在独立工程中实现一个内存型纵切能力探针：Kernel 保有规范化上下文、工具策略和委派限制；Pi Adapter 只映射单轮模型协议；Pi CLI 扩展只暴露三种只读工具和单层委派，并由项目级固定版本 CLI 启动。

## 5. 不扩权替代方案

仅编写伪代码或直接使用 Pi 原生 Loop。前者无法验证；后者会把 Context/Tool/Delegation 决策交给 Runtime，弱化既定边界，因此不采用。

## 6. 边界影响

### 6.1 职责与依赖

只新增 能力探针实现模块；Kernel 不导入 Pi，Pi Adapter 依赖契约和 Pi，Composition Root 负责实例化。

### 6.2 Port、方法、Schema、事件和错误码

能力探针实现设计文档中的最小规范化契约，不声明生产兼容承诺。

### 6.3 权威状态、投影、事务和租户

全部状态为进程内技术投影；业务状态和业务 Conversation 不进入 能力探针。每次调用仍要求显式 RequestContext。

### 6.4 数据流、控制流和故障流

`ContextEngine → PiAgentAdapter.executeTurn → ToolRuntime/DelegationEngine → 下一轮 ContextFrame`。超预算、越界、未知工具、递归委派、超时和取消均默认拒绝或终止。

### 6.5 安全、韧性、运维和部署

只读路径限制在 workspace root；子 Agent 深度为 1；输出、文件大小、匹配数、轮次、工具次数、子进程时间和 Buffer 均有上限；密钥由 Pi CLI 自有凭据机制或显式环境变量解析，能力探针不读取和记录其值。

Agent Adapter 直接使用的 `pi-agent-core` 与 `pi-ai` 保持 `0.83.0` 以服从设计基线。安全审计发现 `pi-coding-agent@0.83.0` 自带的 shrinkwrap 固定了存在高危公告的 `undici 8.5.0` 与 `brace-expansion 5.0.7`，根工程 override 无法可靠替换；而总体设计没有锁定 CLI 包版本。因此开发入口的 `pi-coding-agent` 单独固定为安全修复版 `0.84.4`，并以类型检查、完整测试、CLI RPC 冒烟和 `npm audit` 作为兼容性门禁。该版本分层不得被解释为升级 Kernel Adapter 基线。

## 7. 上层约束追踪

| 约束编号 | 影响 | 产物 | 验证 |
|---|---|---|---|
| UP-CTX-003 | Kernel 保有规范化 ContextFrame | `src/kernel/context-engine.ts` | 预算和裁剪测试 |
| UP-TOOL-001 | 工具通过 Port 扩展并默认拒绝 | `src/kernel/tool-runtime.ts` | 越界与未知工具测试 |
| UP-DEL-001 | 单层、受预算技术委派 | `src/kernel/delegation-engine.ts` | 深度和配额测试 |
| UP-AGT-003 | Pi 类型不越过 Adapter | `src/adapters/pi-agent-adapter.ts` | 依赖/类型扫描 |
| UP-DEP-001 | 具体实现只在装配点创建 | `src/application/composition-root.ts` | 静态门禁 |

## 8. 兼容、迁移与回退

能力探针位于独立工程且不接入生产 Composition Root。回退方式是删除能力探针模块和项目依赖；没有数据库和不可逆数据迁移。

## 9. 质量波动预算

| 指标 | 基线 | 阈值 | 证据 |
|---|---|---|---|
| 循环/禁止依赖 | 0 | 必须为 0 | 架构检查脚本 |
| 公共接口中文契约 | 无实现 | 100% | 类型源码审查 |
| 工具越界 | 默认拒绝 | 100% 拒绝 | 自动测试 |
| 子 Agent 深度 | 1 | 不得递归 | 自动测试 |
| CLI | 全局 0.84.4 | 工程内 0.84.4 可启动并加载扩展；audit 无高危 | RPC 冒烟与 npm audit |

## 10. 图、文档、契约、代码和测试清单

- 设计文档：更新状态和授权记录；
- PlantUML：职责结构不变，无需修改；
- 总体 Draw.io：对外职责不变，无需修改；
- 契约/代码/测试：新增隔离式能力探针；
- CLI：固定 `@earendil-works/pi-coding-agent@0.84.4` 并提供启动、冒烟脚本。

## 11. 风险与未决问题

- 能力探针的内存 Session、事件和 Adapter 原生引用不能用于崩溃恢复；
- Pi CLI 兼容路径是开发入口，不替代后续 JSONL Sidecar；
- 真实模型效果、Token 估算精度和摘要质量需独立评测。

## 12. 评审与批准记录

2026-09-02：用户明确要求固定架构变更流程，并基于当前 Agent 设计交付 Pi 能力探针和可用 Pi CLI；批准本 ACR 的受限能力探针范围。

## 13. 实施与验证证据

- `npm run typecheck`：通过；公开契约、Kernel、Adapter 和 CLI 扩展完成严格 TypeScript 检查。
- `npm test`：8/8 通过；覆盖 Context 选择/Secret 拒绝、只读访问/路径逃逸、未知工具、跨租户复用拒绝、单层委派/递归拒绝和 Pi 完整纵切。
- `npm start`：通过；Faux Provider 下完成 3 Turn、2 个动作并到达 `RunCompleted`。
- `npm run pi:smoke`：通过；项目内 Pi CLI 0.84.4 可启动，RPC 能发现 `lawclaw-status` 扩展命令。
- `npm run pi -- --version`：返回 0.84.4，项目启动脚本可用。
- `npm run check:architecture`：治理、上层约束、禁止依赖和 Composition Root 门禁通过。
- `bash scripts/verify-milestone-one.sh`：10/10 PlantUML 语法、SVG XML/中文/源文件一致性和总体职责门禁通过。
- `npm audit --audit-level=high`：0 vulnerabilities。

## 14. 基线与关闭记录

2026-09-02：验证证据通过，变更并入 `AKB-2026-09-02-02`，状态转为 `BASELINED`。总体 Draw.io 因对外职责没有变化而保持不变。待用户验收 能力探针的边界语义后关闭 ACR；生产化工作必须另行批准。
