> **非规范性归档：** 有效边界已吸收到 L1 的 [FlowEngine 组件设计](../../../design/layers/l1-control/components/flow-engine.md)；本草案中的企业中间件和跨层直连仅保留为评审历史。

# FlowEngine 详细设计模板

> 文档状态：草案模板，待架构评审
> 设计对象：FlowEngine 运行边界与无状态推进核心
> 适用阶段：详细设计、SFMEA、接口评审与测试设计
> 日期：2026-09-04
> 实施约束：本文通过评审前，不据此修改运行代码、公共 Schema 或数据库结构。
> 文档约束：当前版本为独立草案，不包含文档交叉引用。

## 0. 文档控制

### 0.1 修订记录

| 版本 | 日期 | 作者 | 变更摘要 | 评审状态 |
|---|---|---|---|---|
| `0.1.0-draft` | 2026-09-04 | 待填写 | 建立详细设计大纲 | 待评审 |

### 0.2 评审角色

| 角色 | 关注点 | 负责人 | 结论 |
|---|---|---|---|
| 架构评审 | 边界、依赖方向、职责唯一性 | 待填写 | 待评审 |
| 安全评审 | PEP/PDP、授权失败关闭、敏感数据 | 待填写 | 待评审 |
| 数据评审 | 快照、CAS、幂等、恢复点 | 待填写 | 待评审 |
| 测试评审 | SFMEA 覆盖、故障注入、验收条件 | 待填写 | 待评审 |
| 运维评审 | 可观测性、容量、告警、诊断 | 待填写 | 待评审 |

### 0.3 决策状态

| 决策 ID | 主题 | 候选结论 | 状态 |
|---|---|---|---|
| `FE-DEC-001` | FlowEngine 名称所指范围 | 区分运行边界与无状态 Core | 待确认 |
| `FE-DEC-002` | 任务获取模型 | Event Poller 消费有界任务流 | 待确认 |
| `FE-DEC-003` | 并发控制 | 基于版本的 CAS，不在 Core 内持锁 | 待确认 |
| `FE-DEC-004` | 模型流解析归属 | Parser 输出规范化 RuntimeEvent | 待确认 |
| `FE-DEC-005` | 工具调用边界 | Core 只生成 ActionProposal，PEP/Router 执行 | 待确认 |
| `FE-DEC-006` | 状态提交模型 | 独立 Committer 原子提交，冲突后重载推进 | 待确认 |

## 1. 设计摘要

### 1.1 问题

说明 FlowEngine 需要解决的具体问题：如何在不拥有持久状态、不解释权限策略、不直接执行副作用的前提下，持续推进一个 Agent Run 的 ReAct 循环，并在模型、工具、状态存储和外部事件发生故障时保持可恢复、可审计和可测试。

### 1.2 设计结论

候选结论：

- `FlowEngine Core` 是无状态、确定性的 Run 推进算法；输入不可变快照和规范化事件，输出下一步命令集合。
- `FlowEngine Runtime Boundary` 是进程内协作边界，可装配 Poller、Assembler、Parser、Committer、PEP Client 和 Tool Router Client，但这些组件不因此成为 Core 的内部状态或权限权威。
- 持久状态由外部 Repository/State Store 拥有；权限决策由 PDP 拥有；物理副作用由 Tool Provider 或 Sandbox 执行。
- 每次推进必须带 `expectedVersion`、幂等键、Deadline 和 OperationContext；冲突、超时和未知副作用必须显式收敛。

### 1.3 典型执行短轨迹

```text
TaskEvent
  -> load RunSnapshot + SessionSnapshot
  -> assemble ContextFrame
  -> advance(...)
  -> ModelInvocationCommand
  -> RuntimeEvent.ToolCallProposed
  -> permission decision
  -> authorized tool dispatch
  -> RuntimeEvent.ObservationReceived
  -> advance(...)
  -> CompleteRunCommand
  -> CAS commit
```

## 2. 范围与边界

### 2.1 设计目标

- 定义 FlowEngine 运行边界、Core 类结构和依赖方向。
- 定义一次推进的输入、输出、不变量和失败语义。
- 定义同层组件协作能力及层内接口。
- 定义与上层调度、安全、认知、执行、存储和运维能力的层间接口。
- 定义 SFMEA、测试用例、容量约束和可观测性规格。
- 形成可用于后续接口冻结和实现评审的统一模板。

### 2.2 非目标

- 不设计业务 Workflow、业务补偿或业务结果采纳。
- 不解释用户、租户、RBAC 或组织权限。
- 不拥有模型 Provider、PDP、数据库、消息总线或工具执行器的实现。
- 不把具体 Kafka、SQLite、OceanBase、OPA、MCP 或 MicroVM 类型带入 Core。
- 不冻结数据库 DDL、网络部署拓扑或具体中间件选型。
- 不在本阶段修改代码或生成实现任务。

### 2.3 绝对边界

> FlowEngine Core 不存数据、不判权限、不直接使用模型算力、不制造物理副作用。

| 允许 | 禁止 |
|---|---|
| 读取不可变快照 | 直接读写数据库 |
| 计算下一状态与命令 | 自行签发或扩大权限 |
| 生成模型调用意图 | 持有 Provider 密钥或直接绑定 SDK |
| 生成 ActionProposal | 直接调用 MCP、内部 API 或沙箱 |
| 输出提交意图 | 绕过版本校验覆盖状态 |
| 传播取消、Deadline 和追踪上下文 | 保留跨推进调用的可变会话状态 |

### 2.4 运行边界与 Core 边界

| 边界 | 包含 | 不代表 |
|---|---|---|
| FlowEngine Runtime Boundary | Poller、Assembler、Parser、Core、Committer、PEP/Router Client 的进程内装配 | 所有组件由 Core 拥有或共享一个事务 |
| FlowEngine Core | ReAct 状态机、推进规则、命令生成、终态判定 | 消息消费、I/O、权限裁决、工具执行或持久化 |

## 3. High Level 架构设计

### 3.1 设计视图说明

