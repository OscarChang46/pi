# FlowEngine 数据独立评审

结论：**不通过**。需先关闭以下 2 项 P1，再冻结 FE-CON-1。候选状态、尚未实现或未运行测试均未作为缺陷。

范围：完整阅读 flow-engine.md 第 1—2509 行；补读 run-registry.md、run-scheduler.md、context-engine.md。仅文档评审，未修改仓库、未运行代码测试。

## D1 [P1] 入站顺序与严格队头消费不能处理合法提前事件

- 位置：`packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine/README.md:2252-2254`、`:2332-2334`（关联 `:2320`、`:2350-2355`）。
- 问题：T1 对受理的新事件按到达顺序分配权威 sequence；Core 只消费下一序号；非法迁移 reject 不消费。与此同时，21.4 允许合法提前事件持久化等待，却没有不占活跃 sequence 的暂存区、可重排的归并点或受控队头处置事务。这三条无法同时保证推进。
- 具体轨迹：Run 在 AwaitingPermission，consumedSequence=10。安全系统已创建审批记录，快速审批的 ApprovalResolved 先于迟到的 PermissionResolved(ask) 到达。若前者按“合法提前事件持久化等待”受理为 seq=11，后者为 seq=12，则 seq=11 在 AwaitingPermission 只能 reject；进入 Suspended 所需的 seq=12 又不能越过队头。重复扫描与 CAS 重算都不能解除，Run 只能等取消/到期。
- 同类恢复轨迹：Ready 唤醒没有语义幂等 ID 规则。通知和恢复扫描分别生成不同 eventId 的 AdvanceRequested，依次入 seq=11、12；seq=11 已提交 AwaitingModel，seq=12 便阻塞后面的 ModelCompleted。仅按 eventId 去重不足以避免该轨迹。
- 建议：冻结接收状态机。合法但因果前置尚未消费的事件先放耐久 staging，满足条件后再分配活跃 sequence；或设计有审计收据的明确队头处置事务。将 AdvanceRequested 定义为基于 Run/已提交 Ready 版本的稳定语义事件，T1 幂等插入。需要分别验证“审批先到”和“扫描与通知双唤醒”。不要靠跳序或超时取消掩盖堵塞。

## D2 [P1] 工具型模型输出没有完整转录写入数据通道

- 位置：`packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine/README.md:2256`、`:2293-2297`、`:2343`、`:2353`、`:2460`。
- 问题：文档要求模型同时输出文本与工具时保留文本为转录事实，但 ModelOutput(tools) 只有 proposals，没有文本/完整模型消息 Artifact。该迁移只保存 pendingActions；工具完成后删除首 Proposal，并只向 transcriptAppend 追加结果 Artifact。ContextAssemblyPort 又仅接收冻结绑定、transcriptHeadRef、预算和版本，不能取得已移除的模型调用信息。T2 是转录索引权威写入事务，因此 Adapter 无法直接通过独立写转录来补洞。
- 具体轨迹：模型产生文本 T 和工具调用 P1(args A) → T1 只存 proposals → T2 保存 pendingActions=[P1] → 工具成功后 T2 清空 pendingActions、追加结果 R → Host 崩溃 → Context 按新的转录头重建，只能找到 R，不能重建 T、P1 及 R 对应的调用身份。需要配对工具调用与结果的模型消息无法形成完整因果链，下一轮还可能重提已执行动作。持久 Inbox 中能找到 Proposal 不等于已定义了 Context 的回放输入，更不能补回根本未进入事件的文本 T。
- 建议：为 ModelCompleted 添加不可变、规范化的模型消息/转录 Artifact 引用（覆盖文本和带 proposalId 的工具调用顺序）；将工具/Child 结果包装为带角色、命令/Proposal 因果引用的规范化转录项。在接受模型输出的同一 T2 中追加模型消息，结果 T2 追加与之配对的结果项。冻结 Context 对这些转录项的读取契约，并增加 tools→成功→崩溃→重建 Context 的精确 fixture。

## 已核实、不列为缺陷

- `RunScheduler` 已要求启动扫描全部非终态 Run 并重建队列，因此不能仅凭“Ready 提交后、提示发送前崩溃”认定永久丢失调度；D1 指的是重建时的语义事件去重和权威序号规则。
- T2 原子保存状态、消费收据与 Outbox，且未知提交必须先失效旧 claim、经过权威屏障再确认 absent；这些设计可以防止把提交超时错误地当成未提交。
- 旧已提交命令在接管后保持 commandId/payload/originAttemptId，不通过新 Attempt 重新生成命令；首版模型/工具自动重试为零，不将这些保守约束当作功能缺陷。
