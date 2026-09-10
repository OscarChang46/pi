# Agent Kernel 架构变更索引

本索引用于区分“活动代码基线”和“后续候选设计”。`BASELINED` 记录描述已经生效的历史与实现事实；`DRAFT` 或 `REVIEWING` 记录只能指导候选设计，不授权代码迁移。

## 当前视图

| 视图 | 基线/变更 | 状态 | 权威含义 |
|---|---|---|---|
| 已批准历史基线 | `AKB-2026-09-03-08` / `ACR-2026-0007` | ACTIVE / BASELINED | 四对象 Runtime 历史基线；不代表全部当前工作区改动 |
| Flow系统框架变更 | [ACR-2026-0012](ACR-2026-0012-flow-system-engine.md) | IMPACT_ANALYZED，G3待批准 | 用户已确认系统框架方向；单Run已有未基线化实现，跨Flow方案完成候选设计与自审 |
| 后续设计候选 | `AKB-2026-09-03-09` / `ACR-2026-0008..0010` | DRAFT，步骤一 REVIEWING | 候选设计已按总设计、七层设计和层内组件设计重组；系统职责仍在评审，尚未冻结接口或授权代码迁移 |

详细登记见[当前架构基线](../architecture-baseline.yaml)。

## 变更记录

L3→L4规范基线：[ACR-2026-0021](ACR-2026-0021-l34-protocol-baseline.md)，APPROVED / specification BASELINED（L34-SPEC-1.0.0）；只冻结开发协议，运行实现尚未开始。

新 Kernel TUI：[ACR-2026-0018](ACR-2026-0018-kernel-tui.md)，IMPACT_ANALYZED；LawClaw 应用使用 pi-tui 界面库，按组件/六个功能域归档候选设计；首期服务依赖待闭合，未实现运行代码。

Session单活Run绑定：[ACR-2026-0017](ACR-2026-0017-session-single-active-run.md)，IMPLEMENTING；每个Session只维护`0..1 ActiveRunBinding`，历史Run与Attempt接管归RunRegistry。进程内首个切片已移除`runIds/maxRunsPerSession`，持久协调协议仍待实现。

外部存储性能监控：[ACR-2026-0016](ACR-2026-0016-storage-io-observability.md)，IMPACT_ANALYZED；已形成读写放大计量、控制尾延迟、KV 恢复观测与负载验收候选方案，尚未实现或压测。

PEP/PDP本轮细化：[ACR-2026-0014](ACR-2026-0014-pep-pdp-detail.md)，IMPACT_ANALYZED，组件、补充契约与流程图已形成候选，五视角自审不等于批准；Child集成待FE接口收敛。

L3详细设计：[ACR-2026-0015](ACR-2026-0015-l3-detail.md)，IMPACT_ANALYZED；四个组件、七个功能域；按用户要求将可靠性留作外部约束，跨L4协议按ACR-0021规范基线。

Context本轮重整：[ACR-2026-0013](ACR-2026-0013-context-assembly.md)，IMPACT_ANALYZED，接口与并发/恢复候选重新评审；不沿用下述0011对Context增量的已评审结论。

本轮组件详细设计与必要性审查：[ACR-2026-0011](ACR-2026-0011-component-development-designs.md)，REVIEWED，五角色专项评审完成，待总体批准；不改变活动代码基线。

| 编号 | 名称 | 级别 | 状态 | 基线 |
|---|---|---|---|---|
| [ACR-2026-0001](ACR-2026-0001-pi-kernel-capability-probe.md) | Pi Kernel 能力探针 | L1 | BASELINED | AKB-2026-09-02-02 |
| [ACR-2026-0002](ACR-2026-0002-configurable-model-and-prompts.md) | 模型与提示词配置化 | L1 | BASELINED | AKB-2026-09-02-03 |
| [ACR-2026-0003](ACR-2026-0003-all-runtime-parameters.md) | 全部运行参数配置化 | L1 | BASELINED | AKB-2026-09-02-04 |
| [ACR-2026-0004](ACR-2026-0004-time-port-and-time-zone.md) | 统一时间与时区 Port | L2 | BASELINED | AKB-2026-09-02-05 |
| [ACR-2026-0005](ACR-2026-0005-formal-project-naming.md) | 正式工程命名与代码基线 | L2 | BASELINED | AKB-2026-09-02-06 |
| [ACR-2026-0006](ACR-2026-0006-pi-monorepo-integration.md) | Pi monorepo 集成 | L1 | BASELINED | AKB-2026-09-02-07 |
| [ACR-2026-0007](ACR-2026-0007-four-object-runtime-model.md) | 四对象 Runtime 模型 | L1 | BASELINED；仅保留为当前代码与历史事实 | AKB-2026-09-03-08 |
| [ACR-2026-0008](ACR-2026-0008-agent-system-boundary-v3.md) | Agent Kernel System Boundary V3 | L2 | DRAFT；步骤一由 0009 修订；保留未冲突的 V3 候选口径 | AKB-2026-09-03-09（候选） |
| [ACR-2026-0009](ACR-2026-0009-session-flow-engine-boundary.md) | Session、FlowEngine 与 Multi-agent 边界修订 | L2 | REVIEWING；步骤一 REVIEWING；覆盖 0008 的相关候选结论 | AKB-2026-09-03-09（候选） |
| [ACR-2026-0010](ACR-2026-0010-layered-design-documentation.md) | 三级设计文档信息架构 | L2 | IMPLEMENTED_FOR_REVIEW；步骤一 REVIEWING；不冻结接口 | AKB-2026-09-03-09（候选） |

## ACR-2026-0008 生效边界

Flow范围的最新用户决定、候选方案及复用冲突以[ACR-0012](ACR-2026-0012-flow-system-engine.md)和[ADR-0012](ADR-0012-flow-association-and-execution-gate.md)为准；以下保留0008～0010的历史批准边界，不能覆盖0012已经获得的明确用户授权。

- 已生效于候选设计文档：领域对象、所有权、服务协作、Port 边界和图形表达不得再沿用 ACR-2026-0007 的目标口径。
- 尚未生效于代码、Schema、数据库和部署：这些内容继续由活动基线解释，直到步骤五明确批准并完成迁移。
- 评审未通过时必须保留 ACR 和候选产物并标记 `REJECTED` 或 `ABORTED`，不得删除历史记录。

`ACR-2026-0009` 对 0008 中的 Session、Multi-agent、FlowEngine 和本地资源运行结论具有优先级；`ACR-2026-0010` 规定候选文档的唯一组织与权威来源。其余未冲突的 V3 候选边界继续有效。当前规范入口为[总设计](../../design/agent-kernel-design.md)和[文档清单](../../design/document-manifest.yaml)，旧混合文档只在 `docs/governance/archive/design-v3-pre-layering/` 保留。
