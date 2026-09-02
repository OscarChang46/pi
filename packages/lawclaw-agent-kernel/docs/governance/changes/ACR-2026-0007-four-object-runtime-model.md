# ACR-2026-0007：Runtime、Session、AgentRun、AgentLoop 四对象模型落地

- 状态：BASELINED
- 级别：L1（内部领域所有权调整，不改变对外职责）
- 提议人：用户
- 子系统所有者：Agent Kernel
- 批准人：用户（2026-09-03 明确要求修正四对象模型与当前实现不一致并推送 `develop`）
- 创建时间：2026-09-03
- 目标基线：AKB-2026-09-03-08

## 1. 触发原因与目标

现有实现由 Composition Root 直接返回 `AgentLoopEngine`，Session 和 AgentRun 只有标识，Loop 只是控制流语法；这与 Runtime 聚合拥有 Session、Session 管理多次 AgentRun、AgentRun 拥有多个 AgentLoop 的正式模型不一致。本变更把四层做成真实生命周期对象，并让工具安全链在该层级内执行。

## 2. 明确不做

- 不引入业务 Conversation、Workflow、业务审批或结果采纳职责；
- 不暴露 Pi 原生 Session；
- 不新增网络、写入、Shell 或递归子 Agent 能力；
- 不实现持久化 Repository，本轮仍使用有容量上限的内存对象目录。

## 3. 当前架构与问题证据

- `createAgentKernel()` 直接返回 `AgentLoopEngine`；
- 没有 Runtime、Session、AgentRun 类；
- `while` 每轮没有独立标识、状态和所有者；
- ToolRuntime 虽接收 session/run 标识，但无法证明调用来自真实对象层级。

## 4. 建议方案

由 Composition Root 创建唯一 `AgentRuntime`。Runtime 按租户管理 `AgentSession`；Session 以唯一 runId 串行创建 `AgentRun`；Run 通过内部生命周期端口让执行引擎创建严格递增、终态不可逆的 `AgentLoop`。保留 `AgentRuntime.run()` 作为兼容入口，但其内部必须经过 Session 和 Run。

## 5. 不扩权替代方案

只修改文档以把 `AgentLoopEngine` 称作 Runtime 会掩盖所有权缺失，无法验证会话容量、Run 唯一性和 Loop 生命周期，因此不采用。

## 6. 边界影响

对外 `run(context, command)` 形状保持兼容；新增内部对象和容量配置。Runtime 仍绑定单一租户，Session 首版串行，Run 不能重复启动，Loop 只能由当前 Run 按顺序创建。总体 Draw.io：对外职责不变，无需修改。

## 7. 上层约束追踪

| 约束编号 | 影响 | 产物 | 验证 |
|---|---|---|---|
| UP-AGT-001 | 明确 Agent 技术模型所有权 | 四个核心类、08 数据模型图 | 所有权层级测试 |
| UP-AGT-005 | Loop 成为可观察执行实体 | 生命周期端口、终态 | 纵切测试 |
| UP-CTX-001 | Runtime/Session 保持租户绑定 | Runtime/Session 校验 | 跨租户负向测试 |
| UP-RES-001 | Session 和 Run 目录有界 | objectModel 配置 | 容量负向测试 |
| UP-DEP-001 | 仍只由 Composition Root 装配执行器 | Composition Root | 依赖门禁 |

## 8. 兼容、迁移与回退

现有调用方继续使用 `runtime.run()`，无需协议迁移。回退可删除四对象包装并恢复直接 LoopEngine，但会重新产生本 ACR 的一致性缺陷；无持久化数据迁移。

## 9. 质量波动预算

| 指标 | 基线 | 阈值 | 证据 |
|---|---|---|---|
| 自动测试 | 36 | 不减少 | 包级测试 |
| 整仓检查 | 通过 | 必须通过 | `npm run check` |
| 新增无界目录 | 0 | 必须为 0 | 配置和容量测试 |

## 10. 图、文档、契约、代码和测试清单

- 更新总体设计、ToolCall 与 Permission Approval 的四对象说明；
- 更新组件图和领域模型图；
- 新增 AgentRuntime、AgentSession、AgentRun、AgentLoop；
- Composition Root 返回 Runtime；
- 新增所有权、重复、容量和跨租户测试。

## 11. 风险与未决问题

首版对象目录仍是内存实现；持久化 Session/Run Repository 和崩溃恢复继续按既有里程碑推进。

## 12. 评审与批准记录

2026-09-03：用户批准实施并要求完成后推送远端 `develop`。

## 13. 实施与验证证据

- `tsgo -p tsconfig.json`：通过；
- 自动测试：38/38 通过，其中包含四对象所有权、重复 Run、容量和跨租户负向测试；
- `npm start` 纵切和 Pi CLI RPC 冒烟：通过；
- 架构治理、职责边界、运行时边界和公共契约中文 TSDoc 门禁：通过；
- PlantUML `1.2026.7`：10 张源图语法通过，更新后的组件图和领域模型图已重新渲染；
- Pi monorepo `npm run check`：通过。

## 14. 基线与关闭记录

2026-09-03：并入 `AKB-2026-09-03-08`。
