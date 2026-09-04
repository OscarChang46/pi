# LawClaw Agent Kernel 文档中心

本目录集中管理 Agent Kernel 的架构基线、候选设计、领域模型、边界协议、测试评审、运行事实和架构变更记录。阅读或修改文档前，请先确认所引用内容属于“活动代码基线”还是“候选设计”，不要把评审中的目标模型描述成已经落地的实现。

## 1. 当前状态

| 范围 | 基线与变更 | 状态 | 使用规则 |
| --- | --- | --- | --- |
| 当前代码实现 | `AKB-2026-09-03-08` / `ACR-2026-0007` | ACTIVE / BASELINED | 用于解释当前代码事实，不再作为后续目标设计口径 |
| 后续目标设计 | `AKB-2026-09-03-09` / `ACR-2026-0009` | DRAFT，步骤 1/5 REOPENED | 修订 Session、FlowEngine、Subagent/Multi-agent 和本地运行边界，尚未授权代码迁移 |
| 五步评审 | 因职责边界变化重新评审步骤一 | REVIEWING | 步骤五批准前不得把候选基线标记为活动基线 |

权威状态以 [架构基线清单](governance/architecture-baseline.yaml) 和 [ACR-2026-0009](governance/changes/ACR-2026-0009-session-flow-engine-boundary.md) 为准。

## 2. 推荐阅读顺序

