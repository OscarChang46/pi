# PEP/PDP详细设计：上下层一致性与五视角自审

- 日期：2026-09-08；关联[ACR-2026-0014](../../../../governance/changes/ACR-2026-0014-pep-pdp-detail.md)
- 执行者：Codex单代理，按architecture-design-review技能完成；五种视角不代表五名独立评审人
- 结论：候选详细设计已形成；本记录不授予实施批准，完整集成仍有开放项
- 基线：HEAD c482b79735d83c3150d962cd9dbe19d0264a226c，codex/arch-agent-system-v3；读取当前未提交候选资料，不以HEAD代表所有输入

## 1. 来源与优先级

总设计→Security层→组件→边界/CD-1补充契约；FE职责以已确认“框架拥有Root/Child关联、调度与取消恢复”为约束，ADR-0012本身仍NEEDS_REVISION，不能把其中待定物理方案当批准事实。

本轮输入包括[总设计](../../../agent-kernel-design.md)、[Security层](../README.md)、[BND-SEC-001](../../../contracts/bnd-sec-001.md)、[CD-1](../../../contracts/component-development-contracts-v1.md)、[FE-CON-1](../../../contracts/flow-engine-contract-v1.md)、[ADR-0012](../../../../governance/changes/ADR-0012-flow-association-and-execution-gate.md)、ExecutionPermit/ApprovalBridge及L3 ToolCall/Guard组件。

当前代码抽查范围：`src/security/permission-approval.ts`、`src/security/README.md`、`src/contracts/flow-permits.ts`、`src/infrastructure/adapters/sqlite-flow-permits.ts`。未做全仓源码审计；实现差异结论只限这些文件明确提供的能力。

## 2. 上下层语义追踪

| 上层约束及来源位置/状态 | 本轮落点与实际行为 | 结论 | 场景与处理 |
|---|---|---|---|
| 总设计§8/UP-SEC-001，候选一致边界 | PDP§1–3、SEC-DEC-1§2只消费Host可信技术快照 | 一致 | 模型伪造Scope不能进入PreparedDecision |
| 总设计§6.1/§14，L1请求PDP、L3不裁决 | PEP§1–3与新版审批时序：Control→PDP，Guard→Permit | 一致 | 旧图Tool→Permission已纠正；Guard类图无DecisionPort依赖 |
| Security层§2，Permit与PermissionRequest独立 | PDP§2/5、契约§5区分T-D/T-C/T-G，不写ToolCall | 一致 | 没有新PEP聚合或全域巨型事务 |
| 总设计§9，外部审批不扩大提案 | PDP§4/D2，批准事实回L1，再次判定；缩小目标也新提案 | 一致 | 参数改动不能沿用批准/Permit |
| CD-1授权闭环，非工具Ask首版拒绝 | PDP§3、契约§3、D1与E3显式映射ACTION_APPROVAL_REQUIRED | 一致 | 自审修正通用AskWriter误创建非工具审批的风险 |
| CD-1必要审计完成点 | 契约§4/5、D3/E1/E2：AuditReceipt确认后才开放依赖动作 | 一致 | outbox耐久不当Journal确认，普通日志不替代 |
| FE-CON-1§授权启动，authorizeStart与STARTED不同 | PEP§4/E1/E2保留两个确认点及在途取消语义 | 一致 | 撤销先则Grant0；后则不宣称物理效果0 |
| 总设计§13/UP-AGT-007，未知不重放 | PEP§5/E2、PDP§5/D3只查询同命令事实 | 一致 | STARTED后崩溃不补签重发 |
| CD-1资源/摘要与默认拒绝 | SEC-DEC-1§2/3；PDP§3固定优先级和有界求交 | 一致 | deny覆盖ask/allow，空集合不通配，摘要不构成授权 |
| 总设计§12及用户确认FE关联所有权 | PEP§1/6与ChildAdmissionPEP注释保持FE受理/取消/Join | 一致 | 不另建SubagentCoordinator，不把权限放入FE纯系统规则 |
| CD-1 child.create仍有reservationId；FE SR-04接口待收敛 | 契约§6及PEP§6明确遗留字段不可重建资源池，Child不列为可开发 | 证据不足 | 关联接口未闭合；由FE/Security契约所有者联合收敛，未擅自改上层或批准冲突字段 |
| Host资源上限具体编译Schema | SEC-DEC-1§2.1给出Kernel所需ResourceCeiling/Demand | 上层未定义 | 作为候选需求提交Host契约评审，不能宣称Host已提供该结构 |
| 总设计§13独立聚合；CD-1本地权威资格读取 | SEC-DEC-1§5仅安全事务读当前资格，效果另存 | 一致 | 具体Adapter原子读能力仍需集成验证，不扩为跨库承诺 |
| 总设计§15/UP-OBS-001，敏感字段不进普通日志 | PDP§7、PEP§9、契约§7 | 一致 | 参数/摘要/Permit仅受控安全证据，普通指标无动态ID |

