# FlowEngine 测试评审

结论：**有条件通过**。本轮识别 3 项 P2；无新增 P1。以下为设计与验收定义问题，不以生产实现或测试尚未存在为缺陷。已完整阅读设计正文及全部 17 个场景、FE-CON-1 和 examples JSON。评审位置按当前工作区版本记录；主 agent 正在修订，行号可能继续移动。

## P2-1：取消性质要求超出了外部执行协议能够保证的范围

- 位置：`packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine.md:1782`；关联 `1740`、`2449`、`2491`。
- 问题：性质测试要求“取消后有限时间内无活动外部动作和 Child Run”，FE-TC-013 又要求“无孤儿”；但执行协议明确 ACCEPTED 只能请求取消，30 秒清理到期可以记录未完成清理。这两组标准无法同时作为必过断言。
- 反例：工具已耐久受理并执行一个不可中断任务，取消请求成功入库，但执行端网络隔离超过 30 秒。系统正确停止新派发、保留原 commandId/UNKNOWN/清理记录，仍会被 12.4 的“无活动外部动作”判失败；若只用支持立即取消的替身，会掩盖这一合法分支。
- 修正：将验收拆成“取消栅栏后新业务受理次数为零”“本地可释放资源在 30 秒内释放”“未完成在途命令/Child 必须有耐久关联及待清理/核对状态”。明确不可撤销执行允许继续，并添加不响应取消的 Tool/Child 故障脚本；外部任务最终结束仅在执行端提供该保证时验证。

## P2-2：规范化字符串转义仍允许不同摘要，现有向量无法排除

- 位置：`packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine.md:2380`；数据位置 `flow-engine-contract-v1.examples.json:4-30`。
- 问题：FE-C14N-1 要求确定字节，但只规定“字符串按 JSON 转义编码”。JSON 允许可选转义；并未指定哪些字符必须直接输出、哪些转义形式唯一合法。现有三个向量没有斜线、反斜线、控制字符或非 BMP 对象键，无法检测关键差异。
- 反例：同一值 `{"path":"a/b"}` 可以序列化为 `{"path":"a/b"}` 或 `{"path":"a\/b"}`；两者都是合法 JSON 且符合当前文字，却会产生不同 event/command digest。中文同样存在原字符与 `\uXXXX` 两种形式。
- 修正：明确无空白、仅对引号/反斜线及 U+0000—U+001F 转义，固定控制字符短转义/十六进制形式，其余合法 Unicode 保持原样 UTF-8；或精确引用所采用的序列化规则。补上述字符、负零、安全整数边界及 UTF-16 排序的固定字节/摘要向量。非法 Unicode/浮点等单独作为拒绝向量，不与合法 JSON fixture 混淆。

## P2-3：提交查询返回 absent 后迟提交的安全屏障没有进入故障验收脚本

- 位置：`packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine.md:1852-1864`；关联 `1753`、`2447`。
- 问题：21.6 明确定义“查询 absent 不足以允许重算”，必须使旧 claim 失效并经过权威事务屏障；测试脚本却只注入“提交先持久化，再丢响应”，列举的四个必测窗口也没有“超时但旧提交仍可随后完成”。现有脚本无法验证这条新安全规则。
- 反例：第一次 commit 暂停在真正写入前，调用方超时；queryCommit 返回 absent；错误 Coordinator 立即重算并尝试新动作，随后释放第一次 commit。这个错误仍可通过现有“已提交但丢 ACK”的脚本，因为该脚本查询永远看到 committed。
- 修正：在 FE-TC-026 增加具名分支，用两个屏障控制旧事务与 claim 失效事务：先返回 absent，断言此时零重算/派发；随后分别测试旧事务先提交与 claim 先失效，断言只恢复原提交或在屏障后确定 absent 才重算。要求真实 RunRegistry Adapter 同跑此契约，不能仅由始终线性返回的状态替身证明。

## 已核对且未列为缺陷

- JSON 明确标记为 `design-expectations-not-runtime-test-results`，V1—V8 均包含完整输入与期望输出。
- 通过独立临时 Node 脚本重算了 3 个规范化向量及 8 个案例适用的 event/input/decision/command 摘要，全部匹配。此结果仅证明设计期望数据的摘要一致性，未运行或验证 FlowEngine 实现。
- 不把第一批已明确修复中的 Inbox 队首/重复唤醒、ContextFailed、转录、恢复匹配、Permit 阶段问题重复计为本轮主要发现。
- SFMEA 的待评分/待 Owner 保持候选状态，没有冒充关闭。建议冻结时把模型 UNKNOWN、失效 claim 及 above absent 竞态绑定具名失效模式；本轮不把表中 Open 本身当作缺陷。
