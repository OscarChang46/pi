# LawClaw Agent Kernel 文档中心

本文档中心采用“总设计 → C4 层设计 → 层内组件设计”的三级结构。契约、部署、领域参考、Verification 和治理记录是正交材料，不得成为第二份组件设计。

## 1. 当前状态

| 范围 | 基线与变更 | 状态 |
|---|---|---|
| 当前代码实现 | `AKB-2026-09-03-08` / `ACR-2026-0007` | ACTIVE / BASELINED |
| 后续目标设计 | `AKB-2026-09-03-09` / `ACR-2026-0009` | DRAFT，步骤 1/5 REOPENED |
| 文档信息架构 | `ACR-2026-0010` | REVIEWING，三级结构已实施 |

五步评审全部通过前，不得依据候选文档修改运行代码、公共 Schema 或数据库。

## 2. 推荐阅读路径

1. [架构变更标准流程](governance/architecture-change-process.md)
2. [架构变更索引](governance/changes/README.md)
3. [V3.1 步骤一评审](governance/reviews/agent-kernel-v3.1-step1-review.md)
4. [Agent Kernel System 总设计](design/agent-kernel-design.md)
5. 从总设计进入对应 C4 层，再进入层内组件。
6. 需要接口语义时查阅[边界契约注册表](design/contracts/README.md)。
7. 需要对象所有权时查阅[领域对象目录](design/reference/domain-object-catalog.md)。
8. 需要风险与验收时查阅[Verification 索引](verification/README.md)。

## 3. 七个 C4 层

| 层 | 唯一层设计 | 核心职责 |
|---|---|---|
| L1 Control | [L1 层设计](design/layers/l1-control/README.md) | Run/Session 控制、调度、上下文、记忆、资源准入和结构化 Child Run |
| L2 Cognitive | [L2 层设计](design/layers/l2-cognitive/README.md) | Agent Loop、规范化 Parser 和 Agent Adapter 边界 |
| Security Plane | [Security 层设计](design/layers/security-plane/README.md) | PDP、PEP、Approval 和一次性 Permit |
| L3 Tool Runtime | [L3 层设计](design/layers/l3-tool-runtime/README.md) | 工具目录、ToolCall 状态和执行前 Guard |
| L4 Execution Runtime | [L4 层设计](design/layers/l4-execution-runtime/README.md) | Tool Provider 与一次性有界 Sandbox 执行 |
| Operations Plane | [Operations 层设计](design/layers/operations-plane/README.md) | 日志、Trace、指标、健康、诊断和安全审计 |
| Infrastructure Plane | [Infrastructure 层设计](design/layers/infrastructure-plane/README.md) | 存储、资源、进程、通信、出口、Secret 和时间机制 |

Client Interface、Backend、Model Provider 和业务 Tool Provider 是外部边界，不属于 Kernel 内部层。

## 4. 正交设计材料

| 目录 | 唯一职责 |
|---|---|
| [contracts](design/contracts/README.md) | Port、DTO、错误、幂等、超时、重试和兼容语义 |
| [deployment](design/deployment/README.md) | Local-first 部署档案和 Composition Root |
| [reference](design/reference/domain-object-catalog.md) | 领域对象 ID、生命周期和状态所有者索引 |
| [verification](verification/README.md) | SFMEA、系统场景和验收证据 |
| [diagrams](design/diagrams/) | PlantUML 权威图源及派生 SVG |
| [governance](governance/) | 架构基线、ACR、评审和历史归档 |
| [runtime](runtime/pi-kernel-runtime.md) | 当前实现、配置和运行事实 |

## 5. 图形分层

| 级别 | PlantUML 目录 | 表达内容 |
|---|---|---|
| 总设计 | [system](design/diagrams/system/) | C4 Context/Container、领域全集和依赖 |
| 层设计 | [layers](design/diagrams/layers/) | 七层 C4 Component 图 |
| 组件设计 | [components](design/diagrams/components/) | 状态、类和组件生命周期 |
| 跨层行为 | [scenarios](design/diagrams/scenarios/) | 启动、审批、取消、恢复和事务顺序 |
| 契约与部署 | [contracts](design/diagrams/contracts/)、[deployment](design/diagrams/deployment/) | 边界和部署关系 |

PlantUML 是正式内容源，SVG 只用于预览。Draw.io 是人工评审画布，不替代 PlantUML；当前本地手工修改不属于本轮文档治理提交。

## 6. 文档权威规则

1. 总设计只拥有系统职责、C4 层边界、全局依赖和不变量。
2. 层设计只拥有层职责、组件清单、允许依赖、控制流、数据流和故障隔离。
3. 组件设计只拥有组件状态、算法、生命周期、并发恢复和 Port 使用。
4. 跨层接口签名和 DTO 只能在 `contracts/` 维护。
5. 部署机制只能在 `deployment/` 或 Infrastructure Adapter 组件文档维护。
6. Verification 只定义风险和验收，不反向定义设计。
7. 归档文档是非规范性历史，不得被活动设计作为权威来源引用。

统一模板见[层设计模板](design/templates/layer-design-template.md)和[组件设计模板](design/templates/component-design-template.md)。文档元数据、父子关系和唯一性由 `design/document-manifest.yaml` 与自动化门禁校验。

## 7. 变更完成检查

- [ ] 总设计可到达七个层设计，层设计可到达全部组件。
- [ ] 每个层和组件只有一个权威文档及唯一 `doc_id`。
- [ ] 每个跨层调用具有唯一 `BND-*` 契约。
- [ ] 活动文档不存在旧混合设计引用。
- [ ] PlantUML、SVG、Markdown 链接和架构禁止路径门禁通过。
- [ ] 未经步骤五批准，没有修改代码、Schema、数据库或部署基线。