本视图表达逻辑协作和信任边界，不直接等同于部署单元、代码包或事务边界。蓝色表示外部 I/O，黄色表示进程内组件，红色表示安全边界。

### 3.2 High Level 架构图

```plantuml
@startuml
!pragma layout smetana
skinparam defaultFontName sans-serif
skinparam roundcorner 8
skinparam maxMessageSize 200
skinparam componentStyle uml2

skinparam package {
    BackgroundColor<<InProcess>> #FCF6EC
    BorderColor<<InProcess>> #D68A1A
}
skinparam rectangle {
    BackgroundColor<<External>> #EAF2F8
    BorderColor<<External>> #2980B9
    BackgroundColor<<Security>> #FDEDEC
    BorderColor<<Security>> #E74C3C
}
skinparam database {
    BackgroundColor<<External>> #EAF2F8
    BorderColor<<External>> #2980B9
}
skinparam queue {
    BackgroundColor<<External>> #EAF2F8
    BorderColor<<External>> #2980B9
}

title 企业级 Agent OS：FlowEngine 微内核运行边界

actor "外部请求 / API 网关" as Gateway

queue "事件驱动总线\n[External: Kafka / 内存 Channel]" as MQ <<External>>
database "全局状态聚合根\n[External: OceanBase / SQLite]" as StateDB <<External>>
cloud "大模型认知引擎\n[External: LLM Provider]" as LLM <<External>>
rectangle "策略决断中心 (PDP)\n[External: OPA / IAM]" as PDP <<Security>>

package "物理执行生态 (Action Targets)" {
    rectangle "MCP Servers\n(标准插件源)" as MCP <<External>>
    rectangle "L3: 微服务\n(内部业务)" as L3 <<External>>
    rectangle "L4: 微虚拟机\n(代码沙盒)" as L4 <<External>>
}

package "FlowEngine Runtime Boundary (进程/协程)" <<InProcess>> {
    note top: Core 绝对边界：不存数据、不判权限、不沾算力、不造副作用

    [Event Poller\n(事件消费者)] as Poller

    folder "Memory & Compute (纯 CPU 逻辑)" {
        [Context Assembler\n(组装裁剪/滑动窗口)] as Assembler
        [Output Parser\n(AST/流式解析器)] as Parser
        [FlowEngine Core\n(ReAct 状态机推进)] as StateMachine
    }

    folder "Transaction & Syscall (系统调用边界)" {
        [State Locker & Committer\n(CAS 乐观锁与快照提交)] as Locker
        [PEP Interceptor\n(提权拦截器)] as PEP
        [Tool Router Client\n(幂等路由与调度)] as Router
    }
}

Gateway =down=> MQ : 1. 发送异步规范化任务
MQ -down-> Poller : 2. 获取任务与执行信封引用
Poller -right-> Locker : 3. 申请版本化快照
Locker <-up-> StateDB : 4. CAS 读取与抢占
Locker -down-> Assembler : 5. 载入 Run/Session 快照
Assembler -right-> StateMachine : 6. 生成有界 ContextFrame
StateMachine -up-> LLM : 7. 经认知 Port 提交模型请求
LLM -down-> Parser : 8. 接收并解析流式响应
Parser -left-> StateMachine : 9. 生成规范化 RuntimeEvent
StateMachine -down-> PEP : 10. 生成 ActionProposal
PEP <-right-> PDP : 11. 请求权限决断
PEP -down-> Router : 12. 携带有效 Permit 放行
Router -down-> MCP : 13a. 执行标准协议
Router -down-> L3 : 13b. 执行内部 API
Router -down-> L4 : 13c. 执行沙箱任务
MCP -up-> Router : 14. 返回规范化 Observation
L3 -up-> Router
L4 -up-> Router
Router -up-> Assembler : 15. Observation 进入下一轮上下文投影
StateMachine -up-> Locker : 16. 输出挂起/完成/继续命令
Locker -up-> StateDB : 17. CAS 原子提交并释放执行权

@enduml
```

### 3.3 架构图待确认项

| 编号 | 问题 | 候选处理 | 评审结论 |
|---|---|---|---|
| `FE-ARC-001` | Poller 是否属于 FlowEngine | 属于运行装配边界，不属于 Core | 待确认 |
| `FE-ARC-002` | Locker 命名是否暗示长事务锁 | 更名为 SnapshotLoader/StateCommitter，优先 CAS | 待确认 |
| `FE-ARC-003` | Assembler 是否与 ContextEngine 重叠 | 仅作为 Context Port Client 或薄协调器 | 待确认 |
| `FE-ARC-004` | Parser 是否属于 Adapter | Provider/协议解析留在 Adapter，Core 只收规范化事件 | 待确认 |
| `FE-ARC-005` | PEP 与 Router 是否被 Core 直接调用 | Core 输出命令，由 Action Coordinator 调用 | 待确认 |
| `FE-ARC-006` | L1 是否允许直接访问 L4 | 默认禁止，经 Tool/Sandbox 边界路由 | 待确认 |

## 4. 组件职责设计

### 4.1 职责矩阵

| 组件 | 核心职责 | 输入 | 输出 | 权威数据 | 明确不负责 |
|---|---|---|---|---|---|
| Event Poller | 消费、确认、退避与背压 | TaskEvent | DispatchWorkItem | 消费位点由消息机制持有 | Run 决策、业务优先级 |
| Snapshot Loader | 按版本读取推进所需快照 | RunRef、SessionRef | AdvanceInput | 无 | 长期持锁、修改聚合 |
| Context Assembler Client | 请求生成有界上下文 | ContextRequest | ContextFrame | 无 | 长期记忆权威写入 |
| Output Parser | 将 Adapter 输出规范化 | Provider chunks | RuntimeEvent | 无 | 推进状态、权限决策 |
| FlowEngine Core | 计算下一状态和命令 | AdvanceInput | AdvanceDecision | 无 | I/O、持久化、副作用 |
| State Committer | 校验版本并原子提交 | CommitIntent | CommitResult | 聚合 Repository 持有 | 重新计算推进规则 |
| PEP Interceptor | 执行前校验 Permit | ActionProposal、Permit | AuthorizedAction/拒绝 | Permit 权威状态由安全域持有 | 定义权限策略 |
| Tool Router Client | 幂等派发与结果归一化 | AuthorizedAction | Observation | ToolCall 权威状态由工具域持有 | 权限裁决、业务补偿 |

