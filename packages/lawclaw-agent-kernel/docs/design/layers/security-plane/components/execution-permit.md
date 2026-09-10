---
doc_id: SEC-CMP-002
level: component
layer: Security Plane
component: ExecutionPermit
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 一次性 ExecutionPermit 的生命周期、绑定与消费不变量
parent: SEC-DES-001
interfaces: [PermitValidationPort]
diagrams: []
supersedes: ["[归档技术审批子系统设计](../../../../governance/archive/design-v3-pre-layering/technical-approval-subsystem-design.md) 中 ExecutionPermit 部分"]
---

# ExecutionPermit 组件设计

## 职责

ExecutionPermit 是独立授权聚合，证明某个已判定动作在限定时间、资源和执行上下文内可被执行一次。它不是角色或长期凭证，也不能替代动作执行结果。

Permit、消费回执、StartGrant 与撤销/过期状态只由本组件及其安全存储拥有。Session、Run、ToolCall、Memory 或 JoinBarrier 最多保存 `permitRef/permitReceiptRef/startGrantRef/bindingDigest` 等不透明外部引用，不得内嵌 Grant、复制消费状态或根据引用自行恢复权限。当前实现中的旧短时 Grant 只是迁移基线，不是候选架构允许写入 Session 的模型。

## 状态与不变量

Permit 至少在语义上绑定 ActionDigest、Run、Agent、执行信封引用、策略版本、资源范围、有效期和唯一消费标识。生命周期为未消费、已消费、过期或撤销；终态不可回退。任何字段或目标变化都必须重新判定并签发新 Permit。

所有受保护动作均执行一次性消费；只读动作可以使用较低隔离强度，但不能绕过消费约束。校验和消费必须在耐久存储中原子完成，并发调用至多一个成功。

## 操作边界

PermitValidationPort 只验证真实性、绑定、时效、策略版本和消费状态，不重新运行策略规则。验证者不能扩大资源范围、延长有效期或替换 ActionDigest。

## 恢复与故障

执行超时后“Permit 已消费”不等于“动作成功”；调用方必须查询 ToolCall 等权威状态。存储不可用、时钟不可信、验签失败或状态未知时失败关闭，禁止补发等效 Permit 后盲重试副作用动作。

## 契约边界

签名材料、字段类型、持久化 Schema 和错误码留待契约评审。

## 开发设计：SEC-CMP-002 / CD-1（2026-09-07）

