# FlowEngine 数据评审复核

最终结论：**通过（文档数据契约评审）**。原 2 项 P1 及复核新增的 1 项 P1 均已关闭，本次复核范围内无遗留阻断项。未修改仓库；本结论不代表运行验证通过。以下保留发现过程与最终处置证据；历史行号对应各次评审快照。

## 原发现关闭情况

| 发现 | 状态 | 复核证据 |
|---|---|---|
| D1 提前事件/重复唤醒堵塞队头 | 关闭 | flow-engine.md:2212—2218：提前合法事实进入不占 sequence 的 DeferredReceipt；单 Run 仅一个 admitted；T2 后按新状态筛选；wake 按 Run/版本唯一生成；非法队头有带 claim/version/审计的 quarantineHead。原“审批先于 Ask”和“通知与扫描双 wake”轨迹不再导致权威队列死锁。 |
| D2 模型工具轮次缺失完整转录 | 关闭 | flow-engine.md:2165—2166 增加 assistantTurnRef，TranscriptEntry 增加角色与因果引用，2453—2455 规定所有 ModelCompleted 分支和核对成功的追加规则、T2 原子写入及确定转录头。原文本 T、Proposal P1、结果 R 可以通过规范化助手消息和 tool 条目重建。 |

## 曾发现 R1 [P1] 安全事实不能按接管规则重建——最终已关闭

- 位置：`packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine.md:2214`、`:2428`。
- 问题：来源白名单只允许 source=security 产生 PermissionResolved/ApprovalResolved，recovery 的重建名单不包括这两种事件；但接管规则要求旧 Attempt 的未消费 Inbox 全部 superseded，再通过 recovery 事件重建业务事实。安全事实没有合法恢复通道。DeferredReceipt 的旧 Attempt 处理也尚未明确。
- 轨迹：Run=Suspended(approval)，A1 的合法 ApprovalResolved 已耐久受理但尚未 T2 → Host 崩溃 → A2 接管、旧事件被 superseded → 按21.7生成的新 recovery ApprovalResolved 在21.2被拒 → 审批源已经得到耐久受理 ACK，没有义务重发；Run 无法从已经批准的事实继续，只能等待到期。PermissionResolved(ask/allow) 在受理与消费之间崩溃有同样矛盾。
- 修正：恢复器仅触发安全端查询原权限 commandId/approvalRef；安全端核验其耐久权威事实、当前授权与审批资格，以 source=security、当前 Attempt、稳定重发事件 ID 返回事实。允许复用原审批事实但不得复用失效 Permit。明确旧 admitted 与 Deferred 的安全事件均走此通道，且未取得可恢复凭证前保留耐久待恢复标记；recovery 本身仍不能自签 allow/approved。
- 建议验收：PermissionResolved(ask)、ApprovalResolved(true) 分别在 T1 后/T2 前崩溃，接管后仅消费一次，最终继续原 Proposal，不重新调用模型；允许后的 Permit 已过期时不得直接派发。

最终处置复核：最新 flow-engine.md:2239 已明确权限/审批恢复例外，由恢复器查询原权限 commandId/approvalRef，安全端验证当前执行信封、授权 epoch 与审批资格，以 source=security 为当前 Attempt 重新签发；security-replay ID 包含 runId/attemptId/originalEventId/securityRecordVersion，同键载荷固定。旧 Deferred 同样按事件类型迁移，无法确认则保留待恢复事实并禁止派发。21.7 接管规则指回21.2的按类型恢复，不再要求安全事实由 recovery 自签。12.5.6a 的 FE-TC-027（当前1866行）增加受理后接管、安全端重签、撤销后禁止 DispatchTool 的故障验收。原恢复通道冲突已消除，R1关闭。

## 验证边界

本次阅读修订后的第21章相关协议，并抽查 examples.json 已采用新结构；主 agent 负责类型抽取与数值/摘要校验。本次未声称8个 JSON 向量已通过运行契约验证。仍需实现阶段使用真实持久化复现上述故障窗口。
