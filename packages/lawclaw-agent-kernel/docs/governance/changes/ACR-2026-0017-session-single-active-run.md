# ACR-2026-0017：Session 单活 Run 绑定

- 日期：2026-09-09；提出人：总体架构所有者；记录人：Codex。
- 级别：L2；状态：IMPLEMENTING，待 G3 联合复核与持久化实现。
- 用户决定：Session 中一个 Session 任意时刻最多只有一个活跃 Run，不管理多个 Run。
- 授权范围：候选架构、契约、图、代码和测试更新；数据库、持久 Schema、提交与推送仍未授权或未执行。

## G0/G1：问题与影响

旧候选设计写成“Session 可关联多个 Run”，当前代码也以 `runIds` 集合和 `maxRunsPerSession` 保存多个历史 Run，另用 `activeRunId` 做进程内并发守卫。这混合了当前占用、历史审计和容量管理，导致 SessionManager 看起来需要 Run 集合、一套队列/容量策略以及 Session 级接管。

本变更将语义收紧为：`AgentSession.activeRunBinding` 基数固定 `0..1`；终态 Run 仅在 RunRegistry 留档；同一 Session 只有在旧绑定完整释放后才能顺序运行下一 Run。影响总设计、L1、SessionManager、RunRegistry、BND-L1-001、CD-1、领域对象图、Root Run 时序、SFMEA 和 acceptance。历史 ACR/评审记录保留，不静默改写。

本记录提出时，`AgentSession.#runIds`、`AgentObjectModelLimits.maxRunsPerSession`、`runtime-settings.ts` 的同名配置及相应用例仍表达旧模型；2026-09-09 已开始进程内迁移，当前实现进展见下方 G4，不把该进展扩张为持久协议完成。

## G2：方案与取舍

| 方案 | 结果 | 决定 |
|---|---|---|
| Session 保存多个 Run 并用 active 标记 | 可直接列历史，但需要集合一致性、容量和并发语义 | 拒绝；历史不属于 Session 聚合 |
| Session 只保存 `0..1 ActiveRunBinding`，历史归 RunRegistry | 不变量最小，当前占用与审计分离 | 采用 |
| Session 和 RunRegistry 各自实现 lease/fence | 可局部拒绝旧执行，但状态重复且恢复易漂移 | 拒绝；Attempt 接管只归 RunRegistry |

受理协议固定为：Gateway 或 SubSessionCoordinator 先调用 `SessionRunCommandPort`；SM 以 Session 版本 CAS 原子写 `RESERVED + bindingVersion + receipt + AdmitRun outbox`；提交后 worker 调 RunRegistry。确认后转 `ACTIVE`，效果未知转 `SUBMIT_UNKNOWN` 且只查询原命令。Run 终态必须携带匹配的 `runId + bindingVersion`，SM 经 `RELEASING` 完成最终 Session/Join 写入后才清空绑定。

第二个不同 Run 遇到非空绑定时返回 `SESSION_RUN_ACTIVE`，不排队、不抢占。Parent Join 等待与 resume 使用同一 Parent Run；每个 Child Session 各自只有一个 Child Run。Barrier 的 B/C 并发仍是跨 Session 竞争，原有 inbox/member/barrier CAS 不删除。

## 可靠性删减与保留

删除：Session Run 列表一致性、`maxRunsPerSession`、Session 内 Run 排队/公平性、多 Run 写入仲裁和 Session 级 takeover lease。

保留：单行占用 CAS、幂等回执、受理 UNKNOWN 对账、`bindingVersion` 迟到事件防护、终态 finalization、RunRegistry Attempt claim/fence，以及跨 Child Session 的 Barrier 乱序与 Reduce 唯一性。

## G3：评审状态与实现门槛

文档状态为候选并已完成影响分析，不代表实现或运行验证。开发必须先删除 Session 侧 `runIds/maxRunsPerSession` 语义，新增持久 `ActiveRunBinding`、受理 outbox/inbox、RunRegistry binding receipt 校验和迁移测试。

强制验收为 `SES-RUN-T-01～06`、`SES-TAKEOVER-T-01～03`、`SES-E2E-07`：并发双占仅一胜者；UNKNOWN 不释放；旧 bindingVersion 不清新绑定；同 Run Attempt 接管不新增 Session lease；顺序两 Run 的历史仅由 RunRegistry 查询。

## 回退与迁移

影响分析阶段只有文档变更，可通过后续 ACR 显式替代，不修改历史记录。代码迁移一旦删除 Session Run 集合属于模型变更，不能以恢复 `maxRunsPerSession` 作为静默兼容；若上层确需并行 Run，必须为每个 Run 创建独立 Session 或提交新的架构变更。

## G4：2026-09-09 首个实现切片

已完成进程内对象模型迁移：`AgentSession` 删除 `runIds`，新增封闭 `ActiveRunBinding`；绑定按 `RESERVED -> SUBMIT_UNKNOWN/ACTIVE -> RELEASING -> IDLE` 推进并校验 `bindingVersion`。`AgentObjectModelLimits`、严格配置和现有纵切删除 `maxRunsPerSession`，历史 Run 继续只由 `RunRegistry` 查询。

已执行定向 UT、DT 与 Faux system 测试，以及类型、公开契约注释、运行时依赖无环和 20 张 PlantUML 语法检查。该证据只覆盖单进程切片；`SessionRepositoryPort`、持久 CAS、幂等回执、受理 outbox/inbox、RunRegistry `SessionRunBindingRef` 校验、首次访问 ensure 和 `SubSessionCoordinator` 均未实现，`SES-RUN-T-01～06` 仍不得标记为通过。