候选开发设计，不代表实现或批准。分类：**独立组件**。字段与操作唯一维护于[CD-1契约](../../../contracts/component-development-contracts-v1.md#execution-permit)；早期概要中的签名待定、可选重试等简写按CD-1明确行为解释。分类依据见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

### 1. 问题与取舍

具体失效/验证轨迹：两command竞争同Permit：仅一个consume成功。需要下面的职责划分与明确提交/恢复点；协作者可用纯函数实现，不要求每个职责一个类、进程或公共Port。

### 2. 内部职责、依赖与生命周期

PermitService：生命周期命令；BindingValidator：精确比对；ConsumptionLedger：原子单消费者；StartAuthorizer：当前执行资格检查；ScopedRepository：耐久回执。首版本地不透明Ref，不引入可离线验证Bearer JWT。

本节细化既有Port允许的调用方向。跨组件只交换不可变值、稳定引用或Port，不传共享可变Run/Session。机制依然归Infrastructure，不因合并开发任务而搬入领域层。

### 3. 数据与操作

[数据与操作明细](../../../contracts/component-development-contracts-v1.md#execution-permit)给出字段、判别值和调用边界。写操作组合CD-1命令元数据，查询组合请求与可信作用域；Ref不构成访问授权。无状态对象仅为输入输出，不因此新建Repository。

### 4. 正常流程与分支

issue仅PDP应用服务可调用，外部不能提交state/commandId；初始化issued。consume事务检查Run/Agent/信封/动作/目录/资源/epoch/expiry，issued→consumed并保存同command回执及审计意图；同command同绑定返回原receipt，不同command拒绝。authorizeStart读取当前claim/Run取消、全部Deadline、Permit expiry/current epoch/revocation和消费绑定，成功写一次性grant与审计。首版本地权威数据库事务提供Run取消与安全状态的共同读取线性化，逻辑聚合仍分开。

先验证来源、Scope、大小、契约与幂等前置，再执行本节算法。明确区分纯计算结果、耐久受理回执和外部执行结果；外部操作只在必要状态提交后派发。

### 5. 并发、幂等与恢复

消费不表示执行。AUTHORIZED未启动可查询原receipt并重新走当前authorizeStart；STARTED不重新执行。撤销先于authorizeStart则零grant；晚于则在途取消。同grant不能授权另一执行端或命令，Grant由受控L3一次CAS保存。时钟/审计/存储不可信均拒绝启动。

无法证明未执行时返回UNKNOWN，不返回absent或success。模型/工具首版自动执行重试0，查询有界重试与重新执行分开。并发验收同时核对状态版本、提交顺序和真实执行次数。

### 6. 安全

Ref查询仍校验服务与scope；不透明ID不构成授权。PermitRef只能经受信服务间通道传递，不进模型/日志。首版本地只支持一个权威安全/Run存储实例，跨库/跨机authorizeStart协议必须另行设计，不能做非原子读后缓存放行。

普通遥测不含Prompt、Memory正文、工具参数、内容摘要、Secret、Permit或物理路径。必要安全审计走独立耐久Journal；普通遥测失败不回滚事实。拒绝路径同时保证未授权读取数和新副作用数为0。

### 7. 配置、容量与运维

Permit TTL≤30秒、最大活跃4096；consume/authorizeStart超时2秒；非终态/incident不删，终态后30天保留消费事实。

以上为设计目标，不是测量结果。配置启动校验、冻结configVersion，不能热更新放宽既有Run。指标使用CD-1封闭component/phase/result/code集合；共同告警、容量总账与保留期见CD-1。

诊断顺序：核对版本 → 查询本次身份与阶段 → 查询权威回执或投影来源 → 区分拒绝/未受理/已受理/UNKNOWN → 按本节恢复。禁止直接改数据库状态或放宽权限解除挂起。

### 8. SFMEA、故障注入与验收

局部表是契约验收矩阵，不对正常用例机械计算风险分数。具体失效原因、系统影响、严重度依据、控制措施与跨组件测试见[统一SFMEA](../../../reviews/components-2026-09-07/acceptance-matrix.md)。O/D无运行证据不估数值；全部具名风险均是强制实现验收项，不依赖RPN阈值。

| 场景/需求 | 输入、故障注入与精确预期 | 局部追踪 | 测试 |
|---|---|---|---|
| SEC-CMP-002-SC-01/REQ-01 | 两command竞争同Permit：仅一个consume成功 | SEC-CMP-002-FM-01 | SEC-CMP-002-TC-01 |
| SEC-CMP-002-SC-02/REQ-02 | 同command同绑定重投：同receipt，不是第二次授权 | SEC-CMP-002-FM-02 | SEC-CMP-002-TC-02 |
| SEC-CMP-002-SC-03/REQ-03 | 消费后到期再authorizeStart：PERMIT_EXPIRED且Provider0 | SEC-CMP-002-FM-03 | SEC-CMP-002-TC-03 |
| SEC-CMP-002-SC-04/REQ-04 | 取消与authorizeStart双屏障：取消先则grant0，启动先则记录在途 | SEC-CMP-002-FM-04 | SEC-CMP-002-TC-04 |
| SEC-CMP-002-SC-05/REQ-05 | 消费后断电：重启同receipt可查，Permit不恢复issued | SEC-CMP-002-FM-05 | SEC-CMP-002-TC-05 |
| SEC-CMP-002-SC-06/REQ-06 | 授权epoch撤销：历史receipt不能启动 | SEC-CMP-002-FM-06 | SEC-CMP-002-TC-06 |

六例均做契约/集成验证；纯算法使用冻结输入，涉及崩溃的用例加真实进程终止与SQLite/Artifact恢复，不能只重建内存实例。Faux Provider记录实际生效次数，测试不使用真实密钥或付费模型。用ManualClock和双屏障精确控制取消、到期和CAS竞态，不以sleep碰撞概率。

每例保存合成输入、契约/config/代码版本、屏障释放顺序、调用轨迹、期望/实际状态与数量、错误码、资源清理和泄漏扫描。必须分别注入未生效失败、已生效丢响应；预期不能由被测实现生成。

另覆盖合法成功、每个声明状态迁移与未声明状态×操作拒绝；限额逐个测L-1/L/L+1，两Scope交错和取消清理。性能按最大合法输入运行10,000次，记录Node/OS/CPU/内存和P99；异步组件按统一SFMEA的固定Faux负载测得C后，以0.8C到达速率持续30分钟，资源不超硬界限。独立实现验收报告必须区分替身、真实本地和真实外部证据。

### 9. 开发拆分与完成定义

顺序：契约验证 → 纯规则/状态机 → Repository或机制Adapter → 幂等/恢复 → 安全强制 → 具名故障和容量验收。实现分类为内部职责的随所属组件交付，不另建服务；条件启用项只有档案满足才启用。

文档就绪要求：五角色无未关闭P0/P1、字段和操作无未定义引用、恢复无开发者自由猜测分支、SFMEA映射验收、配置有硬界限。实现就绪另需代码、测试与持久性证据和架构所有者批准。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
