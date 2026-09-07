# FlowEngine 运维复核

结论：通过。原 4 项 P2 均在设计层面关闭。本次只复核原问题对应修订及新增验收分支，未修改仓库文件；不代表实现、压测或真实故障恢复已经通过。

复核文件：`/Users/oscar/jurismind/code/pi-lawclaw/packages/lawclaw-agent-kernel/docs/design/layers/l1-control/components/flow-engine.md`。

| 原问题 | 结论 | 当前证据 |
|---|---|---|
| 终态 UNKNOWN 缺少核对关闭契约 | 关闭 | 2487 行定义 IncidentStore、带 expectedVersion/resolutionId 的受控 resolve、可信证据与越权拒绝；终态只更新 incident/执行事实，不发送推进事件、不授权重试。1868 行 FE-TC-029 明确重复、矛盾、越权及 Run/version 不变的断言。 |
| 耐久容量不受队列限额覆盖 | 关闭 | 2491 行明确 10GiB 总配额、1GiB 保留区、4096 活跃 Run、32MiB 单 Run 转录、80% 告警与 90% 拒绝新业务；磁盘实际可用空间参与保护，open incident 不删除，保留区耗尽失败关闭。1869 行要求持续批次与 open incident 累积验证。 |
| 丢提示及挂起 Deadline 无恢复上界 | 关闭 | 2489 行明确每秒扫描、按游标分页、5秒完成最多4096活动Run、启动先扫描、Deadline 耐久事件与唯一 wake；1869 行包含无新流量丢提示、挂起重启后到期的验收轨迹。 |
| 遥测字段和标签规则冲突 | 关闭 | 1912 行不再要求普通日志记录 digest；1916—1921 行统一 phase/result/code 封闭标签，与 21.9 白名单一致；1925 行明确故障告警与保护动作。 |

12.5.6a 将终态 incident、不可取消在途动作、扫描和容量保护纳入具名故障验收，且 1860、1872 行明确替身/真实持久化 Adapter 验证以及待执行状态。后续按这些契约提交执行证据即可，无需因尚未实现而重新打开本轮文档问题。
