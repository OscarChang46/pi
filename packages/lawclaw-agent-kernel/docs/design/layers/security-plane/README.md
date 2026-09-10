---
doc_id: SEC-DES-001
level: layer
layer: Security Plane
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 技术权限决策、Permit、PEP 与外部审批桥接的层边界
parent: SYS-DES-001
interfaces: [BND-SEC-001]
diagrams: [VIEW-SECURITY-COMPONENTS, SCN-TOOL-APPROVAL]
supersedes: ["[归档技术审批子系统设计](../../../governance/archive/design-v3-pre-layering/technical-approval-subsystem-design.md)"]
---

# Security Plane 层设计

![Security Plane 组件图](../../diagrams/rendered/layers/03-security-plane-components.svg)

[查看 PlantUML 权威源](../../diagrams/layers/03-security-plane-components.puml)

## 1. 职责与信任边界

Security Plane 对 Kernel 内受保护动作提供统一的技术判定和可验证执行授权。Backend/KernelHost 在进入 Kernel 前终止 User Token、解析 Tenant/RBAC 并编译技术策略快照；Kernel 只消费可信的 `ExecutionEnvelopeRef` 及已编译最小授权上下文，不拥有用户目录、RBAC/ABAC 权威库或业务审批规则。

决策与执行严格分离：PDP 对不可变动作提案返回 Allow、Ask 或 Deny；Allow 签发短时、作用域化、一次性 `ExecutionPermit`；L1 PEP 协调决策并只把获准动作交给执行层；真正执行点在执行前校验并原子消费 Permit。L3 ToolExecutionGuard 不进行第二次策略裁决。

Security Plane 是全部权限能力事实的唯一所有者：`AuthorizationState`、Decision、Permit、Receipt、StartGrant、授权版本、撤销与过期均不得下沉到 Session 聚合。SessionManager、RunRegistry、MemoryManager 和 ToolCallRuntime 只能保存安全记录的不透明引用及自身动作回执；引用不等于授权，恢复时必须通过 Security Port 核对原事实。特别是 sub-session 创建：SM 拥有 Fork/Join 协调，Security 拥有 `child.create` 的判定和一次性执行资格，Child Session 只保存上下文血缘，不保存 Parent 或自身的 Grant。

## 2. 组件

| 组件 | 唯一职责 | 详细设计 |
|---|---|---|
| PermissionDecisionEngine | 基于编译策略快照作 Allow/Ask/Deny 技术判定 | [PermissionDecisionEngine](components/permission-decision-engine/README.md) |
| ExecutionPermit | 维护执行授权的不变量和消费状态 | [ExecutionPermit](components/execution-permit.md) |
| PEP Enforcement | 在 L1 协调判定并在真实执行点强制 Permit | [PEP Enforcement](components/pep-enforcement/README.md) |
| ApprovalBridge | 将 Ask 映射到 Kernel 外部技术审批通道 | [ApprovalBridge](components/approval-bridge.md) |

## 3. 允许依赖

L1 PEP 可调用 PermissionDecisionEngine 与 ApprovalBridge，并把 Permit 引用交给 L3、SessionManager Coordinator、MemoryManager 等受保护执行点。执行点只能调用 Permit 校验/消费能力，不能查询策略源后自行裁决。Security Plane 可读取外部已编译策略快照和耐久安全存储 Port，但不能反向调用 Backend 身份系统解释 Token。

## 4. 决策与执行流

![工具调用与异步审批时序](../../diagrams/rendered/scenarios/06-tool-approval-sequence.svg)

[查看 PlantUML 权威源](../../diagrams/scenarios/06-tool-approval-sequence.puml)

1. L1 将候选动作冻结为不可变 ActionProposal，并绑定 Run、Agent、资源、动作摘要和策略版本。
2. PermissionDecisionEngine 返回 Deny、Ask 或 Allow，不执行动作。
3. Deny 形成可审计拒绝；Ask 持久化技术 PermissionRequest 并由 ApprovalBridge 异步提交外部审批；Allow 签发 Permit。
4. L1 只将带 Permit 的动作提交 L3。
5. L3 ToolExecutionGuard 在真实执行点验证绑定、有效期、策略版本和未消费状态，并原子消费一次性 Permit。
6. 校验失败、状态未知或策略版本失配一律失败关闭。

## 5. 数据、并发与故障隔离