本轮没有通过修改下层术语绕过已确认的公共复用机制；Child跨模块接口保留开放，不因本模块自洽而计入通过。上层或CD-1变化后需重审受影响项。

## 3. 五视角结论

| 视角 | 已完成的设计检查 | 尚需的批准/验证 |
|---|---|---|
| 架构 | 职责、Port方向、内部类关系、固定规则/适配器表、真实扩展实例 | Host资源编译/Child接口联合评审 |
| 安全 | deny优先、资源求交、批准与Permit区分、当前资格、零旁路目标 | 安全能力装配、跨Scope与真实执行负向验收 |
| 数据 | 幂等键、摘要、CAS、T-D/T-C/T-G、outbox/Journal、墓碑与保留 | 本地UnitOfWork资格原子读、迁移与崩溃测试 |
| 测试 | PDP-T01～09、PEP-T01～11，继承旧TC；UT/契约/集成/系统/混沌注入 | 所有运行用例尚未实现/执行，不能以文档覆盖计通过 |
| 运维 | 硬容量、超时、零自动效果重试、告警与诊断、回退 | 容量/性能测量、审计故障与恢复演练 |

## 4. 走读记录

正常：tool.execute → 固定参数 → 三份必需上限求交 → allow → T-D Decision/Permit/审计 → L1派发提交 → T-C消费 → T-G当前授权 → ToolCall唯一STARTED → Provider1 → 结果耐久/通知。PDP始终Provider0，L3不运行规则。

恢复：T-C提交成功但响应丢失 → 查同command Receipt → AUTHORIZED → 当前epoch已撤销 → T-G拒绝 → STARTED0；若断点在STARTED之后，则只查询Provider，未知保留Incident，不新建命令。由此分别验证“消费不是执行”和“未知不自动重试”。

扩展：同tool.execute下新增版本化工具描述与受控目标需求，复用ActionAdapterRegistry的工具适配器及固定求值流程；新增独立ActionKind才变更封闭契约、注册适配器和执行PEP，缺少一端装配拒绝。FE四态和中央提交算法不增加工具名分支。

## 5. 开放项与开发边界

| ID | 问题/负责人 | 关闭证据 |
|---|---|---|
| SEC-O1 | Host需提供SEC-DEC-1资源编译与不可变引用契约 / Host与Security所有者 | 输入Schema、可信来源及scope/epoch绑定联合评审 |
| SEC-O2 | Child关联DTO未闭合，reservationId遗留 / FE与Security所有者 | SR-04受理与安全接口统一，取消先/受理先两种竞态验收 |
| SEC-O3 | 完整Decision/Approval/Permit/Journal/STARTED尚未接通 / Security与L3实施人 | 本轮Txx运行证据、真实进程崩溃恢复、无重复副作用 |
| SEC-O4 | 部署假设尚需证明 / Infrastructure与运维 | 单库共同资格读取、审计不可用阻断、压力与回退验证 |

PDP纯算法、资源求交、工具PEP及工具审批已形成可实施评审输入，尚未获批准；Child适配器不列为可直接开发。这里的“待批准”不是要求暂停补设计或重复索取本轮设计授权。

## 6. 验证证据与范围

变更前`bash packages/lawclaw-agent-kernel/scripts/check-document-architecture.sh`通过：7层、34组件、80份文档。历史记忆中的front matter阻断本轮未复现，不沿用旧失败结论。

本轮图形集合：`components/security-plane/`八份PlantUML，加`layers/03-security-plane-components.puml`和`scenarios/06-tool-approval-sequence.puml`，共10份。使用现有本地镜像`plantuml/plantuml:1.2026.7`、统一theme及Hiragino Sans GB字体，逐文件`-checkonly`、`-tsvg`、`-tpng`，没有调用会删除全部rendered输出的全量脚本。

最终检查：文档架构检查通过（7层、34组件、82份受治理文档）；`git diff --check`通过。定向验证五份入口/组件/契约的本地链接及锚点、JSON示例解析和规范摘要向量通过；10份SVG均通过XML解析。

10/10图完成PlantUML语法、SVG/PNG渲染及整图人工视觉检查；层图初稿的标签重叠经两次布局修订消除。图形保持可编辑PlantUML与对应SVG，未覆盖Draw.io。原全量图脚本仍固定19张编号图，新增8张组件图采用本轮定向枚举验证，不能把旧脚本通过当新增图覆盖证据。

精确输入、组件文档、theme与图形SHA-256及检查输出见[证据清单](pep-pdp-design-evidence-2026-09-08.json)。本轮未改运行代码，未运行npm check/build/test或安全运行测试。文档检查、图形检查、人工语义自审与运行测试分别报告；不声称完整架构或生产安全验收通过。
