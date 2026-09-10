---
doc_id: SEC-CMP-004
level: component
layer: Security Plane
component: ApprovalBridge
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Kernel Ask 状态与外部技术审批通道的异步桥接
parent: SEC-DES-001
interfaces: [ApprovalRequestPort, ApprovalDecisionPort]
diagrams: []
supersedes: ["[归档技术审批子系统设计](../../../../governance/archive/design-v3-pre-layering/technical-approval-subsystem-design.md) 中外部审批桥接部分"]
---

# ApprovalBridge 组件设计

## 职责

ApprovalBridge 把 Kernel 的 Ask 判定和技术 PermissionRequest 交给 Kernel 外部审批能力，并将经过认证、可关联的决定带回 PermissionDecisionEngine。它不选择审批人、不解释业务审批流程、不发送业务通知，也不执行受保护动作。

## 状态与不变量

Kernel 只保存技术请求标识、ActionDigest、截止时间、当前状态和外部关联引用。等待期间 Runtime/同步 RPC 不得被占用。外部决定必须绑定同一请求、动作摘要和策略上下文；迟到、重复、无法认证或已终结决定不得改变状态。

## 生命周期

Ask 持久化后异步提交；桥接器记录提交回执并允许幂等重投。外部 Allow 回来后仍需签发新的短时 Permit，外部响应本身不是 Permit。Deny、过期或取消使请求收敛，不能通过重放旧响应恢复。

## 故障与安全

通道超时保持等待或按 Deadline 过期，不默认允许。回调身份由 KernelHost/Transport 边界验证后再进入 Kernel，原始 User Token 不得传入本组件。日志与通知仅包含脱敏摘要和引用。

## 契约边界

外部审批协议、回调 DTO、通知渠道和业务审批模型不在本文冻结。

## 开发设计：SEC-CMP-004 / CD-1（2026-09-07）