PermissionRequest 与 ExecutionPermit 是独立聚合，不能内嵌为 Runtime 临时布尔值。Permit 消费必须支持并发竞争下只有一个成功者；决策重放以 ActionDigest 与请求标识去重。审批等待不占用同步线程或 Runtime 槽。审计写入失败时，高风险动作不得继续。

### 5.1 数据模型总览

下表按授权链路组织数据模型，链接单向指向详细文档中的权威定义。本页只说明职责和关系，不复制字段 Schema。以下均为候选逻辑模型，不表示数据库表或代码类型已实现。

| 模型 | 用途与权威所有者 | 详细定义 |
|---|---|---|
| AuthorizationState、PolicySnapshot | Security 保存 Host 安装的当前授权投影；PDP 读取对应的不可变策略快照 | [授权状态](../../contracts/component-development-contracts-v1.md#authorization-state)、[策略快照](../../contracts/component-development-contracts-v1.md#policy-snapshot) |
| ActionKind、SecurityAction、SecurityBinding | 封闭动作种类、实际载荷及 Run/信封/资源/摘要绑定；L1 从可信输入构造，Security 校验 | [动作种类](../../contracts/component-development-contracts-v1.md#action-kind)、[动作及 payload](../../contracts/component-development-contracts-v1.md#security-action-payloads)、[动作结构](../../contracts/component-development-contracts-v1.md#security-action)、[绑定](../../contracts/component-development-contracts-v1.md#security-binding) |
| ResourceAccess、NetworkAccess、ResourceCeiling、ResourceDemand | 可信资源与网络目标、授权上限和本次动作需求；PDP 对各上限求交 | [资源引用](contracts/security-decision-contract.md#resource-access)、[网络目标](contracts/security-decision-contract.md#network-access)、[上限](contracts/security-decision-contract.md#resource-ceiling)、[需求](contracts/security-decision-contract.md#resource-demand) |
| DecisionRequest、PreparedAction、PreparedDecision | 公开判定输入、验证后的动作及纯求值冻结输入；后两者仅由 PDP 内部构造 | [请求](../../contracts/component-development-contracts-v1.md#decision-request)、[验证后动作](contracts/security-decision-contract.md#prepared-action)、[冻结输入](contracts/security-decision-contract.md#prepared-decision) |
| Evaluation、Decision、DecisionRecord | 求值证据、公开 Allow/Ask/Deny 结果和不可变决策事实；PDP 维护 | [求值结果](contracts/security-decision-contract.md#evaluation)、[公开结果](../../contracts/component-development-contracts-v1.md#decision)、[决策记录](contracts/security-decision-contract.md#decision-record) |
| PermitIssueInput、PermitRecord、PermitReceipt | 签发输入、一次性许可及消费回执；PermitService 维护生命周期 | [签发输入](../../contracts/component-development-contracts-v1.md#permit-issue-input)、[许可](../../contracts/component-development-contracts-v1.md#permit-record)、[消费回执](../../contracts/component-development-contracts-v1.md#permit-receipt) |
| StartGrant、GrantRecord | 启动授权及其 claim/executor 私有绑定；PermitService 维护，不代表执行成功 | [启动授权](../../contracts/component-development-contracts-v1.md#start-grant)、[私有记录](../../contracts/component-development-contracts-v1.md#grant-record) |
| PermissionRequest、Callback、VerifiedApproval | PDP 创建审批请求，ApprovalBridge 校验回调并迁移状态，PDP 加载可信批准事实 | [审批请求](../../contracts/component-development-contracts-v1.md#permission-request)、[回调](../../contracts/component-development-contracts-v1.md#callback)、[可信批准](contracts/security-decision-contract.md#verified-approval) |
| 安全 outbox、DecisionArtifactLink | 安全事务的可靠投递与决策所需 Artifact 引用保留；不替代审计 Journal 确认 | [outbox 字段](contracts/security-decision-contract.md#security-outbox)、[记录键、关联与事务](contracts/security-decision-contract.md#5-候选耐久结构与事务) |
| AuthorizedAction、ActionBinding、SecurityEvidenceRefs | 工具交付载体、绑定别名及跨层安全证据引用；PEP 不另建权限聚合，Session 协调记录只保存引用 | [工具交付](../../contracts/component-development-contracts-v1.md#authorized-action)、[绑定别名](../../contracts/component-development-contracts-v1.md#action-binding)、[外部引用](../../contracts/component-development-contracts-v1.md#security-evidence-refs) |

### 5.2 模型关系与生命周期

DecisionRequest 将动作、绑定及可选审批引用送入 PDP；PDP 根据当前 AuthorizationState 加载 PolicySnapshot，并将资源需求、各级上限及可信审批事实冻结为 PreparedDecision。Evaluation 与公开 Decision 一起保存于 DecisionRecord。

Allow 关联 PermitRecord；消费后形成 PermitReceipt，执行点再次校验当前资格后取得 StartGrant，其私有 GrantRecord 绑定本次 claim 与 executor。消费和授权回执都不等于执行结果，实际执行事实仍由执行组件维护。

工具 Ask 关联 PermissionRequest；审批通过后，以新权限命令重新判定并保存新的 DecisionRecord，原 Ask 记录不改写为 Allow。首版 Child/Memory 的 Ask 保存求值证据并返回拒绝，不创建工具审批等待状态。

Session、Run、Memory 与 Tool 的业务记录通过安全引用关联本层事实；不得复制授权正文，也不得把历史引用当作新的执行授权。PEP 负责协调和强制检查，没有独立的权限数据存储。

## 6. 非目标与评审边界

本层不选择业务审批人、不发送业务通知、不拥有组织角色，也不决定 Multi-agent 团队策略。层设计只维护分工，字段、算法和存储候选由下列权威入口维护，不在本页复制。

## 7. PEP/PDP详细设计入口（2026-09-08）

- [PDP详细设计](components/permission-decision-engine/README.md)：外部场景、纯规则优先级、资源求交、内部类关系、审批与决策恢复。
- [PEP详细设计](components/pep-enforcement/README.md)：L1结果分派、真实执行点、consume/authorizeStart/STARTED、Memory与Child协作、未知副作用。
- [SEC-DEC-1契约](contracts/security-decision-contract.md)：补齐CD-1资源类型、操作承诺、逻辑存储与必要审计确认点。
- [变更与批准状态](../../../governance/changes/ACR-2026-0014-pep-pdp-detail.md)及[五视角自审](reviews/pep-pdp-design-2026-09-08.md)。

所有受保护动作必要审计失败均阻断；只写outbox不等于Journal确认。Grant/消费回执不是执行结果，authorizeStart是新启动授权线性化点，执行端STARTED CAS决定唯一发起者。FE拥有关联、调度与取消恢复，PEP不新增协调器。完整Child绑定仍受FE SR-04未闭合接口约束。

上述为候选详细设计，不改变活动实现基线，不将现有Grant或部分SQLite消费实现视为完整协议。

## 8. 层内文档归档与阅读顺序

PEP/PDP资料集中归入本架构层。组件正文按独立组件目录维护；两组件共享的安全内部契约放在层内contracts；专项评审及原始证据放在层内reviews。跨层BND/CD-1契约与ACR仍保留各自唯一来源，图形继续使用统一图目录中的security-plane分组。

| 归属 | 入口 |
|---|---|
| PDP组件职责、算法、场景与验收 | [components/permission-decision-engine/README.md](components/permission-decision-engine/README.md) |
| PEP组件强制、执行与恢复 | [components/pep-enforcement/README.md](components/pep-enforcement/README.md) |
| 层内共享详细契约 | [contracts/security-decision-contract.md](contracts/security-decision-contract.md) |
| 本次设计自审 | [reviews/pep-pdp-design-2026-09-08.md](reviews/pep-pdp-design-2026-09-08.md) |
| 原始设计检查证据 | [reviews/pep-pdp-design-evidence-2026-09-08.json](reviews/pep-pdp-design-evidence-2026-09-08.json) |
| 目录迁移映射与内容保全证据 | [reviews/directory-migration-2026-09-08.json](reviews/directory-migration-2026-09-08.json) |
| 组件图源及预览 | [PlantUML](../../diagrams/components/security-plane/) / [SVG](../../diagrams/rendered/components/security-plane/) |

阅读顺序为本页→对应组件→共享契约→专项评审。旧路径已迁移并修复引用，不保留第二份正文。原设计证据JSON按字节保留，其中path与hash对应当时输入；新位置由迁移映射解释，不能将旧评审结论当作目录迁移后的重新语义验收。当前工作区后续职责变更仍需独立重审。
