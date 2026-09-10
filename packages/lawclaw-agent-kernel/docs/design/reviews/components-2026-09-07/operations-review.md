# 组件详细设计运维评审

日期：2026-09-07。对象：CD-1、L1/L2/L3/Security 组件及各目录 Kernel 依赖要求。只评审 Kernel 产出信号、背压、诊断、取消及审计失败处理；不要求设计外部告警平台、存储产品或 L4 执行机制。采用 architecture-design-review 技能。本文为独立文档评审，不是实现验证。

## 初审结论

暂未达到待开发：P0 为 0，P1 为 2，P2 为 1。方向正确，但必要观测信号入口和审计成功确认点仍需开发者自行决定。扫描吞吐与五秒覆盖矛盾、SFMEA 评分重复已由测试评审跟踪，本报告不重复登记。

## OPS-R1：P1，约定的背压与扫描告警缺少可表达的输入

位置：[CD-1 公共类型及 Kernel 观测责任](../../contracts/component-development-contracts-v1.md)第 42—45、78 行；[运维依赖要求](../../layers/operations-plane/kernel-dependencies.md)第 19—33 行。

问题：Kernel 唯一遥测写入口 `emit(TelemetryRecord)` 只含 component/phase/result/code/durationMs/count。MetricPoint 虽定义 `name`，没有对应写入口或读取 Kernel 采样数据的依赖。队列容量、队列深度、扫描最大滞后和持久字节不是操作数量或操作耗时，不能按该 DTO 无歧义上报；固定 phase 也不能区分同组件多个队列。

反例：Scheduler 队列持续 220/256，调用次数与耗时完全正常。按目前合法 TelemetryRecord 输出，外部消费者无法推导超过 80%，更无法判断容量配置是否为 256 或 4096。扫描停滞时没有新的扫描完成事件，也不能从完成耗时得出最老未扫描对象的等待时间。

修法：在运维目录的依赖要求定义有界的 counter/gauge/histogram 输入或 `observe(MetricPoint)`，增加封闭 queue/resource 标识及 limit 值，规定采样责任、频率、单位和缺样行为。Kernel 在 Scheduler、ResourceManager、RunRegistry 的既有观测责任中引用来源；明确 UNKNOWN/旁路由耐久 Incident 驱动，普通 emit 丢弃不丢这些事实。无需新增平台组件。

关闭条件：Faux 依赖记录两个不同队列的 depth/limit，ManualClock 推进 60 秒能识别正确告警输入；冻结扫描后仍输出 lag；遥测缓冲满时丢弃计数可查询且不递归依赖同一已满队列。

## OPS-R2：P1，审计意图与耐久审计回执的执行门槛未唯一确定

位置：[运维依赖要求](../../layers/operations-plane/kernel-dependencies.md)第 9、55—57 行；[ExecutionPermit](../../layers/security-plane/components/execution-permit.md) CD-1 第 4—6 节；[PermissionDecisionEngine](../../layers/security-plane/components/permission-decision-engine/README.md) CD-1 第 4 节；[ToolCallRuntime](../../layers/l3-tool-runtime/components/tool-call-runtime.md) CD-1 第 4、6 节。

问题：原则明确要求所有受保护动作审计失败关闭，但文档同时存在“领域事务 outbox/审计意图”“独立耐久 Journal”“响应前确认必要审计耐久”。没有唯一说明事务中的 outbox 是否就是权威审计记录，还是必须向另一 Journal append 后收到 AuditReceipt 才返回 Permit/StartGrant。该选择直接决定执行安全门槛和崩溃恢复，不能留给不同组件各自理解。

反例：consume/grant 与 outbox 已提交，审计 append 响应丢失或 exporter 停止。实现 A 把 outbox 当已完成审计返回 grant，实现 B 等独立 Journal 回执而拒绝；两者都能引用现有句子。若 Journal 才是权威而采用 A，STARTED 发生时未满足必要审计；若 outbox 已是权威而采用 B，普通出口故障会不必要地阻断执行。

修法：选定首版唯一模式，例如同权威事务写不可变 AuditEvent 和稳定 sequence 即耐久确认，outbox 仅负责外发；或明确独立 Journal 回执及按 auditEventId 查询确认后才允许返回 grant。规定无确认/提交未知时返回什么、同命令恢复依据，以及拒绝审计本身失败不能再递归请求审计。此为 Kernel 使用边界保证，不要求设计外部存储机制。

关闭条件：分别注入审计提交前失败、已提交丢响应、普通 exporter 故障、领域提交失败；逐项给出 grant/STARTED/外部执行次数和可查询审计事实。实现者不得依靠“日志可用”或“outbox 有一条”自行推定安全确认。