### 4.2 RACI

> `A`：最终负责；`R`：执行；`C`：参与；`I`：获知。

| 能力 | FlowEngine Core | Scheduler/Poller | Context | Security | Tool Runtime | Repository |
|---|---|---|---|---|---|---|
| 计算下一动作 | A/R | I | C | I | I | I |
| 任务选择与派发 | I | A/R | I | I | I | C |
| 上下文组装 | C | I | A/R | C | I | C |
| 权限决断 | I | I | I | A/R | C | C |
| 工具副作用 | I | I | I | C | A/R | C |
| Run 状态提交 | C | C | I | I | I | A/R |
| 冲突后重载 | R | C | I | I | I | A |

## 5. 类图与对象模型

### 5.1 类图

```plantuml
@startuml
skinparam classAttributeIconSize 0
hide empty members

class FlowEngine {
  +advance(input: AdvanceInput): AdvanceDecision
}

class AdvanceInput <<immutable>> {
  +run: RunSnapshot
  +session: SessionSnapshot
  +context: ContextFrame
  +event: RuntimeEvent
  +operation: OperationContext
}

class AdvanceDecision <<immutable>> {
  +nextState: RunState
  +commands: EngineCommand[]
  +expectedVersion: Version
  +decisionDigest: Digest
}

interface EngineCommand
class InvokeModel
class ProposeAction
class SuspendRun
class CompleteRun
class FailRun
class CreateChildRun
class JoinChildRun

interface ContextAssemblyPort
interface ModelInvocationPort
interface PermissionDecisionPort
interface ToolDispatchPort
interface StateCommitPort
interface ClockPort
interface ObservabilityPort

FlowEngine --> AdvanceInput
FlowEngine --> AdvanceDecision
AdvanceDecision o-- EngineCommand
EngineCommand <|.. InvokeModel
EngineCommand <|.. ProposeAction
EngineCommand <|.. SuspendRun
EngineCommand <|.. CompleteRun
EngineCommand <|.. FailRun
EngineCommand <|.. CreateChildRun
EngineCommand <|.. JoinChildRun

FlowEngine ..> ContextAssemblyPort : 由应用协调层调用
FlowEngine ..> ClockPort : 仅消费显式时间上下文
InvokeModel ..> ModelInvocationPort
ProposeAction ..> PermissionDecisionPort
ProposeAction ..> ToolDispatchPort
AdvanceDecision ..> StateCommitPort
FlowEngine ..> ObservabilityPort : 产生规范化事实

@enduml
```

### 5.2 核心对象规格

| 对象 | 类型 | 必需字段 | 不变量 | 生命周期 |
|---|---|---|---|---|
| `AdvanceInput` | 不可变值对象 | 待填写 | 同一输入不可混用不同快照版本 | 单次推进 |
| `AdvanceDecision` | 不可变值对象 | 待填写 | 命令集合与目标状态必须一致 | 单次推进 |
| `RuntimeEvent` | 封闭联合类型 | 待填写 | 未知类型拒绝或隔离，不静默降级 | 单事件 |
| `EngineCommand` | 封闭联合类型 | 待填写 | 每条命令有幂等键和因果关系 | 至确认/过期 |
| `ContextFrame` | 不可变投影 | 待填写 | Token/字节/资源引用有界 | 单次模型调用 |
| `OperationContext` | 值对象 | 待填写 | Trace、Deadline、TimeContext 全链路传播 | 单操作链 |

### 5.3 推进函数规格

```text
AdvanceDecision advance(
  RunSnapshot run,
  SessionSnapshot session,
  ContextFrame context,
  RuntimeEvent event,
  OperationContext operation
)
```

前置条件：

- 所有快照均通过完整性校验，并包含明确版本。
- RuntimeEvent 属于当前 Run/Attempt，且 sequence 未被消费。
- Deadline 未过期；取消信号在推进前可见。
- 授权、路由和上下文引用只使用冻结版本。

后置条件：

- 相同规范化输入产生相同 `AdvanceDecision` 和 digest。
- 输出只包含声明过的命令类型。
- 不发生 I/O、持久化或外部副作用。
- 终态不会生成新的模型、工具、记忆或 Child Run 命令。

## 6. 状态机与核心流程

### 6.1 Run 推进状态机

```plantuml
@startuml
[*] --> Ready
Ready --> AwaitingModel : InvokeModel
AwaitingModel --> Evaluating : ModelCompleted
AwaitingModel --> Failed : ModelFailed / policy
Evaluating --> AwaitingPermission : ToolCallProposed
Evaluating --> Completed : FinalAnswerProduced
AwaitingPermission --> AwaitingTool : PermitGranted
AwaitingPermission --> Suspended : ApprovalRequired
AwaitingPermission --> Failed : Denied
AwaitingTool --> Ready : ObservationReceived
AwaitingTool --> Failed : ToolFailed / policy
Suspended --> Ready : ResumeSignal
Ready --> Cancelled : CancelRequested
AwaitingModel --> Cancelled : CancelRequested
AwaitingPermission --> Cancelled : CancelRequested
AwaitingTool --> Cancelled : CancelRequested
Completed --> [*]
Failed --> [*]
Cancelled --> [*]
@enduml
```

### 6.2 正常链路

