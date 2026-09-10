# ACR-2026-0014：PEP/PDP 开发级详细设计

- 日期：2026-09-08
- 状态：IMPACT_ANALYZED；G0–G2候选材料及自审，不代表G3批准
- 级别：L2，补充安全契约、逻辑Schema与操作承诺
- 提议人：Codex；确认人：总体架构所有者（待评审）
- 分支：codex/arch-agent-system-v3；起点HEAD：c482b79735d83c3150d962cd9dbe19d0264a226c
- 输入：含未提交工作的当前候选文档；本轮未提交、推送或改运行代码

## 1. 问题与目标

现有PEP/PDP文本只有职责摘要及CD-1概括，尚未展开资源求交、规则分派、内部协作者及各故障窗口。旧审批时序图由ToolRuntime请求PDP，违背总设计§6.1的L1决策/L3强制边界；层图还把Ask画为Permit流向Bridge。本轮按已有上层边界纠正两图，没有新增职责或选择下层覆盖上层。

目标是形成独立可评审的PDP、PEP组件文档和唯一补充契约，包含正常/异常/审批/恢复/扩展场景、PlantUML内部结构、算法、存储、SFMEA及实施验收输入。

## 2. 影响与方案

| 项目 | 本轮影响 |
|---|---|
| 职责/依赖 | 沿用Host编译身份、PDP判定、PEP强制、L3唯一启动；FE拥有调度/关联，不新建协调器 |
| 状态 | PEP无新聚合；PDP增加DecisionRecord细节，Permit/Approval仍独立 |
| 契约 | CD-1基础DTO保留；SEC-DEC-1补充资源类型、准备值、求值证据、Port读取与操作恢复 |
| 安全 | 规则deny优先、默认deny；必要审计失败阻断全部受保护动作；未知不重执行 |
| 部署 | 本地共同权威读序列；安全事务不写Tool/Memory/Child，不包含外部调用 |
| 外部边界 | 不解释Token/RBAC，不实现业务审批；总体Draw.io无需变更，保留用户手工画布 |
| Session边界 | 用户已确认权限Grant属于Security Plane；AgentSession/Barrier/Member不保存安全对象，只保留`executionEnvelopeRef`及Decision/Permit/Receipt/StartGrant引用；SM仍拥有Fork/Join协调 |

可行方案A（建议）：复用现有固定ActionKind集合与资源求交，静态适配表承担动作差异，安全应用服务提交，PEP分布在既有执行点。实现边界清楚，保持本地首版有界。

可行方案B：保持现有摘要，仅以CD-1契约驱动开发。无需新增契约补充，但内部资源类型、提交窗口和扩展机制仍由开发者自行决定，不能支持本次“详细设计”目标。未采纳。

外部策略DSL/远程PDP可作为将来独立方案，本轮没有此需求；不以引入它作为当前设计完整性的前提。

## 3. 权威产物与追踪

- [Security层入口](../../design/layers/security-plane/README.md)
- [PDP组件](../../design/layers/security-plane/components/permission-decision-engine/README.md)：PDP-S1～S5、PDP-T01～T09
- [PEP组件](../../design/layers/security-plane/components/pep-enforcement/README.md)：PEP-S1～S6、PEP-T01～T11
- [SEC-DEC-1](../../design/layers/security-plane/contracts/security-decision-contract.md)：补充契约、逻辑持久化与回退
- [专项自审与证据](../../design/layers/security-plane/reviews/pep-pdp-design-2026-09-08.md)

旧SEC-CMP-001/003的职责、错误、容量与TC-01～06在新版正文/测试表逐项继承；删除“本组件不展开算法/DTO”的陈旧概括，基础签名仍引用CD-1。未移除代码功能。0011历史评审不自动覆盖本次增量。

## 4. 门禁、开放项与回退

文档验收：总→层→组件→契约导航有效；类图和每个场景具有对应流程；规则/绑定/事务/错误/恢复/测试可追踪。运行验收另需PDP-Txx/PEP-Txx及完整安全链证据，本文不声称通过。

G3需评审Host资源编译、SecurityUnitOfWork、审计实现与L3启动集成。Child具体绑定依赖FE SR-04；旧CD-1 reservationId只作为遗留字段记录，不允许据此重建已删除的资源池，未在本轮擅自冻结替代Child接口。

迁移和回退方案见SEC-DEC-1§7；本轮无数据库变更。文档回退只撤回0014补充及本轮局部修改，不能git reset覆盖并行工作。未完成项保留开放，未修改active baseline或approved_changes。

### 4.1 Session安全边界一致性追踪

| 上层约束及来源位置 | 模块设计位置与实际行为 | 结论 | 受影响场景与处理 |
|---|---|---|---|
| 总设计§5.3：Permit是Security独立聚合 | SessionManager§2.1.1：AgentSession零权限对象，Coordinator只存SecurityEvidenceRefs | 一致 | Fork恢复必须查询Security原事实，不能从Session恢复权限 |
| L1层§4：ExecutionPermit权威归Security | SessionManager§4.2/4.4：child.create执行`decide→consume→authorizeStart→branch→FE受理` | 一致 | Ask/Deny/撤销时Child Session和Run创建数均为0 |
| Security层§1/PEP§6：Child实际效果归SM，授权归Security | CD-1 SessionManager/Child绑定加入executionEnvelopeRef及安全引用 | 一致 | Parent授权不下传；Child后续动作重新判定 |
| 当前实现`ToolExecutionScope/AgentRun`仍携`sessionCeiling`，旧授权服务直接对其求交 | 候选契约已改为Security加载AuthorizationState/ResourceCeiling；代码尚未迁移 | 冲突 | 实现阶段删除sessionCeiling传递链，改为executionEnvelopeRef+Security读取；完成SES-T-22/SES-JOIN-T-15前不得宣称实现 |

本表只确认本轮涉及的Session/Security边界。它不把候选文档提升为活动实现基线，也不掩盖当前代码中的旧短时Grant、`sessionCeiling`和同步ALLOW/DENY实现。

## 5. 批准记录

2026-09-08总体架构所有者确认局部边界决定：权限Grant必须从Session模型移出，由Security Plane拥有；SessionManager通过外部能力引用和安全Port协作。该确认关闭本项职责归属歧义，不等于批准0014全部接口、存储或运行实现。

其余内容仍待总体架构所有者评审。本次授权仅更新详细设计；运行实现、数据库迁移、提交与推送不在本轮范围。

## 6. 按用户要求归入架构层目录

2026-09-08按用户“放到对应的架构层目录”要求完成资料迁移，architecture-impact: none。PDP、PEP正文分别进入Security层的组件子目录；SEC-DEC-1进入该层contracts；专项自审与原始证据进入该层reviews。ACR仍由本治理目录保存，跨层契约仍由公共contracts维护，图源保持既有按层分组的位置。

迁移不修改职责、规则、数据或批准状态；移入正文仅重写相对链接，原始证据JSON字节不变。新目录映射、迁移前后摘要及引用更新见[迁移证据](../../design/layers/security-plane/reviews/directory-migration-2026-09-08.json)；阅读入口见[Security层归档](../../design/layers/security-plane/README.md#8-层内文档归档与阅读顺序)。旧评审仍绑定原输入，本次不是重新确认后续工作区架构变更。
