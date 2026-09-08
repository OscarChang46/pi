# FlowEngine 安全复核

最终结论：**通过本轮安全设计复核。SEC-R1、SEC-R2、SEC-R3 及复核遗留 SEC-R2a 均已关闭；未发现新增 P1 或 P2。** 结论仅针对本文安全设计契约，不代表生产实现或测试通过。

## 最终复核与关闭证据

| 问题 | 最终状态 | 最新文档证据 |
|---|---|---|
| SEC-R1 | 关闭 | flow-engine.md:2482 仍完整保留 commandId/incidentRef/等待种类/source/causationId 与非空有界完成结果的强制匹配 |
| SEC-R2、SEC-R2a | 关闭 | flow-engine.md:2484 将失效截止改为 authorizeStart 线性化前，逐项列出 claim owner/attempt/fence 和到期、Run 取消、command/Run Deadline、Permit expiresAtMs、授权 epoch、撤销与原消费绑定；保留首次 STARTED CAS 与 UNKNOWN 禁止重执行 |
| SEC-R3 | 关闭 | flow-engine.md:2228 保持封闭来源白名单；2238 由安全端验证当前执行信封、epoch 和审批有效性后，以 source=security 重签旧 Attempt 的安全事实，recovery 不能自签 allow/approved |

FE-TC-028（1866 行）覆盖“Permit 已进入 AUTHORIZED 后到期、Run 尚未到期”及两个 Worker 竞争 STARTED，预期分别为零新执行及仅一个获胜者。FE-TC-027（1865 行）覆盖旧审批事实接管后的安全端重签与权限撤销；这是设计测试要求，不是执行结果。

新增安全端重签路径与原来源隔离规则一致：恢复器负责查找旧事实，安全端负责重新验证、为当前 Attempt 签发，stable eventId 由原事件与 securityRecordVersion 组成。不能确认时禁止派发，也不能沿用旧 Allow 跳过当前撤销。因此未发现把旧 Attempt 授权转化为跨 epoch 权限的新增路径。

以下保留首次复核历史，其行号、遗留状态均为当时快照，不是当前开放问题。

## 首次复核历史

结论：**有条件通过；原 2 项完全关闭，1 项核心问题关闭但遗留 P2 表述精度问题；未发现新增 P1。** 本轮仅复核安全相关修改及其契约一致性，不代表运行实现或测试通过。行号对应本次读取版本。

| 原问题 | 复核结果 | 证据 |
|---|---|---|
| SEC-R1 [P1] EffectReconciled 因果绑定 | 关闭 | 第 2455 行明确匹配 reason 类型、commandId、incidentRef、causationId 和 source；限定结果种类，完成结果非空有界，失配 FLOW_EVENT_CONFLICT，不解除挂起 |
| SEC-R2 [P1] 消费回执误作首次执行权 | P1 核心问题关闭；遗留一项 P2 精度修正 | 第 2457 行新增 RECEIVED/AUTHORIZED/STARTED，首次 STARTED CAS 排他，STARTED 后 UNKNOWN 只查询不重执行，授权撤销有明确线性化点；剩余见下文 |
| SEC-R3 [P2] source × payload 权限表 | 关闭 | 第 2214 行封闭列明所有来源允许的事件，未列组合在 sequence 分配前拒绝，审批需验证处置权限，recovery 禁止自造 allow/approved |

## 遗留 SEC-R2a [P2] 失效截止点应写 authorizeStart，而非 AUTHORIZED

位置：第 2457 行。

新增首次执行协议的主体已解决原先重复执行问题，但写成“AUTHORIZED之前失效的Permit不能凭旧消费回执获得新执行机会”，与本段后文声明 authorizeStart 为权限生效线性化点不完全一致；检查项列 Deadline，未明确是 Run/command 截止还是 Permit 自身 expiresAtMs。

具体轨迹：Permit 于 t=10 被消费、进入 AUTHORIZED，t=20 Permit 到期但 Run Deadline=t=100，t=30 恢复后调用 authorizeStart。按有效期不变量应拒绝；按新增“AUTHORIZED之前”字面限定及只检查 Run Deadline，开发者可能保留已过期消费回执的启动资格。

建议将句子改为：“authorizeStart 线性化前，必须验证当前 claim 的 owner/attempt/fence 和到期、Run 取消状态、command/Run Deadline、Permit 自身 expiresAtMs、当前授权 epoch、撤销及原消费绑定；任何一项失效均禁止签发 startGrant。只有 authorizeStart 已成功的动作才按在途取消处置。” 不需要增加第二套 PDP，也不需要跨域大事务。

本项降为 P2，因为第 10 章与 21.6 的总不变量已要求 Permit 无效时零新副作用，且新协议已提供再次校验位置；剩余是把准确检查时点与字段写全，避免局部说明误导。修正后 SEC-R2 可完全关闭。

## 新增安全机制检查

- AUTHORIZED → STARTED 本地 CAS 只允许一名获胜者调用 Provider；另一名接管者不能靠同一消费回执再次执行。
- 将 authorizeStart 定义为权限生效线性化点，明确其后撤销仅作在途取消，避免宣称跨安全服务和 Provider 的瞬时撤回。
- 终态 incident 的受控身份、expectedVersion、幂等 resolutionId、可信证据及不重启 Run 限制已写明（2459 行）；未发现通过关闭 incident 获得重试权限的路径。
- 来源白名单和恢复因果检查应同时落于可信入口及纯结构校验；新增文案未让 Core 承担身份认证或 PDP 策略判断。

复核未调用真实 Provider、未修改仓库。
