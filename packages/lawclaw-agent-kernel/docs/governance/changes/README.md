# Agent Kernel 架构变更索引

本索引用于区分“活动代码基线”和“后续候选设计”。`BASELINED` 记录描述已经生效的历史与实现事实；`DRAFT` 或 `REVIEWING` 记录只能指导候选设计，不授权代码迁移。

## 当前视图

| 视图 | 基线/变更 | 状态 | 权威含义 |
|---|---|---|---|
| 活动代码基线 | `AKB-2026-09-03-08` / `ACR-2026-0007` | ACTIVE / BASELINED | 当前代码仍实现四对象 Runtime 模型 |
| 后续设计候选 | `AKB-2026-09-03-09` / `ACR-2026-0008..0010` | DRAFT，步骤一 REVIEWING | 候选设计已按总设计、七层设计和层内组件设计重组；系统职责仍在评审，尚未冻结接口或授权代码迁移 |

详细登记见[当前架构基线](../architecture-baseline.yaml)。

## 变更记录

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

- 已生效于候选设计文档：领域对象、所有权、服务协作、Port 边界和图形表达不得再沿用 ACR-2026-0007 的目标口径。
- 尚未生效于代码、Schema、数据库和部署：这些内容继续由活动基线解释，直到步骤五明确批准并完成迁移。
- 评审未通过时必须保留 ACR 和候选产物并标记 `REJECTED` 或 `ABORTED`，不得删除历史记录。

`ACR-2026-0009` 对 0008 中的 Session、Multi-agent、FlowEngine 和本地资源运行结论具有优先级；`ACR-2026-0010` 规定候选文档的唯一组织与权威来源。其余未冲突的 V3 候选边界继续有效。当前规范入口为[总设计](../../design/agent-kernel-design.md)和[文档清单](../../design/document-manifest.yaml)，旧混合文档只在 `docs/governance/archive/design-v3-pre-layering/` 保留。
