# 独立安全设计评审

日期：2026-09-07。评审角色：安全。状态：首轮评审完成，待修订复核。

结论：本轮发现 2 项 P1、2 项 P2，暂不满足“待开发”门槛。未发现需要据此认定的 P0；本结论是候选设计审查，不是实现安全保证。

## 范围与依据

全文读取 CD-1、Security 四组件、L3 三组件、MemoryManager、SubagentCoordinator，以及最初分配的 L4、SecretResolver、ModelEgress、ClockTime 和 scope.md；另核对 FlowEngine 第21章全部开发协议与 BND-SEC/BND-EXT。按本轮最新范围，外部运维、基础设施及 L4 具体执行器的实现未完成不作为阻断；只检查 Kernel 消费它们所需的契约。未修改 FlowEngine 或设计正文。

37 是 38 个组件文档减 FlowEngine 的文档计数，不是 37 个独立实现单元的必要性证明。安全上同意 Guard 随 ToolCallRuntime 交付、PEP 作为跨边界强制契约：必须保留检查，但无需额外服务。SecurityAudit 的耐久需求可以作为外部依赖契约，本轮无需完整设计其实现。

## SEC-R1 [P1] 非工具动作没有可执行的授权协议

位置：`contracts/component-development-contracts-v1.md` 的 memory-manager、subagent-coordinator、permission-decision-engine、pep-enforcement 节；`layers/l1-control/components/memory-manager.md` CD-1 §4—5（初审行78—84）；`subagent-coordinator.md` CD-1 §4、§6（初审行83、95）；FlowEngine §21.1、§21.3、§21.5。

问题：CD-1 要求 memory.write、child.create、敏感跨 Scope read 独立 PDP 决策及一次性 Permit，但 DecisionRequest.proposal 仅引用 FE ActionProposal。后者只有 toolDescriptorRef/toolDescriptorDigest/argumentsRef，actionDigest 公式也是工具专用。没有非工具动作的封闭类型、绑定字段和摘要公式。CreateChildRun 不携带 Permit，这本身可由 ChildRunPort 内部编排解决，但 CD-1 未定义该编排的决策身份、Ask 等待/批准恢复及 Permit 存储。Memory query 仅 RequestMeta 且返回 MemoryView，无法表达一次性消费所需稳定命令身份或 Ask；apply 还无法直接给 authorizeStart 提供 claim，其可信取得方式未定义。

反例：模型给出 ChildSpec 后 Core 合法提交 CreateChildRun。Coordinator 需要 PDP，但用 childId/goal/envelopeSubset 构造请求会被工具专用 Schema 拒绝；伪造 toolDescriptor 又把子集/预算/目标 Session 的授权绑定交给开发者猜测。敏感 Memory 读取命中 Ask 时，也没有可返回及恢复的等待状态。

影响：正确实现只能拒绝这些既有目标能力，或自行发明不一致的授权流程；若只检查 scope 子集便执行，会遗漏要求的一次性动作授权。不能按模板齐全认定可开发。

修订建议：在 CD-1 定义独立于 FE 工具类型的 SecurityAction 判别联合和各动作确定性摘要。明确工具提案如何包装而不改 FE；Memory 操作绑定 Space/version/candidate/content/supersedes/读取范围；Child 绑定原 commandId/childId/spec/父执行上下文。定义 Coordinator/Memory 内部决策与消费命令 ID、回执、Ask 持久等待与恢复，或明确首版这些入口遇 Ask 即拒绝并返回稳定错误。明确 claim 的受信加载入口。禁止用空工具字段代替非工具绑定。

关闭验证：完整 JSON 向量应跑通 Child allow/ask/deny、Memory read/write allow/ask/deny；改变一个目标/内容/预算字段应使原 Permit 无效；取消先于 Child 受理时 Child=0；重放相同动作只产生一次写入或 Child。

## SEC-R2 [P1] 当前授权 epoch 的权威读取与撤销生效点未闭合

位置：CD-1 公共 TrustedScope、协作与事务、permission-decision-engine / execution-permit；`permission-decision-engine.md` CD-1 §4；`execution-permit.md` CD-1 §4—6。