候选开发设计，不代表实现或批准。分类：**独立组件**。字段与操作唯一维护于[CD-1契约](../../../contracts/component-development-contracts-v1.md#approval-bridge)；早期概要中的签名待定、可选重试等简写按CD-1明确行为解释。分类依据见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

### 1. 问题与取舍

具体失效/验证轨迹：审批approve正常：只写批准事实，不直接派发工具。需要下面的职责划分与明确提交/恢复点；协作者可用纯函数实现，不要求每个职责一个类、进程或公共Port。

### 2. 内部职责、依赖与生命周期

ApprovalBridge：耐久投递与回写；RequestProjector：最小外部说明；CallbackVerifier：可信服务上下文；DecisionReducer：状态机；ApprovalOutboxWorker：重复提交同请求。

本节细化既有Port允许的调用方向。跨组件只交换不可变值、稳定引用或Port，不传共享可变Run/Session。机制依然归Infrastructure，不因合并开发任务而搬入领域层。

### 3. 数据与操作

[数据与操作明细](../../../contracts/component-development-contracts-v1.md#approval-bridge)给出字段、判别值和调用边界。写操作组合CD-1命令元数据，查询组合请求与可信作用域；Ref不构成访问授权。无状态对象仅为输入输出，不因此新建Repository。

### 4. 正常流程与分支

PDP同事务建立pending与投递outbox；worker向已配置外部通道提交稳定approvalRef，外部必须幂等返回同关联。回调认证后检查审批能力、请求/动作/epoch/当前取消/Deadline，CAS pending→approved或denied并写通知outbox；批准仅是事实，Core据此再次RequestPermission。超过Deadline先expired，同一时间边界批准不成功。

先验证来源、Scope、大小、契约与幂等前置，再执行本节算法。明确区分纯计算结果、耐久受理回执和外部执行结果；外部操作只在必要状态提交后派发。

### 5. 并发、幂等与恢复

提交超时只查询外部approvalRef，通道无幂等查询能力则保持待交付并报警，不能创建第二审批单。回调重投同externalDecisionId同载荷返回原结果；矛盾决定冲突。接管重建事件必须由安全端按当前Attempt重签事实，不让recovery自签。

无法证明未执行时返回UNKNOWN，不返回absent或success。模型/工具首版自动执行重试0，查询有界重试与重新执行分开。并发验收同时核对状态版本、提交顺序和真实执行次数。

### 6. 安全

外部审批人员选择属于外部业务系统；Bridge只验证Host给定审批能力。外部通知只含脱敏技术描述和受控引用，不发送Prompt/参数/Secret。新策略epoch不自动沿用旧批准。

普通遥测不含Prompt、Memory正文、工具参数、内容摘要、Secret、Permit或物理路径。必要安全审计走独立耐久Journal；普通遥测失败不回滚事实。拒绝路径同时保证未授权读取数和新副作用数为0。

### 7. 配置、容量与运维

pending≤4096、投递在途8、外部请求超时5秒、查询重试3；回调64KiB；最长等候min(Run剩余,10分钟)，每秒过期扫描。

以上为设计目标，不是测量结果。配置启动校验、冻结configVersion，不能热更新放宽既有Run。指标使用CD-1封闭component/phase/result/code集合；共同告警、容量总账与保留期见CD-1。

诊断顺序：核对版本 → 查询本次身份与阶段 → 查询权威回执或投影来源 → 区分拒绝/未受理/已受理/UNKNOWN → 按本节恢复。禁止直接改数据库状态或放宽权限解除挂起。

### 8. SFMEA、故障注入与验收

局部表是契约验收矩阵，不对正常用例机械计算风险分数。具体失效原因、系统影响、严重度依据、控制措施与跨组件测试见[统一SFMEA](../../../reviews/components-2026-09-07/acceptance-matrix.md)。O/D无运行证据不估数值；全部具名风险均是强制实现验收项，不依赖RPN阈值。

| 场景/需求 | 输入、故障注入与精确预期 | 局部追踪 | 测试 |
|---|---|---|---|
| SEC-CMP-004-SC-01/REQ-01 | 审批approve正常：只写批准事实，不直接派发工具 | SEC-CMP-004-FM-01 | SEC-CMP-004-TC-01 |
| SEC-CMP-004-SC-02/REQ-02 | 同回调重复10次：状态版本增1、通知1 | SEC-CMP-004-FM-02 | SEC-CMP-004-TC-02 |
| SEC-CMP-004-SC-03/REQ-03 | approve与deny并发：一个CAS成功，另一冲突 | SEC-CMP-004-FM-03 | SEC-CMP-004-TC-03 |
| SEC-CMP-004-SC-04/REQ-04 | 恰好Deadline批准：expired且Permit0 | SEC-CMP-004-FM-04 | SEC-CMP-004-TC-04 |
| SEC-CMP-004-SC-05/REQ-05 | 审批已approved后权限撤销：新PDP不得allow | SEC-CMP-004-FM-05 | SEC-CMP-004-TC-05 |
| SEC-CMP-004-SC-06/REQ-06 | 外部受理丢响应：按原approvalRef查询，不新建请求 | SEC-CMP-004-FM-06 | SEC-CMP-004-TC-06 |

六例均做契约/集成验证；纯算法使用冻结输入，涉及崩溃的用例加真实进程终止与SQLite/Artifact恢复，不能只重建内存实例。Faux Provider记录实际生效次数，测试不使用真实密钥或付费模型。用ManualClock和双屏障精确控制取消、到期和CAS竞态，不以sleep碰撞概率。

每例保存合成输入、契约/config/代码版本、屏障释放顺序、调用轨迹、期望/实际状态与数量、错误码、资源清理和泄漏扫描。必须分别注入未生效失败、已生效丢响应；预期不能由被测实现生成。

另覆盖合法成功、每个声明状态迁移与未声明状态×操作拒绝；限额逐个测L-1/L/L+1，两Scope交错和取消清理。性能按最大合法输入运行10,000次，记录Node/OS/CPU/内存和P99；异步组件按统一SFMEA的固定Faux负载测得C后，以0.8C到达速率持续30分钟，资源不超硬界限。独立实现验收报告必须区分替身、真实本地和真实外部证据。

### 9. 开发拆分与完成定义

顺序：契约验证 → 纯规则/状态机 → Repository或机制Adapter → 幂等/恢复 → 安全强制 → 具名故障和容量验收。实现分类为内部职责的随所属组件交付，不另建服务；条件启用项只有档案满足才启用。

文档就绪要求：五角色无未关闭P0/P1、字段和操作无未定义引用、恢复无开发者自由猜测分支、SFMEA映射验收、配置有硬界限。实现就绪另需代码、测试与持久性证据和架构所有者批准。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