| 步骤 | 输入 | 处理 | 输出 | 提交点 |
|---:|---|---|---|---|
| 1 | TaskEvent | 去重、校验、加载引用 | DispatchWorkItem | 消费确认待定 |
| 2 | Run/Session Ref | 读取一致快照 | AdvanceInput | 无 |
| 3 | AdvanceInput | 组装 ContextFrame | Model command | CAS 提交等待模型 |
| 4 | Model stream | 解析规范化事件 | Text/ActionProposal | 流事件检查点待定 |
| 5 | ActionProposal | 权限判断与 Permit 校验 | AuthorizedAction | 安全审计提交 |
| 6 | AuthorizedAction | 幂等执行 | Observation | ToolCall 提交 |
| 7 | Observation | 重新推进或结束 | Next command/terminal | Run/Session 独立 CAS |

### 6.3 异常、挂起与恢复链路

为以下场景分别补充时序图和恢复判定：

- 模型流中断；
- CAS 版本冲突；
- 权限需要外部批准；
- Permit 过期、撤销或已消费；
- 工具超时且副作用未知；
- 消息重复投递；
- Host 在提交前或提交后崩溃；
- Parent Run 取消并级联 Child Run；
- Deadline 到期；
- Telemetry 不可用。

## 7. 层内协作能力与接口

### 7.1 层内能力清单

| 能力 ID | 能力 | 提供方 | 使用方 | 同步性 | 失败语义 |
|---|---|---|---|---|---|
| `FE-IN-001` | 事件领取与确认 | Event Poller | Flow Coordinator | 异步 | 至少一次；Core 幂等 |
| `FE-IN-002` | 快照读取 | Snapshot Loader | Flow Coordinator | 同步/异步待定 | 版本不一致则拒绝推进 |
| `FE-IN-003` | 上下文组装 | Context Client | Flow Coordinator | 异步 | 超预算返回稳定错误 |
| `FE-IN-004` | 纯推进 | FlowEngine Core | Flow Coordinator | 同步 | 非法迁移直接拒绝 |
| `FE-IN-005` | 输出规范化 | Output Parser | Flow Coordinator | 流式 | 非法片段隔离并审计 |
| `FE-IN-006` | 状态提交 | State Committer | Flow Coordinator | 异步 | CAS 冲突重载，不覆盖 |
| `FE-IN-007` | 动作拦截 | PEP Client | Action Coordinator | 异步 | 决策不可用时失败关闭 |
| `FE-IN-008` | 工具派发 | Tool Router Client | Action Coordinator | 异步 | 返回已知/未知副作用分类 |

### 7.2 层内接口模板

每个接口使用以下结构定义：

| 字段 | 内容 |
|---|---|
| Interface ID | `FE-IF-XXX` |
| 名称 | 待填写 |
| 调用方 / 实现方 | 待填写 |
| 用途 | 待填写 |
| 请求 DTO | 字段、类型、约束、敏感级别 |
| 响应 DTO | 字段、类型、约束、敏感级别 |
| 幂等语义 | 幂等键、digest、重复处理 |
| 并发语义 | expectedVersion、顺序、隔离级别 |
| 超时与取消 | Deadline、Abort、清理责任 |
| 错误模型 | 稳定错误码、可重试性、失败关闭 |
| 可观测性 | Trace、指标、审计字段 |

## 8. 层间接口与暴露规格

### 8.1 层间接口矩阵

| 边界 ID | 方向 | 逻辑接口 | 用途 | FlowEngine 可见内容 | 禁止泄漏 |
|---|---|---|---|---|---|
| `FE-X-001` | 调度层 → Flow 层 | `FlowDispatchPort` | 提交/恢复一次推进工作 | Run/Attempt Ref、Deadline、OperationContext | 业务 Workflow 内部状态 |
| `FE-X-002` | Flow 层 → Context 层 | `ContextAssemblyPort` | 获取有界 ContextFrame | 冻结快照引用、预算 | 长期记忆底层结构 |
| `FE-X-003` | Flow 层 → 认知层 | `ModelInvocationPort` | 发起模型调用并接收规范化事件 | Prompt 投影、模型约束 | Provider SDK 私有类型、Key |
| `FE-X-004` | Flow 层 → 安全层 | `PermissionDecisionPort` | 对 ActionProposal 请求决策 | 动作摘要、资源 Ref、授权快照 Ref | RBAC、组织策略内部模型 |
| `FE-X-005` | Flow 层 → 工具层 | `ToolDispatchPort` | 携带 Permit 派发动作 | Tool Ref、参数 Artifact Ref、Permit Ref | Provider/Sandbox 私有类型 |
| `FE-X-006` | Flow 层 → 数据层 | `StateCommitPort` | 版本化提交推进结果 | CommitIntent、expectedVersion | 数据库连接和 DDL |
| `FE-X-007` | Flow 层 → 子 Run 层 | `ChildRunPort` | 创建、Join、Cancel Child Run | 约束子集、预算、Deadline | Multi-agent 业务角色和仲裁 |
| `FE-X-008` | Flow 层 → 运维层 | `ObservabilityPort` | 输出脱敏事实 | OperationContext、事件摘要 | Prompt、Key、完整工具参数 |

### 8.2 接口通用信封

| 字段 | 必需 | 约束 |
|---|---:|---|
| `requestId` | 是 | 单次请求唯一 |
| `idempotencyKey` | 写操作是 | 相同键异载荷必须冲突 |
| `runRef` | 是 | 稳定引用，不携带可变对象 |
| `attemptRef` | 按场景 | 必须属于 runRef |
| `sequence` | 事件是 | 单 Run 或 Attempt 内严格递增 |
| `expectedVersion` | 状态提交是 | 不匹配时拒绝覆盖 |
| `deadline` | 是 | UTC 时间点 |
| `timeContext` | 是 | 明确 IANA 时区语义 |
| `traceId` / `correlationId` / `causationId` | 是 | 全链路传播 |
| `payloadDigest` | 幂等操作是 | 用于重复载荷一致性校验 |

### 8.3 错误码模板