问题：方案正确要求 authorizeStart 读取当前 epoch，并把撤销与启动线性化；但数据只有不可变 PolicySnapshot.epoch 和 PermitRecord.policyEpoch，没有当前 scope 授权状态的权威记录/取得契约，也未说明外部策略变更如何进入本地共同读取点。读取旧冻结 PolicySnapshot 不能证明当前有效；独立外部查询后再提交 SQLite 也不能满足所声称的共同线性化。

反例：Run 冻结 epoch=7，外部权威撤销为8。Kernel 的本地快照/缓存仍为7，authorizeStart 比较 Permit=7 与缓存=7 后签 grant。现有契约不能判定这一操作究竟违反撤销语义，还是外部撤销尚未生效，因为没有规定确认点和同步失败行为。

影响：实现者无法证明“撤销先于 authorizeStart 则启动0”，也无法确定外部策略源失联时旧快照是否仍可用。这是 Kernel 必需的依赖契约缺失，不要求在本轮实现外部 RBAC。

修订建议：定义 Kernel 可消费的可信授权状态契约，至少 scope/envelope、单调 epoch、有效/撤销状态、有效期和可信来源；给出本地安装/失效顺序及其与 authorizeStart 事务的关系。明确远端撤销以什么确认点生效，未同步/未知是否禁止签发与启动。如首版仅启动固定快照，必须明确撤销通过何入口同步失效，不能仍承诺任意远端实时撤销。写清 PolicySnapshot 的 allowActions/denyActions/askActions Ref 匹配哪一类动作标识。

关闭验证：屏障分别放在授权状态安装前、安装后/authorizeStart 前、grant 后，核对三种结果；外部状态不可确认时启动0；两个 Scope 的 epoch 互不串用。

## SEC-R3 [P2] Permit 的版本与签发输入不自洽

位置：CD-1 execution-permit 的 PermitRecord 与 issue/revoke/inspect。

问题：revoke 要 expectedVersion，但 PermitRecord 没有 version，inspect 不能提供下一次合法撤销所需版本。issue 参数为完整 PermitRecord，含 state/commandId/permitRef，而正文明确外部不能提供 state/commandId，服务初始化 issued。全字段必需且拒绝未知字段的规则使合法签发输入不清楚。

反例：PDP 按契约构造 issue 必须填 state；按正文又不得填。管理方 inspect 后无法确定 revoke expectedVersion。

修订建议：分离 PermitIssueInput 与服务生成 PermitRecord；后者加 version，规定 issue/consume/revoke/expire 的增版本规则及同键回执优先顺序。补一次 issue→inspect→revoke 的完整固定向量。

## SEC-R4 [P2] 一次性 StartGrant 的实际执行者绑定需可检查

位置：CD-1 StartGrant、ExecutionPlan；`execution-permit.md` CD-1 §5；`tool-call-runtime.md` CD-1 §4—5。

问题：文字要求 grant 不能授权另一执行端，但完整 StartGrant 仅有 commandId/claimFence/authorizedAtMs。没有说明该约束由数据库内部记录、受控句柄还是 DTO 字段证明；ExecutionPlan 也不携带完整 claim。共享 commandId 唯一 CAS 可以防双执行，但不自动证明实际获胜者就是已核准身份。

反例：旧 worker 获 grant 后暂停，新 worker 接管。新 worker 能否取得并保存旧 grant、何时必须重新 authorizeStart、CAS 是否比较授权主体均未明确。

修订建议：不要求把身份暴露到 L4；可以明确 grantRef 对应私有记录绑定完整 owner/attempt/fence、执行边界和动作绑定，CAS/受控装配句柄检查这些关系。说明 grant 已线性化后的接管、取消属于何种在途语义，并给双 worker 屏障测试。

## 已具备的安全设计依据

- 工具 consume 与首次启动分离；明确 authorizeStart 的授权线性化点，STARTED 后未知不重放。
- Scope 来源不能由 JSON 自签；Artifact Ref/digest 均不构成访问权；L2 不接触 Permit。
- 必要安全审计不可用失败关闭；普通遥测不记录 Prompt、参数、内容摘要或 Secret。
- 条件隔离能力未验证时禁用，不以宿主 Shell 降级；模型出口与 Secret 的依赖要求有最小权限和明确失败行为。

上述条款值得保留，但不能抵销 SEC-R1/R2。两项 P1 关闭且复核通过后，才可给本轮 Kernel 安全设计“待开发”结论；实现验收仍须独立故障注入证据。

