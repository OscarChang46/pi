# FlowEngine 安全独立评审

结论：**有条件通过**。FE-CON-1 的安全职责方向成立：Core 不判权限，L1 PEP 请求 PDP，L3 Guard 耐久消费 Permit；模型/工具 UNKNOWN 不自动重发；敏感正文与摘要不作为公开诊断数据。以下 3 项开发契约缺口应在冻结前补齐，其中 2 项 P1。未把 candidate、未实现或未执行测试本身列为缺陷。

评审对象：`/Users/oscar/jurismind/code/pi-lawclaw/packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine/README.md` 全文，重点第 21 章。交叉核对 `execution-permit.md`、`pep-enforcement.md`、`bnd-sec-001.md`。以下行号对应评审时 2509 行版本。本次只读设计，没有生产漏洞复现或代码变更。

## SEC-R1 [P1] 核对结果缺少与当前 incident 的精确绑定规则

- 位置：flow-engine.md:2256（绑定规则遗漏 EffectReconciled）；2358–2360（核对结果迁移）；2220–2222（事件字段）。
- 问题：普通工具事件明确同时核对 proposalId 和 toolCommandId；恢复事件却只要求“可验证的结果”。没有冻结 `EffectReconciled.commandId`、`incidentRef` 与当前 WaitReason 的逐字段相等关系、result 种类与等待类型的关系，以及完成结果非 null/大小约束。可信来源只能证明事实来自恢复器，不能证明事实属于当前等待动作。
- 具体故障轨迹：同一 Run 的工具 C1 曾 UNKNOWN，I1 已核对完成；之后工具 C2 UNKNOWN，当前等待 I2。恢复扫描以新 eventId 再次上报真实的 C1/I1 成功结果（因此不会命中旧 eventId 去重），Run/当前 Attempt 均合法。按现有“可信核对结果”的文字可进入 tool_completed 分支，移除当前首 Proposal C2、追加 C1 结果并继续模型，C2 的未知副作用被错误解除。若核对完成 resultRef=null，类型也允许生成无法完整回放的完成状态。
- 缺失契约：完整的恢复事实因果匹配和完成载荷约束，不能只靠 21.4 泛称“因果匹配”。
- 建议：明确 commandId 必须等于当前 reason.toolCommandId/modelCommandId，incidentRef 必须等于当前 reason.incidentRef；causationId 固定为原目标命令或核对命令中的一种并说明映射；tool/model 完成种类必须分别匹配等待类型；完成必须有经作用域和摘要验证的有界 resultRef。失配 reject，不消费当前等待。补充同 Run 旧 incident、新 eventId、交叉工具/模型类型和 null 结果的反例。

## SEC-R2 [P1] Permit 消费回执的可恢复性没有区分查询权与首次执行权

- 位置：flow-engine.md:2441–2443（派发状态机与分阶段消费）；2449（接管时沿用 commandId、当前 dispatch claim）；1659–1661（有效期与失败关闭不变量）。
- 问题：2443 允许耐久授权回执用于同一命令“查询/恢复”，但外部执行端仅要求先受理、消费、执行的可查询记录，没有定义从已授权到开始外部调用的排他转换，也未说明回执在 Permit 过期、策略 epoch 变化或 Run 取消后的恢复权限。相邻 Permit 设计要求已消费/过期/撤销终态不可回退；这里需要明确何种恢复只读、何种恢复允许尚未开始的首次执行。
- 具体故障轨迹：Worker A 为 C1 耐久受理并消费 Permit，保存授权回执后暂停；其 claim 到期，B 接管并读到 C1 受理和消费均成功。若“恢复”据此直接执行 C1，A 恢复后也可能继续消费之后的执行步骤。两者 commandId 和授权回执完全相同，受理去重与 Permit 至多消费一次都成立，但它们没有竞争一个执行端的“首次开始”状态。另一条轨迹是消费后未执行即崩溃，恢复时 Permit 已到期，却把旧回执视为无期限新执行许可。
- 缺失契约：执行端开始调用的单一线性化点，以及耐久授权回执在尚未开始/已经开始/开始未知三种状态下的权限。只写“查询后恢复”不足以消除开发者的行为选择。
- 建议：执行端增加语义状态 ACCEPTED → AUTHORIZED → STARTED → 已知结果，STARTED 必须在真正调用前按 commandId 和当前执行 fence 原子竞争；只有胜者可发起首次调用。STARTED 后丢失结果统一 UNKNOWN、只查不重发；无法证明从未 STARTED 时不得恢复执行。明确首次 STARTED 前必须复核当前 claim、取消、Deadline、授权时效和 epoch；旧授权回执允许查询既有事实，不能绕过已撤销/过期约束。若首版不提供 AUTHORIZED 后恢复首次执行能力，直接冻结为查询/失败关闭也可。补充消费后暂停并接管、STARTED 后崩溃、消费后撤销/到期三个屏障用例。

## SEC-R3 [P2] 来源验证缺少封闭的 source × payload 授权表

- 位置：flow-engine.md:2230–2232、2252、2258；2459–2464。
- 问题：RuntimeEvent 的 source 与 payload 是独立联合，2252 只列出模型不得注入三个安全事件。规范要求“验证来源”，但未列出 tool、child、scheduler、recovery 各允许提交哪些 payload；尤其 recovery 既能产生规范化完成事件又能提交 EffectReconciled，边界没有封闭。这里缺的是权威事件生产资格，不是要求 Core 自行验签或判 RBAC。
- 具体攻击/故障轨迹：工具回调通道确实通过认证、被标记 source=tool；回调 payload 却是 ApprovalResolved，审批引用是该 Run 的真实引用。若入口只验证通道身份、作用域和引用，且只实现文中明示的 model 禁止项，它可以进入审批通过分支并请求新 PDP 决策。PDP 仍是最终授权点，但审批事实已经被非审批源伪造，若 PDP 采信该事实则可错误授权。类似的 EffectReconciled 注入会绕过 UNKNOWN 等待。
- 缺失契约：闭合的生产者权限矩阵和恢复器的权威证据验证责任。
- 建议：在 21.2 增加枚举白名单；默认任何未列 source/payload 组合拒绝。security 才能产生权限/审批事实，tool 仅工具执行事实，child 仅 Child 事实，scheduler 仅推进/取消/Deadline 唤醒；recovery 允许的旧命令完成事实逐项列明，并强制查询对应权威执行/安全记录、保留原命令因果绑定。适配器从认证通道赋 source，禁止采用外部自报值；Core 只进行纯结构与允许组合检查。增加每个来源注入其他来源事件的负向契约测试。

## 已确认无新增问题的部分

- 21.5 明说摘要不是授权证明，也不是低熵数据脱敏；21.9 诊断包排除参数摘要和 Permit 内容，受租户运维授权控制。
- 21.6 不假装 Run 与安全 Store 跨域原子提交，消费回执和 ToolCall 事实分开，方向正确；SEC-R2 针对其剩余的执行阶段语义，不否定这种分离。
- 21.8 明确现有 PermissionGrant 不等于耐久 Permit；这属于实现验收边界，不能当作设计缺陷。
- 审批通过重新 PDP 判定、零隐藏模型重发、取消优先与安全审计失败阻止新派发均有明确规定。

历史记忆仅用于定位既有失败关闭评审关注点；所有上述判断已用本次文档现场核对。

<oai-mem-citation>
<citation_entries>
MEMORY.md:126-127|note=[prior FlowEngine safety scope checked against current design]
</citation_entries>
<rollout_ids>
01a06bc2-39d5-7fa3-bb9c-b1dd126a10a3
</rollout_ids>
</oai-mem-citation>