| 错误码 | 触发条件 | 可重试 | Core 行为 | 运维行为 |
|---|---|---:|---|---|
| `FLOW_INVALID_TRANSITION` | 输入事件不允许当前状态处理 | 否 | 拒绝推进 | 记录错误与输入摘要 |
| `FLOW_STALE_SNAPSHOT` | expectedVersion 冲突 | 是 | 重载后重新计算 | 统计冲突率 |
| `FLOW_DEADLINE_EXCEEDED` | Deadline 到期 | 否 | 输出超时终止命令 | 记录耗时阶段 |
| `FLOW_CONTEXT_LIMIT_EXCEEDED` | Context 无法在预算内组装 | 策略决定 | 挂起或失败 | 记录预算维度 |
| `FLOW_PERMISSION_UNAVAILABLE` | 无法获得安全决策 | 条件性 | 失败关闭 | 安全告警 |
| `FLOW_PERMIT_INVALID` | Permit 过期、撤销、已消费或不匹配 | 否 | 禁止执行 | 安全审计 |
| `FLOW_TOOL_EFFECT_UNKNOWN` | 工具超时且无法确认副作用 | 否自动重试 | 安全挂起 | 人工处置告警 |
| `FLOW_EVENT_DUPLICATE` | 已消费 sequence 重投 | 不适用 | 幂等忽略 | 计数但不告警 |

## 9. 数据、一致性与幂等规格

### 9.1 快照一致性

- 明确 RunSnapshot、SessionSnapshot、ContextFrame、AuthoritySnapshot 的版本组合规则。
- 禁止用新权限或新路由版本静默替换正在执行的冻结快照。
- 明确跨聚合独立提交顺序和补偿方式，不假设分布式大事务。

### 9.2 CAS 提交

```text
load(version = N)
  -> advance(input@N)
  -> commit(expectedVersion = N, decisionDigest = D)
      -> success(version = N+1)
      -> conflict: discard decision, reload, recompute
```

### 9.3 幂等规则

| 对象/动作 | 幂等键 | 重复同载荷 | 重复异载荷 |
|---|---|---|---|
| TaskEvent 消费 | 待填写 | 返回原处理结果/忽略 | 冲突并审计 |
| 模型调用 | 待填写 | 策略待定 | 冲突 |
| ActionProposal | 待填写 | 复用原决策引用 | 冲突 |
| Tool Dispatch | 待填写 | 返回原 ToolCall 状态 | 禁止执行 |
| State Commit | 待填写 | 返回原提交结果 | CAS 冲突 |
| Resume Signal | 待填写 | 幂等忽略 | 冲突并审计 |

### 9.4 未知副作用

定义 `NONE / KNOWN_NOT_APPLIED / KNOWN_APPLIED / UNKNOWN` 四类副作用事实。`UNKNOWN` 默认进入安全挂起，不自动重放工具调用。

## 10. 安全规格

### 10.1 安全不变量

- ActionProposal 不能直接到达 Tool Provider。
- 受保护动作必须携带与 Run、动作、资源、授权版本和有效期完全匹配的一次性 Permit。
- PEP 只执行判定结果，不拥有或修改 PDP 策略。
- PDP 不可用、响应不可验证或 Permit 状态未知时失败关闭。
- Child Run 的权限、预算、Deadline 和资源范围只能是 Parent 的子集。
- 日志、Trace、指标和错误不得包含 Secret、完整 Prompt、完整工具参数或长期记忆正文。

### 10.2 威胁与控制模板

| 威胁 ID | 威胁 | 攻击/故障路径 | 预防控制 | 检测控制 | 恢复控制 |
|---|---|---|---|---|---|
| `FE-SEC-001` | 绕过 PEP | Core/Router 直连 Provider | 依赖门禁、接口隔离 | 调用链审计 | 终止 Run |
| `FE-SEC-002` | Permit 重放 | 重复执行已授权动作 | 一次性消费、动作绑定 | Permit 消费冲突指标 | 安全挂起 |
| `FE-SEC-003` | 权限扩大 | Child/重试使用更宽快照 | 子集验证、冻结版本 | 授权版本审计 | 拒绝派发 |
| `FE-SEC-004` | 敏感数据泄漏 | 日志记录 Prompt/参数 | 结构化脱敏 | 泄漏扫描 | 删除与事件响应 |

## 11. SFMEA 分析

### 11.1 评分规则

| 维度 | 范围 | 说明 |
|---|---:|---|
| 严重度 `S` | 1-10 | 对安全、数据、业务连续性的影响 |
| 发生度 `O` | 1-10 | 在设计运行条件下的发生概率 |
| 探测度 `D` | 1-10 | 数值越高表示越难在影响前发现 |
| 风险优先数 `RPN` | `S × O × D` | 用于排序，不替代高严重度单项门禁 |

高严重度安全项即使 RPN 较低也必须有验证用例。评分阈值、责任人和关闭条件待评审冻结。

### 11.2 SFMEA 主表