## R1复核记录

复核日期：2026-09-07。保留以上首轮发现作为历史；当前状态以本节及后续追加记录为准。复核对象为 CD-1 R1、对应组件全文、基础设施/运维 kernel-dependencies.md、security-vectors.json 九组输入及 acceptance-matrix.md 的16项跨组件规格。未执行业务实现测试，未修改设计正文。

| 首轮问题 | R1状态 | 复核依据 |
|---|---|---|
| SEC-R1 非工具动作协议 | 关闭 | SecurityAction定义Child/Memory精确payload与摘要；Memory query有CommandMeta、apply内部取可信Run/claim；ScopeLink保存权限身份/Permit并有admitChild入口。非工具Ask明确失败关闭，不新增等待；工具Ask保留。K-TC-06/09覆盖对应边界。 |
| SEC-R2 当前epoch与撤销 | 主体已补齐，续期分支待补 | AuthorizationState及可信Host安装/失效入口明确；本地确认点定义撤销生效，未知/过期失败关闭；但同epoch续期与30秒有效期冲突，见SEC-R2a。 |
| SEC-R3 Permit字段矛盾 | 关闭 | PermitIssueInput与PermitRecord分离；初始version=0，首次consume/revoke/expire增版本，同命令回执不增版本。 |
| SEC-R4 执行者绑定 | 关闭 | 私有GrantRecord绑定owner/attempt/fence/executor和bindingDigest；STARTED CAS核对当前claim；接管未STARTED重新authorizeStart，已STARTED只查询。K-TC-07覆盖旧grant给新owner。 |

必要审计补充已明确：仅写outbox不开放动作，必须取得Journal AuditReceipt或同事务等价确认；未确认grant不交执行器。这满足Kernel消费方依赖要求，不要求本轮建设外部Journal。

### SEC-R2a [P1] 正常授权有效期续期无合法操作

位置：CD-1“当前授权状态与撤销依赖”。当前版本同时规定AuthorizationState有效期最长30秒、同epoch异内容拒绝。

最小反例：epoch=7、validUntilMs=120000；在110000时Host证明策略未变，希望续到140000。installAuthorization必须拒绝，因为同epoch的validUntil/sourceReceipt内容改变。若为了续期强行提高epoch，则活动Run冻结策略7与当前epoch失配，即使没有任何撤销或权限变更，正常多轮Run也无法继续。10分钟Run与120秒模型调用档案不能因此只保留30秒授权窗口。

最小修订：区分策略语义版本和新鲜度证明；允许同epoch只更新validUntil及可信新sourceReceipt，前提是scope/envelope/state/policy等语义字段完全不变、版本CAS、有效期不超过可信now+30秒，且已revoked不可用此入口复活。也可以独立定义等价freshness续期操作。补正常续期、失联到期、撤销后旧续期三条屏障预期。

九个security-vectors是PDP动作/规则的合成输入与摘要，不能作为完整Run/claim/Permit/审计/执行事务向量或已运行证明；K-TC-06/07/08仍应按实现验收执行。此证据范围说明不另作为设计阻断。

R1当前结论：无新增P0；SEC-R2a未补齐前保留1项P1，不给“无P0/P1待开发”结论。

### R1最终复核：续期补充已关闭

已重新读取 CD-1 的 `renewAuthorization` 精确操作及 K-TC-07 补充。该操作独立于 installAuthorization，以可信新来源证明、同epoch和expectedVersion CAS仅更新validUntil/sourceReceipt/version；明确不能改变scope/policy/state、不能复活revoked，过期到确认之间拒绝新动作。正常epoch7续期、改scope拒绝、撤销后续期拒绝均已成为强制验收分支。因此 SEC-R2a 关闭，SEC-R2 完整关闭。

最终状态：SEC-R1、SEC-R2（含R2a）、SEC-R3、SEC-R4全部在设计层关闭。本角色当前未保留P0/P1/P2，**本轮Kernel安全详细设计达到待开发状态**。结论限定于候选设计和已明确的外部依赖保证，不等于架构所有者批准、实现测试通过或外部系统已经具备这些能力。

验收矩阵已明确九个JSON只是PDP合成向量；后续实现必须执行K-TC-06/07/08等完整链路和故障屏障测试。未以外部基础设施/运维/L4实现缺失阻断本轮。
