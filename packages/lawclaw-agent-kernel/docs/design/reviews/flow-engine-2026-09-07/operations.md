# FlowEngine 运维评审

结论：有条件通过。完整阅读 flow-engine.md（本次核对为 2509 行版本），以第 21 章 FE-CON-1 为准。以下为设计可开发性问题，不以候选状态、尚无代码或测试执行记录作为缺陷。未重复报告主评审正在处理的第 13/15 章默认值、Inbox 队首、恢复匹配与执行端排他阶段。

文件：`/Users/oscar/jurismind/code/pi-lawclaw/packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine.md`

1. **[P2] 终态 UNKNOWN 的人工核对没有完整关闭契约。** 行 2391、2401、2441，关联行 2258—2260、2357—2364。轨迹：工具 UNKNOWN → Run 因 Deadline 进入 Cancelled → 运维次日查到外部已生效。文档要求终态不变、迟到事实分表、未解决 incident 不得删除，但 EffectReconciled 的状态迁移仅覆盖 Suspended，未定义终态核对写入如何关闭 incident、更新命令执行事实、幂等返回及审计证据。开发者仍需自行决定关闭流程。建议明确由受控恢复入口验证证据后，按 incidentRef/targetCommandId 原子更新独立 incident 与执行事实；重复同证据幂等、矛盾证据冲突，Run.version 不变；关闭后重新计算保留期限。增加“取消后核对成功及重复提交”的验收轨迹。

2. **[P2] 内存队列限额没有覆盖耐久存储容量。** 行 2391、2476、2486。轨迹：每批 Run 完成后提示队列下降，下一批继续受理；历史 Inbox/回执保留 30 天，UNKNOWN incident 长期保留，SQLite/Artifact 占用持续增长，但 maxQueueDepth 始终不满，最终磁盘不足导致状态、安全审计和取消事实都无法写入。恢复指标的“最多 4096 条 Run”是测试规模，并非受理上限。建议给本地档案增加耐久待处理 Run 总数、状态/Artifact 字节预算或磁盘低水位、清理保留空间及拒绝阈值；达到阈值只拒绝新 Run，保留既有 Run 结果/取消/核对写入能力。明确指标与告警，并以持续多批完成任务和未关闭 incident 积累压测。

3. **[P2] 运行中丢提示与挂起 Deadline 的唤醒时限未冻结。** 行 2260、2397、2481、2486。轨迹：Host 正常运行，T1 已持久化但提示丢失，之后没有新请求；或审批挂起释放执行槽且无审批回调。现有规则只要求 Inbox 扫描恢复、State 可用后 5 秒识别，未指定常态扫描周期、Deadline 到期项扫描及重启后的定时器重建，也未规定扫描调度公平性。开发者可以实现仅启动扫描而无法给运行中这两条轨迹一个恢复上界。建议规定 Scheduler 持续有界扫描未消费 Inbox、未完成 Outbox、到期非终态 Run，明确周期、分页游标、饥饿上限；DeadlineReached 使用稳定去重身份，并测试无新流量下丢提示和重启后的挂起到期。

4. **[P2] 第 14 章遥测 schema 与 21.9 白名单互斥。** 行 1915—1919、1925、1932 与 2488。`flow.advance.decided` 要求 digest，指标要求 `{decision}`、`{reason}`；21.9 却只允许 phase/result/code 标签，并未把 digest 纳入日志白名单。轨迹：按第 14 章实现埋点、按 21.9 实现过滤器，必需字段/标签被丢弃，按旧标签编写的面板得到空分组。建议直接同步第 14 章，决定统一用 result/code 表达 decision/reason；若诊断日志需要 decisionDigest，单独明确其受控字段资格，普通日志不输出。增加白名单与指标 schema 的契约断言。

满足以上条件后可通过本地首版运维设计评审；不要求先引入多 Worker、分布式租约或新监控平台。