1. [架构变更标准流程](governance/architecture-change-process.md)：理解五步评审、变更准入和回退规则。
2. [架构变更索引](governance/changes/README.md)：确认活动代码基线与候选设计基线。
3. [ACR-2026-0008：Agent Kernel System Boundary V3](governance/changes/ACR-2026-0008-agent-system-boundary-v3.md)：理解本轮设计决策、边界和评审状态。
4. [V3 架构评审入口](design/agent-kernel-v2-architecture-review.md)：查看边界结论、图形入口和待评审项。文件名保留历史名称，正文已按 V3 候选模型维护。
5. [Agent Kernel 主设计](design/agent-kernel-design.md)：查看系统职责、内部模块、领域模型及技术方案。
6. [领域对象目录](design/agent-kernel-domain-object-catalog.md)：查询对象所有者、生命周期、权威状态和详细定义来源。
7. 按主文档章节进入对应的[子系统设计目录](#32-子系统设计导航)，评审各模块聚合、Port、生命周期和故障语义。
8. [C4 层间边界协议与接口设计](design/c4-boundary-protocols.md)：评审跨层协议、Local-first 绑定和禁止路径。
9. [SFMEA 与系统测试用例清单](design/agent-kernel-system-sfmea-test-plan.md)：评审调度、日志、协议、安全和恢复场景。
10. [Pi Kernel Runtime 运行说明](runtime/pi-kernel-runtime.md)：了解当前工程的运行、配置和验证事实。

## 3. 文档地图

### 3.1 候选架构与领域设计

| 文档 | 用途 | 权威性 |
| --- | --- | --- |
| [V3 架构评审入口](design/agent-kernel-v2-architecture-review.md) | 汇总候选边界、评审结论和导航 | 候选规范 |
| [Agent Kernel 主设计](design/agent-kernel-design.md) | 总体职责、组件、模型、安全、韧性与交付设计 | 候选规范 |
| [领域对象目录](design/agent-kernel-domain-object-catalog.md) | 对象 ID、所属子域、生命周期、权威状态和接口索引 | 候选规范 |
| [C4 层间边界协议](design/c4-boundary-protocols.md) | L1–L4、Security、Ops、Infrastructure 的协议档案 | 步骤二候选规范 |
| [工具调用子系统](design/tool-call-subsystem-design.md) | Tool Runtime、权限、Provider、Sandbox 与事件边界 | 候选规范 |
| [技术权限审批子系统](design/technical-approval-subsystem-design.md) | PEP/PDP、ActionProposal、Decision、Permit 与业务审批边界 | 候选规范 |
| [SFMEA 与系统测试](design/agent-kernel-system-sfmea-test-plan.md) | 故障模式、影响、控制措施和系统验收用例 | 评审与验收依据 |

### 3.2 子系统设计导航

主设计文档只保存全局职责、边界和不变量；下表中的子文档是对应子系统细节的唯一维护入口。

| 主文档入口 | 子系统设计 | 主要内容 |
|---|---|---|
| [5 领域对象与聚合边界](design/agent-kernel-design.md#5-领域对象与聚合边界) | [Registry、能力与技术路由](design/agent-registry-routing-subsystem-design.md) | AgentDefinition、CapabilityDescriptor、RouteProposal/RouteSnapshot |
| [6.3 层间协议](design/agent-kernel-design.md#63-层间协议与接口候选) | [稳定协议外观层](design/protocol-facade-subsystem-design.md) | AgentKernelProtocolV1、Facade、Transport Adapter 与版本规则 |
| [7 Session、FlowEngine 与 Runtime](design/agent-kernel-design.md#7-agentsession调度flowengine-与-runtime) | [Session、FlowEngine 与资源调度](design/session-flow-engine-resource-subsystem-design.md)；[Run、调度与 Runtime](design/run-scheduling-runtime-subsystem-design.md) | Session/Run/Loop、进程模型、执行槽、调度和恢复 |
| [8–9 身份与权限](design/agent-kernel-design.md#8-身份租户与执行信封) | [权限、审批与执行授权](design/technical-approval-subsystem-design.md) | ExecutionEnvelope、PermissionRequest、ExecutionPermit 和审批边界 |
| [10 工具与沙箱](design/agent-kernel-design.md#10-工具扩展与沙箱) | [工具调用与沙箱](design/tool-call-subsystem-design.md) | ToolDefinition、ToolCall、Provider、Sandbox 和副作用 |
| [11 上下文与记忆](design/agent-kernel-design.md#11-上下文与长期记忆) | [Context 与长期记忆](design/context-memory-subsystem-design.md) | ContextThread、ContextFrame、MemorySpace 和 MemoryCandidate |
| [12 Subagent 与上层 Multi-agent 边界](design/agent-kernel-design.md#12-subagent-与上层-multi-agent-边界) | [Session、FlowEngine 与资源调度](design/session-flow-engine-resource-subsystem-design.md#5-subagent-与上层-multi-agent-的边界) | Child Run 结构化生命周期；团队组建由上层业务负责 |
| [15 运维与基础设施](design/agent-kernel-design.md#15-pi-adapter运维与基础设施) | [Operations/Infrastructure 最小能力](design/operations-infrastructure-minimum-design.md) | 本地日志、Trace、指标、健康、SQLite、队列、资源和 Sandbox |

### 3.3 架构图

图形内容以 `.puml` 为权威源；SVG 仅用于 Markdown 预览和视觉检查，不作为可编辑设计源。修改顺序固定为：修改 PlantUML → 语法与边界校验 → 重新生成预览 → 检查文字裁切和连线。

| 视图 | PlantUML 权威源 | 预览 |
| --- | --- | --- |
| Agent System 领域对象全集 | [04-agent-system-domain-universe.puml](design/diagrams/domain/04-agent-system-domain-universe.puml) | [领域类图 SVG](design/agent-kernel-v3-domain-classes.svg) |
| 系统服务高层协作 | [05-system-service-collaboration.puml](design/diagrams/domain/05-system-service-collaboration.puml) | [C4 组件图 SVG](design/agent-kernel-v3-service-collaboration.svg) |
| Agent 定义、能力与路由 | [06-agent-definition-capability-routing.puml](design/diagrams/domain/06-agent-definition-capability-routing.puml) | PlantUML 源内维护 |
| Run、调度与执行 | [07-run-scheduling-execution.puml](design/diagrams/domain/07-run-scheduling-execution.puml) | PlantUML 源内维护 |
| 上下文与长期记忆 | [08-context-memory.puml](design/diagrams/domain/08-context-memory.puml) | PlantUML 源内维护 |
| 权限、身份与执行授权 | [09-permission-authority.puml](design/diagrams/domain/09-permission-authority.puml) | PlantUML 源内维护 |
| 工具、调用与沙箱 | [10-tool-sandbox.puml](design/diagrams/domain/10-tool-sandbox.puml) | PlantUML 源内维护 |
| Subagent 生命周期与上层 Multi-agent 边界 | [11-subagent-multiagent.puml](design/diagrams/domain/11-subagent-multiagent.puml) | PlantUML 源内维护 |
| C4 层间边界协议 | [12-c4-boundary-protocols.puml](design/diagrams/domain/12-c4-boundary-protocols.puml) | [边界协议 SVG](design/agent-kernel-v3-boundary-protocols.svg) |

[基础架构图目录](design/diagrams/)保留 Context、组件、依赖、状态机、关键序列、事务和部署视图；原 `08-data-model` 已由更完整的[领域对象全集](design/diagrams/domain/04-agent-system-domain-universe.puml)取代。[Draw.io 评审文件](design/agent-kernel-v2-review.drawio)用于历史评审与人工调整，不取代对应 PlantUML 的内容权威性。

### 3.4 治理与历史

| 入口 | 内容 |
| --- | --- |
| [架构基线清单](governance/architecture-baseline.yaml) | 活动基线、候选基线、评审门禁和约束来源 |
| [架构变更标准流程](governance/architecture-change-process.md) | 五步评审、职责、产物和质量门禁 |
| [架构变更索引](governance/changes/README.md) | ACR 状态、演进关系和适用范围 |
| [ACR 历史目录](governance/changes/) | 从能力探针到 V3 系统边界的完整决策记录 |
| [架构变更申请模板](governance/templates/architecture-change-request-template.md) | 新建 ACR |
| [架构决策记录模板](governance/templates/architecture-decision-record-template.md) | 新建 ADR |
| [架构评审检查表](governance/templates/architecture-review-checklist.md) | 评审准入和完成检查 |

### 3.5 当前实现与运行事实

[Pi Kernel Runtime 运行说明](runtime/pi-kernel-runtime.md)描述当前包的配置、CLI、日志、构建和测试方式。它用于记录已经存在的工程行为；当其与 V3 候选设计不一致时，应记录“现状—目标”差距，不得静默改写为目标状态。

## 4. 五步评审导航

| 步骤 | 评审主题 | 当前状态 | 主要材料 |
| --- | --- | --- | --- |
| 1 | 系统职责、子域边界、对象所有权与高层协作 | 因 `ACR-2026-0009` 重新评审 | [Session/FlowEngine 边界](design/session-flow-engine-resource-subsystem-design.md)、[最小运维与基础设施](design/operations-infrastructure-minimum-design.md) |
| 2 | 层间协议、Port、命令、事件和数据契约 | 等待步骤一重新确认 | [C4 层间边界协议](design/c4-boundary-protocols.md)、[SFMEA 与系统测试](design/agent-kernel-system-sfmea-test-plan.md) |
| 3 | 生命周期、数据流、并发、事务与韧性 | 未开始 | 等待步骤二确认后建立基线 |
| 4 | 安全、权限、运维、容量和部署 | 未开始 | 等待步骤三确认 |
| 5 | 一致性验收与代码迁移授权 | 未开始 | 前四步产物、追踪矩阵和验证报告 |

## 5. 文档维护规则

1. 架构职责、对象所有权、跨层协议或安全边界发生变化时，必须先登记 ACR，再修改候选设计。
2. 每项候选设计必须标注对应基线、评审步骤和状态；`DRAFT`、`REVIEWING` 不等于代码实现授权。
3. 同一领域对象只能有一个详细定义来源；其他文档使用链接或 `<<reference>>`，不得复制并形成第二份权威定义。
4. 跨子域调用必须经过命名 Port；文档、PlantUML、Schema 和代码中的方向与数据所有者必须一致。
5. PlantUML 是正式图形内容源，SVG 是派生预览。不得直接修改 SVG 表达架构变更。
6. 历史 ACR 和已基线化事实不得删除；被替代内容应标明后继变更和适用范围。
7. 文档名称使用小写英文和连字符；稳定对象、边界、约束和测试项使用既有编号体系。
8. 文档不得记录 API Key、Prompt 正文、工具敏感参数、用户内容或其他秘密数据。

## 6. 变更完成检查

- [ ] README、架构基线清单、ACR、架构评审入口中的状态一致。
- [ ] 新增或修改的对象已进入领域对象目录，并指向唯一详细定义图。
- [ ] 新增跨边界调用具有 Port、调用方、实现方、协议、数据所有者和故障语义。
- [ ] PlantUML 可解析，派生预览已刷新并通过可读性检查。
- [ ] Markdown 本地链接有效，文档引用没有指向临时文件或个人绝对路径。
- [ ] SFMEA、系统测试和约束追踪已覆盖新增风险。
- [ ] 未经步骤五批准，没有修改代码、Schema、数据库或部署基线。

## 7. 目录约定

```text
docs/
├── README.md                 # 本文档：统一入口与管理目录
├── design/                   # 候选架构、领域设计、协议、测试和图形
│   └── diagrams/             # PlantUML 权威源及统一主题
├── governance/               # 基线、流程、ACR/ADR 与评审模板
└── runtime/                  # 当前实现、配置、运行和验证事实
```
