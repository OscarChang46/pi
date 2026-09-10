---
doc_id: SEC-CON-001
level: contract
layer: Security Plane
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: PEP/PDP 求值输入、资源上限、决策提交及恢复补充协议
parent: SEC-DES-001
interfaces: [PermissionDecisionPort, PolicySnapshotPort, PermitValidationPort]
diagrams: []
supersedes: []
---

# SEC-DEC-1：PEP/PDP 详细契约

状态：2026-09-08 候选，属于 [ACR-2026-0014](../../../../governance/changes/ACR-2026-0014-pep-pdp-detail.md)。本页补齐 CD-1 未展开的内部值、存储约束与操作承诺，不是已发布 API。

## 1. 唯一来源与适用范围

- [BND-SEC-001](../../../contracts/bnd-sec-001.md)拥有跨层方向。
- [CD-1](../../../contracts/component-development-contracts-v1.md#permission-decision-engine)拥有 DecisionRequest/Decision、SecurityAction/Binding、AuthorizationState、Permit/Receipt/Grant、PermissionRequest/Callback 和公开操作签名。本页不另建同名 DTO。
- [FE-CON-1](../../../contracts/flow-engine-contract-v1.md)拥有 ActionProposal、ArtifactRef、FE-C14N-1 与工具 actionDigest。FE-CON-1 是 ReAct 业务适配契约，不是通用 FE 系统协议。
- 本页拥有下列新内部值、PolicySnapshotPort 返回约束及安全事务 Schema。独立代码块沿用 CD-1 的契约记法，不是可直接编译的 TypeScript；存储结构中未标注类型的字段保持原有规格，不在排版调整中补造类型。所有结构遵循 CD-1 元数据、严格 JSON、错误和作用域规则。
- 首版封闭动作仍为 tool.execute、memory.read、memory.write、child.create。Secret/Artifact 的受控访问使用 Host scoped 能力及工具执行计划，不新增可由模型调用的 secret.read/artifact.read 动作；新增独立受保护动作需同步契约与执行强制点。

## 2. 信任输入与规范化

L34-SPEC-1.0.0的tool.execute.payload以[BND-L34](../../../contracts/bnd-l34-001.md)§4 ToolTargetV1为准，替代CD-1旧`{proposal}`；其他Security类型不变。ProposalVerifier加载target.resourceProfileRef并验证内容摘要；Sandbox mounts映射为ResourceAccess，egressRefs映射endpointRef，secretHandleRefs映射secretRefs，并与工具描述/参数解析出的目标需求取去重并集，权限冲突取write。durationMs=min(target.deadlineAtMs-nowMs,60000)，outputBytes=target.limits.outputBytes；过期直接拒绝。Provider同样从profile取得出口/Secret，目标读写仍由工具动作适配器解析。workload及档案本身由Host scoped Artifact能力核验，不能凭资源Ref自授读取权；CPU/内存/pids等机制上限由Host受控profile及L4落实，不增加第二个PDP。

模型只能提供候选参数及候选目标；L1 从可信 Run、固定目录、Space 或 Child 输入重新构造 SecurityAction/Binding。服务身份、scopeKey、epoch、resourceScopeRef 不采信载荷中的自声明。

<a id="prepared-action"></a>

```text
PreparedAction = {
  action: SecurityAction,
  binding: SecurityBinding,
  demand: ResourceDemand
}
```

PreparedAction 是ProposalVerifier的冻结输出；其构造必须完成摘要、固定目标与需求解析，不接受网络提供的“已验证”标志。

<a id="prepared-decision"></a>

```text
PreparedDecision = {
  action: SecurityAction,
  binding: SecurityBinding,
  policy: PolicySnapshot,
  ceilings: ResourceCeiling[],
  demand: ResourceDemand,
  approval: VerifiedApproval|null,
  nowMs: Millis,
  deadlineAtMs: Millis,
  authorizationVersion: Count,
  policyContentDigest: Digest
}
```

PreparedDecision 是进程内冻结输入，不可从网络反序列化后直接调用求值器。

<a id="verified-approval"></a>

```text
VerifiedApproval = {
  approvalRef: Ref,
  bindingDigest: Digest,
  state: ApprovalState,
  expiresAtMs: Millis,
  version: Count
}
```

VerifiedApproval 由安全服务加载完整请求及其 Decision 关联记录后生成，不接受回调方自行填入。

```text
PolicySnapshotPort.get({
  policyRef: Ref
})->PolicySnapshot
```

```text
getResourceLimits({
  resourceLimitsRef: Ref
})->ResourceCeiling
```

上述两个操作均组合 RequestMeta/TrustedScope；Ref 在同 scope 内不可变，返回内容与安装时摘要不一致为 STALE_SNAPSHOT。存储缺失为 NOT_FOUND，源不可用为 PERMISSION_UNAVAILABLE；未得到完整输入不运行 evaluate。

### 2.1 资源类型

#### ResourceAccess

<a id="resource-access"></a>

```text
ResourceAccess = {
  resourceRef: Ref,
  access: read|write
}
```

引用指向可信解析后的逻辑资源，不以路径字符串前缀判定。

#### NetworkAccess

<a id="network-access"></a>

```text
NetworkAccess = {
  endpointRef: Ref
}
```

Host 固定的出口句柄，绑定规范主机、端口与出口限制，执行期由 L4 防止解析漂移。

#### ResourceCeiling

<a id="resource-ceiling"></a>

```text
ResourceCeiling = {
  ceilingRef: Ref,
  scopeRef: Ref,
  actions: ActionKind[],
  resources: ResourceAccess[],
  endpoints: NetworkAccess[],
  secretRefs: Ref[],
  maxDurationMs: Count,
  maxOutputBytes: Count
}
```

#### ResourceDemand

<a id="resource-demand"></a>

```text
ResourceDemand = {
  actions: ActionKind[],
  resources: ResourceAccess[],
  endpoints: NetworkAccess[],
  secretRefs: Ref[],
  durationMs: Count,
  outputBytes: Count
}
```

数组作为集合校验：禁止重复项，空集合表示没有该权限/需求，不表示通配。各集合≤1024，总编码≤64KiB；时间与字节预算为正安全整数，不能超过 CD-1 对应用例的硬上限。需求必须含本次 kind；当前四个动作每次恰有一个动作种类。一个 Ceiling 可包含多个动作种类。最多8个 Ceiling，至少包含 Host信封、Run冻结限制、策略资源限制；Child再包括父级与目标子级限制，Memory再包括Space授权视图限制。缺失必需上限拒绝，不自动补无限值。

ResourceCeiling 不是 RBAC 规则，只表示 Host 编译后的技术上限。动作适配器根据固定版本工具描述及规范参数生成 demand；参数依赖的目标无法可靠解析时 BINDING_MISMATCH。PDP 只读取模型参数 Artifact 以验证本次动作，不读取目标文件、Secret 明文或 Memory 正文来判断权限。

### 2.2 摘要与身份

工具 actionDigest 原样使用 FE 公式；其他动作原样使用 CD-1 公式。bindingDigest=H(SecurityBinding)，policyContentDigest=H(PolicySnapshot)，ResourceLimits 的引用不可改指。

新增请求语义摘要：

```text
requestDigest = H({
  method: "SEC-CMP-001.decide",
  request: DecisionRequest
})
```

requestId、traceparent、查询 Deadline 不入摘要。决策请求的截止时间由首次耐久受理冻结，后续查询只收紧当前等待时间，不能延长该决策的许可有效期。

去重键沿用 `(trustedScopeKey,SEC-CMP-001,commandId)`。同 command 异语义返回 IDEMPOTENCY_CONFLICT；不同 command 同动作可以分别判定，但 L1 不得为超时自动创建新命令；执行端仍需唯一业务动作受理键，不能靠 PDP 去重替代 ToolCall/Memory/Child 幂等。

规范字节固定向量，FE-C14N-1 输入：

```text
{"b":2,"a":1}
```

规范化后的 UTF-8 文本必须精确为以下单行内容（不包含末尾换行）：

```text
{"a":1,"b":2}
```

H 必须是：

```text
sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777
```

此向量只验证编码基础；工具端到端摘要向量复用 FE-CON-1 examples。新增 action/binding/request 摘要测试必须独立固定输入与期望，不能调用被测 canonicalizer 生成期望。

## 3. 求值结果与优先级

<a id="evaluation"></a>

```text
Evaluation = {
  kind: allow|ask|deny,
  reason: EvaluationReason,
  matched: ActionKind[],
  bindingDigest: Digest
}
```

```text
EvaluationReason = EXPLICIT_DENY
  | OUT_OF_SCOPE
  | LIMIT_EXCEEDED
  | APPROVAL_REQUIRED
  | APPROVAL_INVALID
  | EXPLICIT_ALLOW
  | DEFAULT_DENY
```

EvaluationReason 是封闭的耐久安全证据分类，不增加公开 ErrorCode。`matched` 按 ActionKind ASCII 升序，无重复；为空表示默认拒绝或前置约束失败。

求值顺序：显式 deny → 每个上限求交 → ask 与批准校验 → 显式 allow → 默认 deny。命中 ask 且批准精确有效时返回 allow，即使 allowActions 不包含该动作；该 allow 只解除本次 ask，不能覆盖 deny 或资源上限。未批准为 ask，批准引用不匹配/已拒绝/过期/取消为 deny。approved 恰好在 expiresAtMs 时失效。政策里各列表内部不能重复，但跨列表重叠合法，由上述优先级裁决。

策略仍使用现有 denyActions/askActions/allowActions 的 ActionKind 精确集合，不新增脚本 DSL、任意谓词、网络求值或按工具名猜风险的规则。所谓“规则≤4096”指三个列表条目总数的通用容量保护；当前四动作协议实际最多12项。需要按资源选择不同 Ask 策略时由 Host 生成针对当前信封的 policy；若需要 Kernel 内细粒度规则语言，另行设计，不能偷偷塞进 resourceLimitsRef。

纯求值与公开结果分开：Evaluation.ask遇到tool.execute才创建PermissionRequest；遇到其余三种动作，应用服务保存Decision.deny(code=ACTION_APPROVAL_REQUIRED)及Evaluation.ask证据，不创建审批记录或审批outbox。该映射保持CD-1的首版限制，不能由通用AskWriter给非工具动作偷偷建立等待状态。

## 4. 操作承诺

| 操作/调用者 | 确认点、错误与恢复 |
|---|---|
| decide / L1 PEP（Memory内部协调亦属L1） | 身份、Schema、Scope通过后先查询同键；无记录才加载输入、求值并提交。响应成功必须已有 DecisionRecord 及必要 AuditReceipt。Allow 的 Permit、Ask 的 PermissionRequest 与决策在同安全事务创建；事务不含外部审批网络调用。 |
| inspect / 原可信调用方或受控恢复器 | 返回原 Decision；audit_pending 返回 AUDIT_UNAVAILABLE。权限受限查询不刷新 Permit，不判断原 Allow 当前仍可执行。不存在/已清理分别 NOT_FOUND/GONE，依赖失联为 UNKNOWN/PERMISSION_UNAVAILABLE，不能伪造 NOT_FOUND。 |
| consume / 真实执行点 | CD-1 绑定逐字段相等，issued→consumed CAS，同命令同绑定返回原 Receipt，另一命令 PERMIT_CONSUMED。重复调用前仍先验证访问 Scope 和幂等摘要，receipt 仅说明过去消费成功。必要审计未确认不返回可用回执。 |
| authorizeStart / 真实执行点 | 验证原消费、当前 claim/取消/截止/epoch/revocation/Permit expiry；同库事务只读 Run 资格、写 Grant 与安全审计。此前撤销则零 Grant，此后撤销属于在途取消。历史 Grant 查询不等价于新资格检查。 |
| ApprovalBridge.decide / Host认证回调 | CAS写批准事实与通知；批准不调用 L3，不直接签 Permit。L1 收到可信事实后使用新权限命令重新 decide，原提案不能变。 |

所有调用超时 min(当前调用 Deadline, now+2秒)；AbortSignal 只终止等待，不能证明远端事务没提交。写超时查询原 command；只读查询按 CD-1 最多3次100/200/400ms，超过预算结束。PERMISSION_UNAVAILABLE、AUDIT_UNAVAILABLE、CLOCK_UNTRUSTED 是基础能力失败，不伪装策略 Deny；L1 映射 unavailable 并阻止执行。

错误映射：参数/摘要/作用域错误分别 SCHEMA_INVALID、DIGEST_MISMATCH、SCOPE_MISMATCH；明确拒绝为 Decision.deny(ACCESS_DENIED)，上限超出为 Decision.deny(RESOURCE_EXHAUSTED)；版本漂移 STALE_SNAPSHOT；非法批准返回 Decision.deny(ACCESS_DENIED)；终态 Run/过期分别 CANCELLED/DEADLINE_EXCEEDED。每个 Error 都保留 retryable=false，只有 CD-1 明确允许的只读依赖错误例外。

## 5. 候选耐久结构与事务

下表是逻辑 Schema，不声称已有表；实现由 Infrastructure Adapter 提供。复用 Permit/Approval 所属 Repository，不给 PEP 建数据库。

| 记录 | 字段、键与索引 | 写入者 |
|---|---|---|
| DecisionRecord | [字段定义](#decision-record)；PK(scopeKey,commandId)，索引(scopeKey,request.binding.runId)、(auditState,createdAtMs) | PDP应用服务 |
| DecisionArtifactLink | (scopeKey,commandId,artifactRef)唯一；固定参数/目录/资源快照引用，保留期内不可GC | PDP事务与Artifact引用保留Port |
| PermissionRequest关联 | CD-1字段外，通过DecisionRecord关联完整bindingDigest；同scope approvalRef唯一。外部只见脱敏技术说明 | PDP创建，Bridge CAS迁移 |
| PermitRecord / Receipt | CD-1字段，PK(scopeKey,permitRef)，Receipt唯一(scopeKey,permitRef)，消费commandId不可改；保留决策关联decisionCommandId | PermitService |
| GrantRecord | CD-1字段，PK(scopeKey,grantRef)，唯一(scopeKey,commandId,attemptId,fence,executorRef,receiptRef)；关联AuditReceipt | PermitService |
| 安全outbox | [字段定义](#security-outbox)；唯一(scopeKey,eventId)，索引(delivery,eventId) | 安全事务创建，worker仅更新投递状态 |

### DecisionRecord 字段

<a id="decision-record"></a>

```text
DecisionRecord = {
  scopeKey,
  commandId,
  requestDigest,
  request: DecisionRequest,
  policyContentDigest,
  authorizationVersion,
  evaluation: Evaluation,
  decision: Decision,
  acceptedDeadlineAtMs,
  createdAtMs,
  auditEventId,
  auditState: pending|confirmed,
  version
}
```

### 安全outbox 字段

<a id="security-outbox"></a>

```text
安全outbox = {
  scopeKey,
  eventId,
  recordRef,
  kind: audit|approval|decision_ready,
  payloadDigest,
  delivery: pending|confirmed,
  version
}
```

上述结构中 Ref/Digest/Count/Millis 语义沿用 CD-1，scopeKey 只由存储适配器注入；version初值0，每次状态CAS增1。读写入口均要求可信 Scope。禁止让普通运维工具直接更新状态。

T-D：读取当前 AuthorizationState version、Run执行资格/截止、批准版本并校验与准备阶段相同；写 Decision+Permit **或** Decision+PermissionRequest+审批outbox，再写必要审计。发生并发变化则 STALE_SNAPSHOT/VERSION_CONFLICT，不提交旧结果。使用共享本地权威读序列，不修改 Run 或 ToolCall，禁止把业务聚合合并进安全事务。若实际部署无法提供该读序列，此档案拒绝启动。

T-C：消费记录+Receipt+审计原子提交。T-G：资格读取+Grant+审计原子提交。各事务之间可崩溃；恢复从权威回执补齐下一步，不回滚已消费状态。

首版推荐同库耐久审计 Journal，提交确认即 AuditReceipt。采用外部 Journal 时复用 CD-1 audit_pending：同 auditEventId append/query，只 found 可继续；未确认的 Permit不能消费，未确认的 Grant不能交执行器。安全决定对外可见后再由 decision_ready outbox 提示 L1；提示丢失由 L1 查询原命令收敛。审计 exporter 故障不撤销已提交 Journal；Journal 本身失败则新受保护动作全部阻断。

同 command 的 authorizeStart 重投：先重验当前资格，再返回同 claim/executor 已存在 Grant；更换 claim 必须新 Grant，但同 ToolCall 只允许一个 STARTED CAS 胜者。调用元数据幂等身份必须区分 consume 与 authorizeStart 方法；存储键采用各操作所属组件/方法空间，不能把同 command 的两个不同操作当异载荷冲突。

## 6. 生命周期与首版限制

Decision 内容不可改；audit_pending→confirmed 仅改变可交付性，不把 Deny 改 Allow。Ask后的重判使用新命令记录；原 Ask 留作审计。Permit 终态与批准状态沿用 CD-1，不因查询重新激活。

工具 Ask 支持异步等待；Memory/Child Ask 仍按 CD-1 返回 ACTION_APPROVAL_REQUIRED，不建立工具审批等待状态。Child 安全检查发生在 Session branch 与 FE Child 受理之前；SM拥有group/member关联及取消协调，FE/RunRegistry只拥有单个Child Run的受理、执行和取消回执。CD-1遗留 reservationId 不得解释为需要恢复已删除的资源分配组件。完整 Child DTO 仍受 SR-FE-SYS-04 待定协议约束，本轮不冻结该跨模块字段，Child adapter 暂不列为可开发单元。

审批请求身份绑定原动作。外部要求缩小资源/修改参数时，旧请求终结，新提案、新摘要、新判定；禁止把旧批准静默嫁接到变化后的动作。

### 6.1 Session 与 sub-session 的安全引用边界

Session 聚合不拥有权限能力。`AgentSession/SessionSnapshot/JoinBarrier/JoinMember` 均不得保存 AuthorizationState、PolicySnapshot、PermitRecord、GrantRecord 或其可执行副本。SessionManager Coordinator 对 `child.create` 调用本契约时，只能保存 [SecurityEvidenceRefs](../../../contracts/component-development-contracts-v1.md#security-evidence-refs)；这些字段均指向本层权威记录，不能离线解释、续期或作为 bearer token 使用。

Child 创建顺序固定为：冻结 Parent/Child 身份与资源范围 → decide → consume → authorizeStart → Session branch CAS → FE Child 受理。Ask、Deny、PERMISSION_UNAVAILABLE、Permit过期/撤销或 binding 不一致时，Child Session 写入数和 FE 受理数必须为0。Permit/Grant 已提交而 Session branch 结果未知时，Coordinator 查询原安全命令与原 Session 命令；不得复制安全记录到 Session，也不得以新 decisionCommandId、Permit 或 Child ID 猜测重试。

Child 后续 Run 使用独立 `childExecutionEnvelopeRef` 加载当前 AuthorizationState；Parent 的 Permit/StartGrant 不下传。撤销只改变 Security 权威状态并阻断新受保护动作，不重写或删除已提交 Session 历史。SM 可以保留安全引用用于审计和恢复，清理这些引用前必须满足本层与 Session 层共同保留条件。

## 7. 容量、版本与清理

继承 CD-1：策略1MiB、策略缓存64份且16MiB、活跃Permit4096、pending审批4096；所有缓存按(scope,policyRef,contentDigest)索引，LRU淘汰只影响性能，当前 epoch/撤销不缓存放行。决策输入≤64KiB（正文走Artifact），纯求值P99目标≤10ms，端到端2秒；Permit有效期取 now+30秒、Run/命令/信封/策略到期的最小值，必须严格大于 now。

活跃决策及audit_pending≤4096，达到上限拒绝新受理，不驱逐未完成记录；存储使用既有共享10GiB档案，安全/幂等至少终态后30天，活跃引用或incident延长。清理只经保留策略删除正文，保留不可复用ID墓碑；容量超限失败关闭。不得删除消费记录后允许旧Permit再次生效。

SEC-DEC-1为候选1.0.0；未知版本拒绝，不默认兼容旧短时 Grant 类型。迁移顺序：新增独立安全表与版本标志→影子求值只比对不执行→停止新受理并核对在途动作→装配统一PDP/Permit/Guard→移除 Session/Run 中的权限对象与 permission ceiling→只保留 Security 外部引用→跑故障验收后启用。旧在途命令由旧版本完成/对账，不将旧Grant转换成新Permit。回退停止新路径、保留新安全事实和墓碑，只由识别新版本的维护程序核对；禁止旧程序消费新表或把安全记录写回Session。实际迁移和开关需另获实施授权。