## OPS-R3：P2，诊断输出尚缺最小结构与缺失证据表示

位置：[运维依赖要求](../../layers/operations-plane/kernel-dependencies.md)第 43—45 行；[CD-1 Kernel 观测责任](../../contracts/component-development-contracts-v1.md)第 80 行；各组件 CD-1 第 7 节诊断顺序。

问题：diagnose 只返回 Artifact，说明允许版本/阶段/计数/错误/受控 Ref，但没有最小内容 Schema、大小和查询预算。不同 Adapter 可以返回完全不同的“诊断文件”，无法稳定区分原始 UNKNOWN、证据已过期和依赖查询失败。

反例：取消已受理但 Sandbox 停止状态未知，诊断组件查询 Process 失败。若仅输出阶段 cancelled，读者无法知道取消事实与物理停止证据不同。

修法：在运维目录规定最小 DiagnosticSummary（版本、采集时间、来源、权威/投影、查询结果类别、受控事实引用），明确 unknown/gone/unavailable 分开；给总条数/字节/截止上限，诊断不得读取 Prompt/参数正文。具体诊断 UI 和存储实现仍不在本轮。

## 已具备的基础

- 普通遥测有内存上限，敏感字段禁止进入日志，指标禁止动态 ID 标签。
- Scheduler 有界队列、持久 runnable 与 Parent 释放槽规则；资源未知时停止新分配。
- UNKNOWN 不自动重执行，ToolCall inspect、Run 查询和受控 resolveIncident 已提供恢复方向。
- 取消受理与真实停止分开，超期 Child 清理进入 Incident，未确认物理占用不释放。
- 统一持久配额保护包含恢复保留容量，open incident/非终态事实不会按普通保留期删除。

关闭 OPS-R1/R2 并复核后，可从运维角色评为文档待开发；实际容量、进程故障与外部保证仍须实现验收提供证据。

## R1 复核记录

重新读取运维依赖全文、CD-1 必要审计完成点和跨组件验收矩阵 K-TC-08/14。初审问题保留为历史记录。

- OPS-R2 的核心歧义已消除：outbox 不能代替 Journal 确认；同事件 AuditReceipt 或同事务 Journal 的等价确认是执行门槛，未知时不交出 grant、不 STARTED；恢复只补相同审计事件。K-TC-08 给出未确认启动为 0 和最终 Journal 恰好 1 条的验收条件。
- OPS-R3 已关闭：DiagnosticBundle/DiagnosticRecord 定义版本、采集时间、受控收据、Incident 和 available/gone/unavailable/unknown；上限 256 条/1MiB，按 Scope 过滤且禁止正文/参数。该结构足以区分取消事实与物理停止证据，不要求外部诊断平台设计。
- OPS-R1 已新增足够的 signal 种类、value/limit 和采样责任，但复核时同页旧 emit/writeBatch 仍收 TelemetryRecord，CD-1 MetricPoint 仍旧字段，需统一为新契约；补充 drop 计数不递归进入已满队列，以及扫描停滞时仍按周期生成 lag。该项待正文统一后关闭。

此轮剩余问题是契约一致性，不新增外部实现范围。以上为文档复核，没有运行实现测试。

## R1 最终复核与关闭

2026-09-07，再次读取运维依赖全文和 CD-1 对应类型、必要审计完成点，确认此前剩余项已修订：

| 问题 | 状态 | 关闭依据 |
|---|---|---|
| OPS-R1 / P1 | 已关闭 | emit/writeBatch 均接收 TelemetrySignal；CD-1 MetricPoint/MetricName 与 gauge/counter 快照一致，保留 limit、sampledAtMs、dimension；队列满时 drop 使用旁路饱和计数并经 snapshot 读取；独立每秒采样 scan_lag，扫描停滞仍增长。K-TC-14 约束信号、泄漏、丢弃和审计隔离。 |
| OPS-R2 / P1 | 已关闭 | CD-1 明确完整 found/absent/unknown/gone 查询联合，仅 found 或同事务 Journal 等价确认开放动作；审计 outbox 不是确认，未知不交付 grant、不 STARTED；K-TC-08 固定重复审计与启动次数。 |
| OPS-R3 / P2 | 已关闭 | 固定脱敏 DiagnosticBundle/Record、有界输出、Scope 过滤及四类证据状态已落实，取消事实不能冒充物理停止证据。 |

运维角色最终结论：本轮 Kernel 设计范围内无剩余 P0/P1/P2，达到文档待开发状态。该结论只证明必要信号、背压、诊断及审计使用契约足以指导开发，不代表架构批准、代码实现或运行验证完成。K-TC-08/14 和容量、进程故障验收仍须在实现阶段执行；外部运维、基础设施与 L4 机制不纳入本轮详细设计通过范围。
