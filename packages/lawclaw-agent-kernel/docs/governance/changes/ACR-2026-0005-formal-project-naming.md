# ACR-2026-0005：正式工程命名与代码基线

- 状态：BASELINED
- 级别：L2（公共 TypeScript 名称、配置 Schema 和运行入口发生不兼容重命名）
- 提议人：用户
- 子系统所有者：Agent Kernel
- 批准人：用户（2026-09-02 明确要求移除临时演示语义并按正式项目开发）
- 创建时间：2026-09-02
- 目标基线：AKB-2026-09-02-06

## 1. 目标

从公共契约、函数签名、注释、源码目录、配置、脚本、包元数据和使用文档中移除临时演示命名，把已经验证的 Agent Loop、Context、Tool、Delegation、Pi Adapter 和 TimePort 作为正式 Agent Kernel 代码基线继续演进。

## 2. 主要重命名

| 原语义 | 正式名称 |
|---|---|
| 临时 Run 命令类型 | `StartAgentRunCommand` |
| 临时 Run 结果类型 | `AgentRunResult` |
| 本地上下文配置类型 | `RequestContextConfig` |
| 程序化运行配置类型 | `RunProfileConfig` |
| 创建上下文函数 | `createRequestContext` |
| 创建 Run 命令函数 | `createRunCommand` |
| 创建内核函数 | `createAgentKernel` |
| `src` 下临时装配目录 | `src/application` |
| 主配置 | `config/agent-kernel.yaml` |
| 运行配置区 | `runtime` |
| 确定性运行命令 | `npm start` |

上述重命名不保留旧别名，防止临时语义继续进入新调用方。当前工程没有已发布消费者，因此采用一次性基线升级。

## 3. 职责与非目标

- 总体 Draw.io：对外职责不变，无需修改；
- PlantUML：组件和依赖关系不变，无需修改；
- 正式命名不表示持久化 Journal、Sidecar、Backend 接入或生产部署已经完成；
- 不扩大工具、网络、子 Agent、业务编排和业务审批职责；
- Faux Provider 保留为确定性测试 Adapter，不作为生产默认能力声明。

## 4. 安全与兼容性

- 配置 Schema 的顶层运行区和 Prompt ID 同步重命名，旧配置默认拒绝；
- 默认配置、CLI 父子进程和自动测试统一使用同一新配置路径；
- 架构门禁扫描源码、测试、配置、脚本和活跃文档，禁止临时演示术语重新进入函数签名和注释；
- 历史 ACR 继续描述其原始能力探针范围，但统一使用“能力探针”术语。

## 5. 约束追踪

| 约束编号 | 落实 | 验证 |
|---|---|---|
| UP-AGT-001 | 正式类型仍只表达 Agent 技术运行 | 公共契约扫描 |
| UP-AGT-002 | 业务采纳责任不进入正式 Run 结果 | 契约与文档检查 |
| UP-DEP-001 | `src/application` 仍是唯一装配点 | 具体 Adapter 实例化扫描 |
| UP-DEP-003 | 重命名后的公共契约仍无 Pi 原生类型 | import 与类型扫描 |
| UP-SEC-001 | 正式化不开放原有禁止能力 | 安全负向测试和配置门禁 |

## 6. 验证证据

- `npm run build`：通过；
- `npm test`：19/19 通过；
- `npm start`：通过；
- `npm run pi:smoke`：通过；
- `npm run check:architecture`：通过；
- PlantUML/SVG 门禁：10/10 通过；
- `npm audit --audit-level=high`：0 vulnerabilities。

## 7. 基线结论

2026-09-02：正式工程命名并入 `AKB-2026-09-02-06`。当前代码从能力探针升级为正式 Agent Kernel 源码基线；未实现能力继续由后续里程碑控制。