| ID | 功能 | 失效模式 | 局部影响 | 系统影响 | 原因 | 现有预防/探测 | S | O | D | RPN | 建议措施 | 验证用例 | Owner | 状态 |
|---|---|---|---|---|---|---|---:|---:|---:|---:|---|---|---|---|
| `FE-FM-001` | 事件消费 | 重复投递导致重复推进 | 重复命令 | 重复模型费用或副作用 | ACK 丢失 | sequence + 幂等键 | 待评 | 待评 | 待评 | 待算 | 验证全链路去重 | `FE-TC-006` | 待定 | Open |
| `FE-FM-002` | 快照读取 | 混用不同版本快照 | 错误决策 | 状态污染或越权 | 非原子读取/缓存陈旧 | 版本组合校验 | 待评 | 待评 | 待评 | 待算 | 冻结快照集 ID | `FE-TC-007` | 待定 | Open |
| `FE-FM-003` | 状态提交 | CAS 冲突被覆盖 | 丢失更新 | Run 状态分叉 | 错误冲突处理 | expectedVersion | 10 | 待评 | 待评 | 待算 | 冲突后强制重算 | `FE-TC-008` | 待定 | Open |
| `FE-FM-004` | 模型流 | 半包/乱序/中断被当成完成 | 错误意图 | 错误工具调用 | Parser 缺陷 | 完整性与终止帧校验 | 待评 | 待评 | 待评 | 待算 | 模糊测试与断流注入 | `FE-TC-009` | 待定 | Open |
| `FE-FM-005` | 权限拦截 | PDP 不可用时默认放行 | 未授权动作 | 安全事件 | 错误降级策略 | 失败关闭 | 10 | 待评 | 待评 | 待算 | 强制 Deny/安全挂起 | `FE-TC-010` | 待定 | Open |
| `FE-FM-006` | Permit 校验 | 过期或已消费 Permit 被复用 | 重复动作 | 越权/重复副作用 | 竞态或重放 | 一次性消费 + CAS | 10 | 待评 | 待评 | 待算 | 并发消费测试 | `FE-TC-011` | 待定 | Open |
| `FE-FM-007` | 工具派发 | 超时后未知副作用被自动重试 | 重复物理动作 | 数据或财务损失 | 错误重试分类 | 副作用状态分类 | 10 | 待评 | 待评 | 待算 | UNKNOWN 强制挂起 | `FE-TC-012` | 待定 | Open |
| `FE-FM-008` | 取消 | 取消后仍生成新动作 | 孤儿操作 | 资源泄漏/未授权后续动作 | 取消检查时序错误 | 每个执行点检查 | 9 | 待评 | 待评 | 待算 | 级联取消栅栏 | `FE-TC-013` | 待定 | Open |
| `FE-FM-009` | 资源控制 | 队列或上下文无界增长 | 内存耗尽 | Host 不可用 | 缺少硬上限 | 有界队列/预算 | 8 | 待评 | 待评 | 待算 | 压测与拒绝策略 | `FE-TC-014` | 待定 | Open |
| `FE-FM-010` | 可观测性 | Telemetry 阻塞主流程 | 推进超时 | 系统雪崩 | 同步上报 | 有界缓冲/丢弃策略 | 7 | 待评 | 待评 | 待算 | 故障注入 | `FE-TC-015` | 待定 | Open |

### 11.3 SFMEA 闭环规则

- 每个高风险失效模式必须绑定至少一个测试用例。
- 每个建议措施必须有 Owner、截止条件和剩余风险。
- 已关闭项保留原始评分和措施后的剩余评分。
- 无法检测的安全风险必须转化为预防性架构门禁。
- SFMEA 更新必须触发对应接口、不变量和测试清单复核。

## 12. 测试设计

### 12.1 测试分层

| 层级 | 目标 | 依赖策略 | 主要证据 |
|---|---|---|---|
| 纯函数单元测试 | 推进规则、状态迁移、命令生成 | 固定不可变输入 | 决策快照、性质测试 |
| 组件契约测试 | Port 请求/响应、错误与版本兼容 | Faux Adapter | 契约用例、Schema 校验 |
| 子系统集成测试 | Poller、Context、Committer、PEP、Router 协作 | 内存实现/故障桩 | 状态与事件轨迹 |
| 系统测试 | 完整 Run 正常与异常流程 | 受控本地环境 | 端到端审计轨迹 |
| 压力测试 | 队列、并发、上下文、流解析上限 | 合成负载 | 吞吐、延迟、资源曲线 |
| 混沌测试 | DB、MQ、PDP、LLM、Tool、Telemetry 故障 | 可重复故障注入 | 恢复时间、无旁路证明 |
| 安全测试 | Permit 重放、越权、注入、泄漏 | 恶意输入集合 | 拒绝、审计与无副作用证明 |

### 12.2 核心测试用例清单

| 用例 ID | 场景 | 前置条件 | 注入/输入 | 预期结果 | 关联风险 | 自动化级别 |
|---|---|---|---|---|---|---|
| `FE-TC-001` | 纯文本一次完成 | 有效 Run/Session 快照 | ModelCompleted(Text) | 生成完成命令且仅提交一次 | 基线 | 单元+集成 |
| `FE-TC-002` | 单次工具 ReAct | 有效权限与工具 | ToolCall → Observation | 返回下一轮并最终完成 | 基线 | 集成+系统 |
| `FE-TC-003` | 多轮工具循环 | 有界循环预算 | 多个 ToolCall | 顺序正确，预算耗尽时停止 | 资源风险 | 单元+系统 |
| `FE-TC-004` | Ask 后挂起恢复 | 外部审批可用 | Ask → Approved | 挂起释放槽，恢复不重放模型 | 权限风险 | 系统 |
| `FE-TC-005` | Deny | PDP 返回 Deny | ActionProposal | 不触发 Router，产生审计事实 | 安全风险 | 集成 |
| `FE-TC-006` | 重复 TaskEvent | 相同 sequence/digest | 同事件投递两次 | 第二次无新命令和副作用 | `FE-FM-001` | 集成 |
| `FE-TC-007` | 快照版本错配 | Run N、Session M+1 不兼容 | 推进请求 | 拒绝推进并重载 | `FE-FM-002` | 单元+集成 |
| `FE-TC-008` | CAS 冲突 | 两个推进并发提交 N | 并发 CommitIntent | 仅一个成功，另一个重算 | `FE-FM-003` | 集成 |
| `FE-TC-009` | 模型流断开/乱序 | 流解析中 | 丢帧、半包、重复帧 | 不生成未验证 ActionProposal | `FE-FM-004` | 契约+模糊 |
| `FE-TC-010` | PDP 不可用 | ActionProposal 待决 | 超时/坏签名 | 失败关闭，无工具调用 | `FE-FM-005` | 集成+混沌 |
| `FE-TC-011` | Permit 并发重放 | 一次性 Permit | 两个并发 Dispatch | 最多一次获得执行权 | `FE-FM-006` | 集成+安全 |
| `FE-TC-012` | 工具未知副作用 | 非幂等工具执行中 | 超时/连接断开 | Run 安全挂起，不自动重试 | `FE-FM-007` | 系统+混沌 |
| `FE-TC-013` | 取消级联 | 活动 Model/Tool/Child | CancelRequested | 停止新动作，Child 收敛，无孤儿 | `FE-FM-008` | 系统 |
| `FE-TC-014` | 容量极限 | 队列/上下文接近上限 | 超额请求 | 稳定拒绝，无 OOM、无线程泄漏 | `FE-FM-009` | 压力 |
| `FE-TC-015` | Telemetry 中断 | 主流程运行中 | Collector 不可达 | 主流程不阻塞，按策略缓冲/丢弃 | `FE-FM-010` | 混沌 |
| `FE-TC-016` | Host 提交前崩溃 | 命令未提交 | 进程终止并重启 | 从旧版本安全重算 | 恢复风险 | 系统 |
| `FE-TC-017` | Host 提交后 ACK 前崩溃 | 状态已提交 | 进程终止并重启 | 识别原提交，不重复副作用 | 恢复风险 | 系统 |
| `FE-TC-018` | Deadline 到期 | 推进/外部调用进行中 | 时间推进 | 取消后终态一致、资源释放 | 时间风险 | 单元+系统 |

