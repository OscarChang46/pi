# ACR-2026-0006：Pi monorepo 集成与版本对齐

- 状态：BASELINED
- 级别：L1（部署位置与内部依赖基线变化，不改变对外职责或公共契约）
- 提议人：用户
- 子系统所有者：Agent Kernel
- 批准人：用户（2026-09-02 明确要求基于 Pi 仓库建立 Fork，并把现有修改推送到 `develop`）
- 创建时间：2026-09-02
- 目标基线：AKB-2026-09-02-07

## 1. 目标

把 LawClaw Agent Kernel 作为 `packages/lawclaw-agent-kernel` workspace 纳入 Pi monorepo，在不改变上层职责、公共接口和安全默认值的前提下，共享 Pi 的构建、类型检查、依赖锁定和 CLI 运行环境。

## 2. 影响分析

- 代码位置从独立工程变为 Pi monorepo 的独立 workspace 包；
- `PiAgentAdapter` 与 Pi CLI 统一对齐仓库 `0.84.4` 基线；
- Kernel 继续只复用 `pi-ai` 的模型与单轮流式原语，不直接依赖 `pi-agent-core` 的 Agent Loop；
- TypeScript 源码采用仓库的可擦除语法、`.ts` 相对导入和 `tsgo` 检查约定；
- Pi CLI 和 `tsx` 从 monorepo 根目录解析，配置、会话目录和工作目录仍由 Kernel 包控制；
- `package-lock.json` 纳入新 workspace，以保证依赖解析可复现。

## 3. 职责与非目标

- 总体 Draw.io：对外职责不变，无需修改；
- PlantUML：只更新 Pi Runtime 版本标签，不改变组件、端口或依赖方向；
- 不把 Pi Agent Loop、Session、Event 或 Tool 原生类型暴露到 Kernel 公共契约；
- 不新增 Backend、业务编排、业务审批、持久化或网络权限；
- 不改写 Pi 既有包，也不要求 LawClaw Kernel 反向成为 Pi Core 的依赖。

## 4. 方案选择

采用“独立 workspace 包”方案：保留 LawClaw 边界和 Composition Root，同时复用同仓版本与工具链。未采用把 LawClaw 逻辑直接写入 `packages/agent` 或 `packages/coding-agent` 的方案，因为那会混淆通用 Pi Runtime 与 LawClaw 的租户、安全和编排边界。

不扩权替代方案是继续维护独立仓库并从 npm 安装 Pi；该方案边界可行，但会重复锁文件、工具链和 CLI 解析，并增加版本漂移。

## 5. 安全、韧性与回退

- 只读工具白名单、单层委派、默认拒绝和输出上限保持不变；
- 依赖门禁验证实际 workspace 版本、公共契约无 Pi 类型且 Kernel 不导入具体 Runtime；
- 回退方式是从 monorepo 删除该独立 workspace 和对应锁文件条目；Pi 既有包未被修改，不需要数据迁移；
- 当前没有生产数据库或不可逆数据操作。

## 6. 约束追踪

| 约束编号 | 落实 | 验证 |
|---|---|---|
| UP-AGT-003 | Pi 差异继续封装在 Adapter | import 与公共契约扫描 |
| UP-AGT-004 | Kernel 不导入 Pi、SQLite、Bun 或 HTTP | monorepo 架构门禁 |
| UP-AGT-010 | 统一 Pi workspace `0.84.4` 基线 | manifest、lockfile 与 CLI 冒烟 |
| UP-DEP-001 | 具体 Adapter 仍只在 Composition Root 装配 | 实例化扫描 |
| UP-DEP-002 | 新 workspace 不成为 Pi Core 的反向依赖 | 全仓类型与依赖检查 |
| UP-DEP-003 | 公共契约保持 Runtime 中立 | Pi 原生类型扫描 |

## 7. 验收标准

- LawClaw 包级 TypeScript 检查和 19 个自动测试全部通过；
- Pi CLI `0.84.4` 与 LawClaw 扩展 RPC 冒烟通过；
- LawClaw 架构、中文接口注释与 PlantUML/SVG 门禁全部通过；
- Pi 全仓 `npm run check` 通过，循环依赖和禁止依赖为 0；
- `develop` 分支只包含新 workspace 与必要的根锁文件变更。

## 8. 验证证据

- `npm run check --workspace=lawclaw-agent-kernel`：通过；
- 自动测试：19/19 通过；
- Pi CLI `0.84.4` 与 LawClaw 扩展 RPC 冒烟：通过；
- PlantUML 语法、10 张 SVG 渲染及源文件一致性：通过；
- `npm run check`：Pi 全仓格式、依赖、TypeScript、shrinkwrap、安装锁和浏览器冒烟全部通过；
- `npm audit --audit-level=high`：0 vulnerabilities。

2026-09-02：变更并入 `AKB-2026-09-02-07`。Agent Kernel 对外职责和总体 Draw.io 不变。