### 12.3 单用例模板

```text
用例 ID：FE-TC-XXX
标题：
目标：
关联需求/不变量：
关联 SFMEA：
前置状态：
输入与故障注入：
执行步骤：
预期状态轨迹：
预期命令/事件：
禁止出现的副作用：
可观测性断言：
资源清理断言：
自动化层级：
```

### 12.4 性质与不变量测试

- 确定性：相同规范化输入得到相同 decision digest。
- 终态封闭：终态输入不能生成新的外部动作。
- 幂等：同一事件重复应用不增加命令或副作用次数。
- 单调序列：已提交 sequence 不回退、不跳过未解释事件。
- 权限安全：无有效 Permit 时工具派发次数恒为零。
- 资源有界：任意输入下命令数、上下文大小和 Child 数不超过硬上限。
- 取消收敛：取消后有限时间内无活动外部动作和 Child Run。

## 13. 非功能规格

### 13.1 性能与容量

| 指标 | 目标值 | 硬上限 | 测量点 | 超限行为 |
|---|---:|---:|---|---|
| 单次 `advance` CPU 时间 | 待填写 | 待填写 | Core 入口/出口 | 失败或告警待定 |
| 单次推进内存增量 | 待填写 | 待填写 | Host 进程 | 拒绝/降级待定 |
| 最大并发 Run | 待填写 | 待填写 | ResourceManager | 有界排队 |
| 最大队列深度 | 待填写 | 待填写 | Poller/Scheduler | 稳定拒绝 |
| 最大 Context token/bytes | 待填写 | 待填写 | Context Port | 裁剪或失败 |
| 最大模型流缓冲 | 待填写 | 待填写 | Parser | 背压或中止 |
| 最大 ReAct 步数 | 待填写 | 待填写 | FlowEngine Core | 安全终止 |
| 最大 Child Run 数/深度 | 待填写 | 待填写 | ChildRun Port | 拒绝创建 |

### 13.2 可用性与恢复

- 定义本地单 Host 档案和多 Worker 档案各自的恢复目标。
- 明确可安全自动重试、必须重算、必须人工介入三类故障。
- FlowEngine 重启不得依赖进程内状态恢复 Run。
- 所有临时资源必须在完成、失败、取消和超时路径释放。

### 13.3 兼容性

- 定义 `AdvanceInput`、`RuntimeEvent`、`EngineCommand` 的版本策略。
- 未知必需字段或未知命令类型必须拒绝，不得静默忽略。
- Provider、PDP、工具和存储差异只能由边界 Adapter 吸收。

## 14. 可观测性规格

### 14.1 结构化事件

| 事件 | 触发点 | 必需字段 | 禁止字段 |
|---|---|---|---|
| `flow.advance.started` | Core 调用前 | runRef、attemptRef、sequence、version、trace | Prompt/工具参数正文 |
| `flow.advance.decided` | Core 返回后 | decision type、digest、duration | 完整 Context |
| `flow.commit.conflicted` | CAS 冲突 | expected/actual version、retry count | 聚合正文 |
| `flow.permission.blocked` | Deny/Ask/Unavailable | proposalRef、reason code | 策略正文、身份明文 |
| `flow.tool.effect_unknown` | 工具状态不确定 | toolCallRef、provider class | Secret、参数正文 |
| `flow.run.suspended` | 安全挂起 | reasonRef、resume condition | 敏感载荷 |

### 14.2 指标

- `flow_advance_duration_seconds`
- `flow_advance_total{decision}`
- `flow_commit_conflict_total`
- `flow_event_duplicate_total`
- `flow_permission_result_total{result}`
- `flow_tool_effect_unknown_total`
- `flow_queue_depth`
- `flow_active_runs`
- `flow_suspended_runs{reason}`
- `flow_context_size_bytes`

### 14.3 告警候选

| 告警 | 条件 | 严重级别 | 自动动作 | 人工动作 |
|---|---|---|---|---|
| 未知工具副作用 | 任一非幂等 ToolCall 为 UNKNOWN | 高 | 安全挂起 | 核对外部系统 |
| 权限旁路迹象 | 无 Permit 的派发尝试 > 0 | 严重 | 阻断执行 | 安全事件响应 |
| CAS 冲突异常升高 | 比例超过阈值 | 中 | 限流待定 | 检查并发与热点 |
| 推进延迟异常 | P99 超阈值 | 中 | 背压待定 | 定位阶段耗时 |
| 队列接近上限 | 深度超过阈值 | 中 | 拒绝低级请求待定 | 扩容/降载 |

## 15. 配置规格

| 配置项 | 类型 | 默认值 | 合法范围 | 热更新 | 失败行为 |
|---|---|---|---|---:|---|
| `maxConcurrentRuns` | integer | 待填写 | 待填写 | 否/待定 | 启动失败 |
| `maxQueueDepth` | integer | 待填写 | 待填写 | 否/待定 | 启动失败 |
| `maxReactSteps` | integer | 待填写 | 待填写 | 是/待定 | 使用最后有效值 |
| `maxContextBytes` | integer | 待填写 | 待填写 | 是/待定 | 拒绝超限请求 |
| `modelCallTimeout` | duration | 待填写 | 待填写 | 是/待定 | 调用失败 |
| `toolCallTimeout` | duration | 待填写 | 待填写 | 是/待定 | 按副作用分类处理 |
| `commitRetryLimit` | integer | 待填写 | 待填写 | 是/待定 | 安全挂起/失败 |
| `telemetryBufferSize` | integer | 待填写 | 待填写 | 是/待定 | 丢弃非关键遥测 |

配置必须有类型、范围和启动时校验；安全关键配置缺失或非法时不得以宽松默认值启动。

## 16. 部署与运行档案

### 16.1 Local-first 最小档案

```text
一个 KernelHost 进程
  + 一个 FlowEngine Core 实例
  + 一个有界任务队列
  + 若干异步执行槽
  + 本地状态 Adapter
  + 外部或本地模型/工具 Adapter
```

### 16.2 扩展档案待设计项

- 多 Worker 时的 Lease/Fence 与旧 Worker 写入隔离；
- Event Bus 位点、重新平衡与重复投递语义；
- 跨进程模型流与背压；
- PDP、Tool Provider 和状态存储的独立故障域；
- 扩展档案不得改变 FlowEngine Core 的输入输出语义。

## 17. 实现约束与依赖规则

- Core 只能依赖领域值对象和 Port 抽象。
- Core 不导入数据库、消息总线、HTTP、模型 SDK、OPA、MCP 或沙箱实现。
- Parser 的 Provider 私有逻辑必须留在 Adapter 一侧。
- 所有外部写操作都必须经过显式 Port、幂等和权限检查。
- 同层组件不得通过共享可变对象交换 Run/Session 状态。
- 具体 Adapter 只在 Composition Root 装配。
- 不允许 FlowEngine Runtime Boundary 成为跨聚合大事务边界。

## 18. 设计评审门禁

### 18.1 阶段一：职责与边界

- [ ] FlowEngine Runtime Boundary 与 FlowEngine Core 已明确区分。
- [ ] 每个组件只有一个权威职责和数据所有者。
- [ ] 业务 Workflow、身份、权限策略和物理副作用没有进入 Core。
- [ ] 同层和层间依赖方向无循环、无旁路。

### 18.2 阶段二：接口与规格

- [ ] 所有层内/层间接口有调用方、实现方、DTO、错误和版本策略。
- [ ] 幂等、CAS、Deadline、取消和背压语义闭合。
- [ ] 稳定错误码与可重试分类完整。

### 18.3 阶段三：生命周期与韧性

- [ ] 正常、挂起、恢复、取消、超时和崩溃轨迹闭合。
- [ ] 未知副作用没有自动重试路径。
- [ ] 重启不依赖 FlowEngine 进程内状态。

### 18.4 阶段四：安全与 SFMEA

- [ ] 无 Permit 工具派发路径为零。
- [ ] PDP 故障默认失败关闭。
- [ ] 高严重度 SFMEA 项均有预防控制和自动化用例。
- [ ] 日志、Trace、指标和诊断包通过敏感数据检查。

### 18.5 阶段五：测试与实现授权

- [ ] 测试用例覆盖正常流、异常流、压力、混沌和安全场景。
- [ ] 性能与容量阈值已量化。
- [ ] 所有待确认决策已关闭或明确延期。
- [ ] 架构评审明确批准后，才拆分代码实现任务。

## 19. 待决问题

| ID | 问题 | 可选方案 | 影响 | Owner | 截止条件 |
|---|---|---|---|---|---|
| `FE-Q-001` | “FlowEngine”是否指 Core 还是整个运行边界 | 单名词 / 双层命名 | 包边界、职责、测试 | 待定 | 详细设计评审前 |
| `FE-Q-002` | Poller 与 Scheduler 的责任分界 | Poller 只消费 / 同时选择任务 | 重试、背压、公平性 | 待定 | 接口冻结前 |
| `FE-Q-003` | Context Assembler 是本层组件还是 Context Port Client | 内嵌 / 外部服务 | 数据所有权、性能 | 待定 | 类图冻结前 |
| `FE-Q-004` | Parser 的规范化边界 | Flow 层 / Adapter 层 | Provider 泄漏风险 | 待定 | 类图冻结前 |
| `FE-Q-005` | 状态读取是否需要显式短租约 | 纯 CAS / Lease + CAS | 多 Worker 正确性 | 待定 | 部署档案评审前 |
| `FE-Q-006` | 模型调用幂等性如何定义 | 不重试 / Provider key / checkpoint | 成本与重复输出 | 待定 | 异常流程评审前 |

## 20. 附录模板

### 20.1 接口详细定义

```text
接口 ID：
接口名称：
责任边界：
调用方：
实现方：
请求：
响应：
不变量：
幂等与并发：
超时与取消：
错误码：
可观测性：
安全分类：
兼容策略：
```

### 20.2 时序图占位

后续至少补充：

- 纯文本完成；
- ToolCall Allow；
- ToolCall Ask/Resume；
- ToolCall Deny；
- CAS 冲突；
- 模型流中断；
- 工具未知副作用；
- 取消与 Child Run 级联；
- Host 崩溃恢复。

### 20.3 术语表

| 术语 | 本文定义 | 禁止混用概念 |
|---|---|---|
| FlowEngine Runtime Boundary | 进程内组件协作范围 | 单一领域对象或事务 |
| FlowEngine Core | 无状态推进算法 | Scheduler、Repository、Tool Runtime |
| RuntimeEvent | 已规范化的推进输入事件 | Provider 原生事件 |
| EngineCommand | 推进算法输出的动作意图 | 已发生的物理副作用 |
| ActionProposal | 等待权限判断的动作候选 | ExecutionPermit |
| Observation | 工具结果的规范化事实 | Provider 原生响应 |
| Snapshot | 带版本的不可变读取视图 | 共享可变 Session 对象 |
