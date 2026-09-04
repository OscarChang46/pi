# Agent Kernel System SFMEA 与系统测试用例清单

> 状态：评审候选
> 日期：2026-09-04
> 架构基线：`ACR-2026-0008` / `AKB-2026-09-03-09` 候选
> 依赖：[主设计](agent-kernel-design.md)、[C4 边界协议](c4-boundary-protocols.md)
> 约束：本文只定义风险与测试，不修改实现、Schema、数据库或评审步骤状态。

## 1. 目的与范围

本文使用 Software Failure Mode and Effects Analysis（SFMEA）识别 Agent Kernel System 的系统性失效，并给出常规、异常、安全、韧性和可观测性测试用例。测试对象不是单个函数，而是以下模块协作形成的系统行为：

- L1 Control Plane：Gateway、RunRegistry、RunScheduler、Session、Action Coordinator/PEP；
- L2 Cognitive Runtime：AgentRuntime、Agent Loop、Context、Model Adapter；
- Security Plane：PermissionSystem/PDP、PermissionRequest、ExecutionPermit；
- L3/L4：ToolRuntime、Tool Provider、Sandbox；
- Memory、Subagent、Multi-agent；
- Event Journal、本地提交后分发、事件补拉和投影；
- Operations Plane：结构化日志、Trace、指标、健康、安全审计和诊断包；
- Infrastructure Plane：Storage、Transport、Artifact、Secret、Clock、Process；
- `BND-*` 层间协议及故障语义。

## 2. SFMEA 评分规则

### 2.1 评分

| 维度 | 1–3 | 4–6 | 7–8 | 9–10 |
|---|---|---|---|---|
| 严重度 S | 无用户影响或自动恢复 | 单 Run 失败、可重试 | 多 Run/数据一致性/可用性受损 | 越权、敏感数据泄漏、不可逆副作用或系统性错误 |
| 发生度 O | 极少且需多重条件 | 偶发 | 在负载、断网或重启下容易出现 | 常规运行即可频繁发生 |
| 探测度 D | 现有门禁必然发现 | 指标或告警通常发现 | 需要专项查询或故障注入 | 难以观测，可能长期静默存在 |

`RPN = S × O × D`。行动优先级不只由 RPN 决定：满足以下任一条件直接为 `H`：

- `S ≥ 9`；
- 权限失败开放、Permit 重放、沙箱旁路、Secret/Prompt/Memory 泄漏；
- 跨作用域访问、重复外部副作用、旧 Lease 覆盖新状态；
- 孤儿 Child Run 或无法终止的执行。

其他情况：`RPN ≥ 160` 为 `H`，`80–159` 为 `M`，低于 `80` 为 `L`。所有 `H` 项必须在进入代码迁移前拥有自动化系统测试或明确的阻断性验证方案。

## 3. SFMEA 分析

| SFMEA ID | 子模块/功能 | 失效模式 | 系统影响 | 主要原因 | 现有/要求控制 | S | O | D | RPN | AP | 关联用例 |
|---|---|---|---|---|---|---:|---:|---:|---:|:---:|---|
| `FM-SCH-001` | Scheduler 幂等受理 | 相同命令创建多个 Run | 重复计算或重复外部动作 | 重试时 commandId/idempotencyKey 丢失 | CommandReceipt + payload digest | 8 | 5 | 4 | 160 | H | `ST-SCH-002` |
| `FM-SCH-002` | Runtime 派发 | 同一 Run 在本机被重复派发 | 双执行、事件竞争、重复副作用 | 重启扫描与活动执行状态不一致 | 单 Scheduler 执行登记；恢复前确认 Attempt 状态 | 10 | 3 | 5 | 150 | H | `ST-SCH-004`、`ST-SCH-005` |
| `FM-SCH-003` | Queue/优先级 | 低优先级 Run 永久饥饿 | SLA 失效、资源占用 | 无老化策略或租额失衡 | 有界队列、公平调度、等待时长指标 | 7 | 5 | 6 | 210 | H | `ST-SCH-007` |
| `FM-SCH-004` | Deadline | 下游重新开始计时 | Run 超过端到端时限仍继续执行 | 未传播绝对 UTC Deadline | RequestMetadata.deadlineUtc 只可缩短 | 8 | 5 | 5 | 200 | H | `ST-SCH-008`、`ST-TIM-001` |
| `FM-RUN-001` | Agent Loop | 模型持续循环且预算不收敛 | 成本失控、Worker 耗尽 | Token/Step/时间预算未执行 | 多维预算 + 强制终止 | 8 | 5 | 3 | 120 | M | `ST-RUN-003` |
| `FM-RUN-002` | Runtime 崩溃 | 崩溃后错误重放未知副作用 | 重复发信、写库或执行命令 | 将连接断开误判为未执行 | Unknown side effect 失败关闭 | 10 | 4 | 7 | 280 | H | `ST-RUN-005`、`ST-TOL-008` |
| `FM-RUN-003` | 取消 | 取消后仍启动新模型/工具/Child | 用户失去控制，副作用继续扩大 | 取消仅更新 Run 状态未传播 | 取消树、Abort、执行前再检查 | 9 | 5 | 5 | 225 | H | `ST-RUN-006`、`ST-MAG-006` |
| `FM-PRO-001` | L1↔L2 本地调用/JSONL | 子进程断线被解释为 Attempt 未执行并立即重派 | 重复执行或重复副作用 | 未查询 Attempt/ToolCall 状态 | 通道状态与领域状态分离 | 9 | 4 | 6 | 216 | H | `ST-PRO-003` |
| `FM-PRO-002` | Runtime 事件 | 事件丢失、重复或乱序污染 Run 投影 | UI/调度状态错误 | Ack 早于持久化、无 sequence 去重 | 先持久化后 Ack；Run 内严格序号 | 8 | 6 | 4 | 192 | H | `ST-EVT-003`、`ST-EVT-004` |
| `FM-PRO-003` | 协议版本 | 不兼容客户端仍继续通信 | 字段误读或安全约束丢失 | 缺少初始化协商 | 主版本协商、未知必填语义拒绝 | 8 | 3 | 3 | 72 | M | `ST-PRO-001` |
| `FM-PRO-004` | 协议外观层 | 不同 Transport 产生不同领域结果，或 Facade 承载调度/权限逻辑 | 客户端行为漂移、边界被旁路 | Adapter 各自实现语义或 Facade 过厚 | 单一 AgentKernelProtocolV1、机械映射、跨 Adapter 黑盒契约测试 | 8 | 4 | 5 | 160 | H | `ST-PRO-005`、`ST-PRO-006` |
| `FM-SEC-001` | PDP 可用性 | PDP 超时后 PEP 默认放行 | 未授权工具或资源访问 | 错误降级策略 | Fail closed + 稳定错误 | 10 | 3 | 3 | 90 | H | `ST-SEC-004` |
| `FM-SEC-002` | ExecutionPermit | Permit 被重复消费或跨 ToolCall 使用 | 权限重放和越权 | 非原子消费或绑定字段不完整 | ActionDigest/Run/Agent/epoch 绑定 + CAS | 10 | 4 | 5 | 200 | H | `ST-SEC-005`、`ST-SEC-006` |
| `FM-SEC-003` | 人工审批 | ApprovalDecision 扩大原 ActionProposal | 审批成为扩权入口 | 未对决定做子集校验 | 只能批准或缩小；重新生成 Permit | 10 | 3 | 6 | 180 | H | `ST-SEC-008` |
| `FM-SEC-004` | TOCTOU | 授权后策略撤销但动作仍执行 | 使用过期权限 | 执行点不检查 epoch/expiry | Provider 前消费 Permit 并复核 | 10 | 4 | 6 | 240 | H | `ST-SEC-007` |
| `FM-TOL-001` | ToolRuntime | Candidate 绕过 L1/PEP 直达 Provider | 全部权限控制失效 | 暴露错误接口或依赖旁路 | L1→L3 唯一入口；Provider 只收 AuthorizedRequest | 10 | 3 | 4 | 120 | H | `ST-TOL-003` |
| `FM-TOL-002` | 外部副作用 | 超时后盲重试产生重复动作 | 重复发信、重复写入 | 误认为 timeout=not executed | operation key + 状态查询 + UNKNOWN_SIDE_EFFECT | 10 | 5 | 7 | 350 | H | `ST-TOL-007`、`ST-TOL-008` |
| `FM-TOL-003` | 工具输出 | 无限输出耗尽内存或污染上下文 | OOM、延迟扩散、Prompt 膨胀 | 无流窗口和 Artifact 转存 | 最大输出、截断、ArtifactReference | 8 | 6 | 3 | 144 | M | `ST-TOL-009` |
| `FM-SBX-001` | Sandbox | 沙箱请求权限超过 Permit | 宿主文件/网络/Secret 越权 | SandboxProfile 合并错误 | SandboxRequest 必须是 Permit 子集 | 10 | 3 | 5 | 150 | H | `ST-SBX-003` |
| `FM-SBX-002` | 本地 JSONL | 超大帧、协议 stdout 污染或半帧导致失控 | 解析阻塞、内存耗尽或消息错配 | 无帧上限/分帧状态机 | 初始化协商、有界帧、stdout 纯净 | 8 | 5 | 3 | 120 | M | `ST-SBX-005`、`ST-SBX-006` |
| `FM-CTX-001` | Context | 超预算内容未裁剪 | 模型失败、延迟和成本失控 | Token 估算偏差或无硬上限 | Context budget、ReductionTrace | 7 | 6 | 3 | 126 | M | `ST-CTX-003` |
| `FM-CTX-002` | Context | 摘要丢失安全约束或工具结果因果链 | 模型基于错误上下文行动 | 摘要器覆盖系统约束 | 不可裁剪项 + 来源和 reduction trace | 9 | 3 | 7 | 189 | H | `ST-CTX-004` |
| `FM-MEM-001` | Memory | 未授权读取其他 Agent 的 MemorySpace | 敏感数据泄漏 | Grant/Scope 校验缺失 | MemoryView 授权过滤 + Permission | 10 | 3 | 6 | 180 | H | `ST-MEM-003` |
| `FM-MEM-002` | Memory | Agent 直接覆盖共享记忆 | 长期污染且难以追踪 | 绕过 Candidate 审核和版本链 | Candidate + append-only + supersedes | 9 | 4 | 6 | 216 | H | `ST-MEM-005` |
| `FM-MAG-001` | Subagent | Parent 终态后 Child 仍运行 | 孤儿任务、成本和权限失控 | Join/Cancel/移交未闭合 | ExecutionScope 结构化并发 | 9 | 4 | 4 | 144 | H | `ST-MAG-004`、`ST-MAG-006` |
| `FM-MAG-002` | 权限/预算继承 | Child 获得高于 Parent 的权限或预算 | 权限升级、成本突破 | 合并采用覆盖而非交集 | Parent∩Role∩Policy∩System | 10 | 4 | 4 | 160 | H | `ST-MAG-003` |
| `FM-SES-001` | Session/进程 | 每个 Session 常驻一个进程或协程 | 空闲会话耗尽内存、FD 和调度资源 | 把逻辑档案等同执行实体 | Session 可卸载；只有活动 Attempt 获得执行槽 | 8 | 6 | 3 | 144 | H | `ST-SES-001`、`ST-SES-002` |
| `FM-RES-001` | ResourceManager | 队列或执行槽无界增长 | OOM、响应雪崩 | 缺少容量上限和背压 | 有界 FIFO、Semaphore、deadline 和稳定拒绝 | 9 | 5 | 3 | 135 | H | `ST-RES-001`、`ST-RES-002` |
| `FM-ARC-001` | Multi-agent 边界 | Kernel 引入 Team/Participant/Role 状态 | 业务编排与 Kernel 职责耦合 | 把上层组队映射成内核聚合 | 架构门禁禁止 Multi-agent 领域类型 | 7 | 3 | 2 | 42 | M | `ST-ARC-001` |
| `FM-DAT-001` | Run/Event 事务 | 发布事件但状态未提交，或提交后本地投影未推进 | 投影与权威状态分裂 | Journal 与状态未同事务或分发顺序错误 | 状态+Event Journal 本地事务；投影按序补拉 | 8 | 5 | 4 | 160 | H | `ST-EVT-005`、`ST-EVT-006` |
| `FM-DAT-002` | 本机恢复 | 旧异步回调在新 Attempt 后继续写入 | 新状态被旧执行覆盖 | Attempt/version 未进入写路径 | 每次写入校验 attemptId + aggregateVersion | 10 | 3 | 5 | 150 | H | `ST-SCH-005` |
| `FM-LOG-001` | 日志/Trace | Prompt、Secret、工具参数、Memory 或物理路径泄漏 | 合规与安全事故 | 直接序列化 DTO/Exception | 字段 allowlist、脱敏扫描、禁止正文标签 | 10 | 5 | 7 | 350 | H | `ST-OBS-004`、`ST-OBS-005` |
| `FM-LOG-002` | Telemetry | 本地日志/可选 Exporter 故障阻塞 AgentRun | 级联不可用 | 同步写入、磁盘满或无有界缓冲 | 有界队列、滚动文件、降级和丢弃计数 | 7 | 5 | 3 | 105 | M | `ST-OBS-006` |
| `FM-LOG-003` | 指标 | runId/user/tool 参数作为 Label 导致高基数 | 监控平台过载、成本增长 | 动态值直接进入标签 | Label allowlist + cardinality gate | 7 | 6 | 5 | 210 | H | `ST-OBS-007` |
| `FM-LOG-004` | Trace | 跨 L1/L2/L3/L4 traceparent 丢失 | 故障无法定位、耗时归因错误 | 协议适配漏传 OperationContext | 边界契约强制字段 + 完整性测试 | 6 | 5 | 4 | 120 | M | `ST-OBS-002`、`ST-OBS-003` |
| `FM-HLT-001` | Health | 依赖失效但 readiness 仍为健康 | 流量持续进入故障实例 | liveness/readiness 混淆 | 分层健康贡献与降级状态 | 7 | 4 | 4 | 112 | M | `ST-OBS-009` |
| `FM-INF-001` | Clock | 时钟回拨或时区解释改变 Deadline | Permit/Lease 提前或延后失效 | 直接使用本地时间、DST | ClockPort、UTC TimePoint、单调耗时 | 9 | 4 | 6 | 216 | H | `ST-TIM-001`、`ST-TIM-002` |
| `FM-INF-002` | Secret | Secret 明文进入领域对象或 Artifact | 长期敏感信息泄漏 | Adapter 返回可序列化明文 | SecretHandle、短时 Lease、零化与日志扫描 | 10 | 3 | 7 | 210 | H | `ST-INF-004` |
| `FM-INF-003` | Storage/Event Dispatcher | SQLite 已提交但进程在本地通知前崩溃 | UI 投影暂时陈旧 | 把瞬时通知误当权威事件 | 重启后从 Event Journal 补拉；Lag 指标 | 7 | 4 | 3 | 84 | M | `ST-EVT-006`、`ST-INF-006` |

## 4. 系统测试环境

### 4.1 最小拓扑

| 组件 | 配置 |
|---|---|
| L1 Control | 单进程、单 Scheduler、本地有界队列和 SQLite Run Store |
| L2 Runtime | 默认进程内 Runtime；附加一个可注入延迟、崩溃和畸形帧的 JSONL 子进程档案 |
| Security Plane | Fake PDP + 审批模拟器；支持 Allow/Ask/Deny、撤销和超时 |
| L3 ToolRuntime | 一个真实状态协调实例；Provider 使用确定性 Fake 和副作用模拟器 |
| L4 Sandbox | 进程内只读 Adapter + JSONL 子进程档案 |
| Memory | 独立 MemorySpace Store；至少两个隔离的 Agent/Team Scope |
| Model | Pi Faux Provider；支持流式、Malformed Chunk、限流、断流和超时 |
| Data | 单个本地 SQLite 中的 Run/Event/Tool/Permission Store + 本地 Event Dispatcher |
| Operations | 本地滚动结构化日志、Trace/指标快照和 SQLite 审计；可选 Fake Exporter |
| Fault Injection | 可控 Clock、进程终止器、磁盘/SQLite 错误和 JSONL 故障注入 |

测试环境只使用测试 Secret 和合成 Prompt。日志泄漏测试仍注入唯一 Canary Token，以证明脱敏机制有效。

### 4.2 必须采集的证据

- Run、Attempt、ToolCall、PermissionRequest、Permit、Child Run 和 MemoryVersion 的权威快照；启用多 Worker 档案时再采集 Lease；
- Event Journal 原始序号、本地分发进度和消费者投影；
- 完整 Trace 树和关键 Span duration；
- 结构化日志、安全审计事件和 Canary 扫描结果；
- 队列深度、调度等待、Runtime/模型/工具耗时、取消延迟和丢弃遥测计数；
- 进程、沙箱、文件句柄和网络连接的资源清理结果。

## 5. 常规系统用例

| 用例 ID | 场景 | 关键步骤 | 预期结果 | 主要证据 |
|---|---|---|---|---|
| `ST-E2E-001` | 无工具单 Run 成功 | 提交 Run → 调度 → 模型流式回答 → 完成 | 单 Run、单 Attempt、事件严格递增、最终结果可查询 | Run Snapshot、Trace、Event Journal |
| `ST-E2E-002` | 连续多轮 AgentSession | 连续提交两个关联 Run | 第二个 Run 获得冻结 ContextFrame；Session 不拥有 Run 状态且不常驻进程 | ContextSnapshot、Run refs、process count |
| `ST-E2E-003` | 只读工具 Allow | 模型提出工具 → L1/PEP → L3 → Sandbox → 回流 L2 | Permit 一次消费；ToolResultRef 恢复原 Attempt | ToolCall、Permit、跨层 Trace |
| `ST-E2E-004` | 工具 Ask/审批恢复 | PDP 返回 Ask → 外部批准 → 工具执行 → Runtime 恢复 | 无同步线程等待；决定不扩大 Proposal | PermissionRequest、审批事件、ResumeAttempt |
| `ST-E2E-005` | 工具 Deny | PDP 返回 Deny | Provider/Sandbox 调用为零；Loop 收到有界拒绝结果 | Audit、Provider call count |
| `ST-E2E-006` | 长期记忆读取 | Context 请求授权 MemoryView | 仅授权条目进入 ContextFrame，来源可追踪 | MemoryView、ReductionTrace |
| `ST-E2E-007` | MemoryCandidate 提交 | Agent 产生候选 → 审核 → append MemoryEntry | 不直接覆盖；形成版本链和 supersedes | Candidate/MemoryVersion |
| `ST-E2E-008` | 单层 Child Run | Parent 委派 → Scheduler 创建 Child → Join → 摘要返回 | Child Scope/预算为父级子集，无孤儿 | ExecutionScope、ParentChildLink |
| `ST-E2E-009` | 上层 Multi-agent 组合 | 业务编排创建多个普通 Run/Session 并汇总结果 | Kernel 只观察独立 Run/Session；不存在 Team/Participant/Role 聚合 | Run/Session events、architecture gate |
| `ST-E2E-010` | SSE 断线补拉 | 订阅中断 → Run 继续 → Last-Event-ID 重连 | 无事件永久丢失；重复事件可去重 | SSE capture、Event Journal |
| `ST-E2E-011` | 优雅关闭 | 有活动 Run 时发出 shutdown | 停止接收新任务，活动任务在期限内完成或安全中断 | Shutdown spans、Run states |

## 6. 调度、Runtime 与协议异常用例

| 用例 ID | 注入/场景 | 预期结果 | 关联 SFMEA |
|---|---|---|---|
| `ST-SCH-001` | 并发提交不同 Run | 队列顺序、并发上限和资源桶符合策略 | 基础调度 |
| `ST-SCH-002` | 相同 idempotencyKey 重传；随后使用同键异载荷 | 同载荷返回同 Run；异载荷返回稳定冲突 | `FM-SCH-001` |
| `ST-SCH-003` | 队列达到容量上限 | 新请求明确拒绝或延迟受理；内存不持续增长 | 资源边界 |
| `ST-SCH-004` | 本地队列重复出现同一 Run | Scheduler 只登记和执行一次 | `FM-SCH-002` |
| `ST-SCH-005` | Runtime 崩溃后恢复；旧异步回调随后到达 | 旧 attemptId/version 写入被拒绝 | `FM-SCH-002`、`FM-DAT-002` |
| `ST-SCH-006` | Runtime capacity=0 后恢复 | Run 保持排队且不丢失；恢复后正常派发 | 调度韧性 |
| `ST-SCH-007` | 持续注入高优先级任务 | 低优先级任务在老化阈值内获得执行机会 | `FM-SCH-003` |
| `ST-SCH-008` | 下游调用接近 Deadline | 下游只继承剩余预算；到期阻止新动作 | `FM-SCH-004` |
| `ST-RUN-001` | 模型正常多 Step 循环 | Step 序号单调，终态不可逆 | Agent Loop |
| `ST-RUN-002` | 模型返回格式错误后可纠正 | 在纠错预算内恢复；记录 Parser 失败次数 | Parser 韧性 |
| `ST-RUN-003` | 模型不断请求继续推理 | Step/Token/成本/时间任一上限触发终止 | `FM-RUN-001` |
| `ST-RUN-004` | 模型流中途断开且无工具副作用 | 按策略有限重试或安全失败 | Runtime 韧性 |
| `ST-RUN-005` | Tool Provider 已执行但 Runtime 随即崩溃 | 不盲目重放；查询 ToolCall/operation 状态 | `FM-RUN-002` |
| `ST-RUN-006` | 模型调用、工具调用和 Child Run 各阶段取消 | 不再启动新动作；取消传播且终态一致 | `FM-RUN-003` |
| `ST-PRO-001` | JSONL 主版本不兼容 | initialize 立即拒绝，不降级猜测 | `FM-PRO-003` |
| `ST-PRO-002` | 超大 JSONL 帧 | 在解析前或边界处拒绝，内存稳定 | 协议资源边界 |
| `ST-PRO-003` | L1↔L2 子进程断开后快速恢复 | 不依据断线直接重派；先确认 Attempt/ToolCall 状态 | `FM-PRO-001` |
| `ST-PRO-004` | JSONL 事件消费者停读 | 未确认事件达到上限后背压或终止通道，内存有界 | 协议背压 |
| `ST-PRO-005` | 相同命令分别通过 In-process 与 JSONL Adapter 调用 | Run 标识、稳定错误码和持久事件序列语义一致 | `FM-PRO-004` |
| `ST-PRO-006` | 静态依赖与运行期 Spy 尝试让 Transport/Facade 直接访问 Repository、Runtime、PDP 或 Provider | 架构门禁失败或调用被拒绝；唯一入口为 AgentSystemGateway | `FM-PRO-004` |

## 7. 权限、工具与沙箱异常用例

| 用例 ID | 注入/场景 | 预期结果 | 关联 SFMEA |
|---|---|---|---|
| `ST-SEC-001` | Allow 正常签发和消费 | Permit 与 Run/Agent/ActionDigest/epoch/expiry 全绑定 | 权限主路径 |
| `ST-SEC-002` | Ask 后批准、拒绝、到期三条分支 | 三条路径终态明确，无无限等待 | 审批生命周期 |
| `ST-SEC-003` | 未知工具、资源或策略版本 | 默认 Deny，不泄露资源是否存在 | 默认拒绝 |
| `ST-SEC-004` | PDP 超时、崩溃或返回不可解析响应 | PEP 失败关闭，Provider 调用为零 | `FM-SEC-001` |
| `ST-SEC-005` | 同一 Permit 并发消费两次 | 仅一次成功；另一次返回已消费 | `FM-SEC-002` |
| `ST-SEC-006` | 替换 ToolCall、参数摘要、Run 或 Agent 后重放 Permit | 全部拒绝并产生审计事件 | `FM-SEC-002` |
| `ST-SEC-007` | 授权后撤销策略 epoch，再尝试执行 | 消费或执行前再校验失败 | `FM-SEC-004` |
| `ST-SEC-008` | 审批返回比 Proposal 更宽的资源范围 | 决定无效，不签发 Permit | `FM-SEC-003` |
| `ST-TOL-001` | Tool Schema 正常/非法输入 | 非法输入在 Provider 前拒绝 | 输入约束 |
| `ST-TOL-002` | L2 提交 Candidate，L1 执行，结果恢复 L2 | 所有动作经过 RuntimeEventPort、L1、ToolRuntimePort | C4 边界主路径 |
| `ST-TOL-003` | 直接调用 Provider、Sandbox 或 L3 私有地址 | 服务身份/网络策略/接口层全部拒绝 | `FM-TOL-001` |
| `ST-TOL-004` | Tool Provider 返回私有 SDK 类型 | Adapter 归一化或拒绝，公共事件无私有类型 | Adapter 边界 |
| `ST-TOL-005` | 工具执行超时且 Provider 明确未执行 | 在同 operation key 下按策略有限重试 | 副作用安全 |
| `ST-TOL-006` | 工具执行超时且 Provider 明确已完成 | 查询并收敛为完成，不再次执行 | 副作用安全 |
| `ST-TOL-007` | 首次响应丢失，调用方重发相同 ToolCall | 返回同一 ToolCall/operation 状态 | `FM-TOL-002` |
| `ST-TOL-008` | Provider 无法确认是否执行 | ToolCall 进入 UNKNOWN_SIDE_EFFECT，禁止自动重放 | `FM-TOL-002`、`FM-RUN-002` |
| `ST-TOL-009` | Provider 无限流式输出 | 达上限后截断/转 Artifact，Runtime 内存稳定 | `FM-TOL-003` |
| `ST-SBX-001` | 只读沙箱正常执行 | 仅声明挂载和出口可见，回收后资源为零 | 沙箱主路径 |
| `ST-SBX-002` | Sandbox 创建失败 | Provider 不在宿主回退执行 | 失败关闭 |
| `ST-SBX-003` | SandboxRequest 比 Permit 多文件/网络/Secret | 创建前拒绝 | `FM-SBX-001` |
| `ST-SBX-004` | 进程尝试越权文件、网络或子进程 | OS/容器策略阻断并记录审计 | 沙箱隔离 |
| `ST-SBX-005` | JSONL stdout 混入普通日志或畸形行 | 协议失败；stderr 保留脱敏诊断 | `FM-SBX-002` |
| `ST-SBX-006` | JSONL 半帧、超长帧或子进程无响应 | 有界超时并销毁子进程，不无限等待 | `FM-SBX-002` |

## 8. Session、Context、Memory、Subagent 与资源用例

| 用例 ID | 注入/场景 | 预期结果 | 关联 SFMEA |
|---|---|---|---|
| `ST-CTX-001` | 多来源 Context 正常组装 | 来源、优先级、选择原因和 Token 估算可追踪 | Context 主路径 |
| `ST-CTX-002` | 不可信内容包含伪系统指令 | 内容保持低信任数据身份，不覆盖系统约束 | Prompt injection 防护 |
| `ST-CTX-003` | 输入超过 Context 预算 | 按政策裁剪/摘要，最终 Frame 不超限 | `FM-CTX-001` |
| `ST-CTX-004` | 摘要压力下保留安全约束和未完成 Tool 因果链 | 不可裁剪项仍存在，ReductionTrace 完整 | `FM-CTX-002` |
| `ST-MEM-001` | 授权 Private/Scope Memory 查询 | 返回最小 MemoryView，不返回存储内部字段 | Memory 主路径 |
| `ST-MEM-002` | Memory Service 不可用 | 按策略无长期记忆降级或明确失败，不使用陈旧未授权缓存 | Memory 韧性 |
| `ST-MEM-003` | Agent A 请求 Agent B Memory | 无 Grant 时拒绝且不泄露存在性 | `FM-MEM-001` |
| `ST-MEM-004` | Grant 在查询过程中被撤销 | 提交 ContextFrame 前重新校验或丢弃结果 | TOCTOU |
| `ST-MEM-005` | Agent 尝试直接覆盖共享 MemoryEntry | 只能创建 Candidate；Repository 直写被阻断 | `FM-MEM-002` |
| `ST-MAG-001` | Parent 创建 Child 并正常 Join | Child 经 Scheduler 创建，结果摘要返回 Parent | Subagent 主路径 |
| `ST-MAG-002` | 达到 maxDepth/maxChildren/maxConcurrency | 新委派明确拒绝，不创建隐藏 Runtime | 结构化并发 |
| `ST-MAG-003` | Child 请求超出 Parent 的工具、Memory、Deadline 或预算 | 取交集或拒绝，绝不扩权 | `FM-MAG-002` |
| `ST-MAG-004` | Parent 尝试成功结束但 Child 活跃 | Parent 必须 Join、Cancel 或受控移交 | `FM-MAG-001` |
| `ST-MAG-005` | Child 自身失败 | 按 DelegationPolicy 收敛，不自动扩大权限重试 | Child 韧性 |
| `ST-MAG-006` | Parent 取消或授权撤销 | 所有 Child 级联取消 | `FM-RUN-003`、`FM-MAG-001` |
| `ST-SES-001` | 创建并挂起 1000 个 Session | 进程数和活动协程数不随 Session 数线性增长 | `FM-SES-001` |
| `ST-SES-002` | 挂起 Run 等待审批 | 释放执行槽；恢复信号到达后重新排队 | `FM-SES-001` |
| `ST-RES-001` | 执行队列达到 maxQueuedRuns | 新请求背压或返回 `RESOURCE_QUEUE_FULL`，内存不继续增长 | `FM-RES-001` |
| `ST-RES-002` | Sandbox 进程达到上限 | 新工具调用有界等待或拒绝，不绕过 Sandbox | `FM-RES-001` |
| `ST-ARC-001` | 扫描 Kernel contracts/domain | `MultiAgentRun`、Participant、团队 Role/仲裁类型数量为零 | `FM-ARC-001` |

## 9. 数据、事件和前后端一致性用例

| 用例 ID | 注入/场景 | 预期结果 | 关联 SFMEA |
|---|---|---|---|
| `ST-EVT-001` | 正常 Run 事件链 | sequence 从 1 严格递增，终态后无非法状态事件 | Event 主路径 |
| `ST-EVT-002` | 相同 eventId 重复投递 | Journal/消费者幂等，投影不重复累计 | 去重 |
| `ST-EVT-003` | 事件乱序到达消费者 | 按 sequence 缓冲有界或补拉，不错误推进投影 | `FM-PRO-002` |
| `ST-EVT-004` | Ack 丢失导致 Runtime 重发 | 已持久化事件被识别并返回 Ack | `FM-PRO-002` |
| `ST-EVT-005` | 状态事务提交前模拟发布 | 门禁证明不可发布未提交事件 | `FM-DAT-001` |
| `ST-EVT-006` | SQLite 已提交后、进程内通知前终止进程 | 重启后投影从 Event Journal 补拉，顺序和 eventId 保持 | `FM-DAT-001`、`FM-INF-003` |
| `ST-EVT-007` | SSE 断线期间 Run 进入终态 | 重连补拉得到完整事件和最终 Snapshot | 前端一致性 |
| `ST-EVT-008` | 前端缓存状态比服务端新/旧 | 服务端 Snapshot/version 为权威，客户端重建投影 | 投影一致性 |
| `ST-EVT-009` | Event Journal 分页边界和最大历史量 | 无遗漏/重复，读取资源有界 | 补拉边界 |

## 10. 日志、Trace、指标与健康用例

| 用例 ID | 场景/注入 | 预期结果 | 关联 SFMEA |
|---|---|---|---|
| `ST-OBS-001` | 正常 Run 全链路观测 | 存在 Gateway、Scheduler、Runtime、Model、Permission、Tool、Sandbox Span | 运维主路径 |
| `ST-OBS-002` | 跨 L1/L2/L3/L4 调用 | traceId 保持，span parent/causation 正确 | `FM-LOG-004` |
| `ST-OBS-003` | RuntimeEvent、本地 Event Dispatcher 和异步审批 | 使用 causation 连接异步阶段 | `FM-LOG-004` |
| `ST-OBS-004` | 注入 Canary Secret、Prompt、工具参数和 Memory | 所有日志、Trace、指标、审计和诊断包扫描结果为零泄漏 | `FM-LOG-001` |
| `ST-OBS-005` | Provider 抛出包含敏感正文的异常 | BoundaryError 只含稳定码和 detailsRef | `FM-LOG-001` |
| `ST-OBS-006` | 日志目录不可写、磁盘达到阈值或可选 Exporter 卡住 | Run 不被无限阻塞；安全降级并记录可见故障 | `FM-LOG-002` |
| `ST-OBS-007` | 创建十万不同 runId/tool 参数 | 指标时间序列数量保持在预算内 | `FM-LOG-003` |
| `ST-OBS-008` | 高并发日志压力 | 日志队列有界，不反压业务；丢弃策略可观测 | 运维背压 |
| `ST-OBS-009` | DB、PDP、RuntimePool 分别故障 | liveness/readiness/degraded 状态符合健康矩阵 | `FM-HLT-001` |
| `ST-OBS-010` | 生成诊断包 | 只包含白名单元数据、配置摘要和脱敏事件 | 诊断安全 |
| `ST-OBS-011` | 权限拒绝、Permit 重放和沙箱越权 | 每个安全动作产生唯一 append-only 审计事件 | 安全审计 |
| `ST-OBS-012` | 耗时分解校验 | 总耗时可分解为排队、模型、权限、工具、沙箱、持久化时间 | 性能可解释性 |

## 11. 基础设施、时间和恢复用例

| 用例 ID | 注入/场景 | 预期结果 | 关联 SFMEA |
|---|---|---|---|
| `ST-TIM-001` | 系统墙钟回拨/前跳 | Lease/超时使用单调耗时；绝对 Deadline 仍按 UTC 判断 | `FM-SCH-004`、`FM-INF-001` |
| `ST-TIM-002` | 切换 IANA 时区和 DST 边界 | 持久化时间不变，仅展示/日历解释变化 | `FM-INF-001` |
| `ST-INF-001` | Run Store 短暂不可用 | 新命令不假装受理；恢复后幂等重试 | Storage 韧性 |
| `ST-INF-002` | 磁盘满/事务提交失败 | 不发布事件、不启动 Runtime | 数据原子性 |
| `ST-INF-003` | Artifact 写入中断 | 不发布可读取引用；临时对象可回收 | Artifact 原子性 |
| `ST-INF-004` | Secret 解析并执行后扫描内存外可见制品 | 日志、事件、Artifact、错误中不存在明文 Secret | `FM-INF-002` |
| `ST-INF-005` | SecretHandle 指向越权作用域 | Scoped Adapter 返回拒绝且不泄露存在性 | Secret 隔离 |
| `ST-INF-006` | 本地 Event Dispatcher 停止消费并重启 | 投影从 Journal 有界补拉；权威状态不受影响 | `FM-INF-003` |
| `ST-INF-007` | Agent Kernel 本机进程终止并重启 | 从 SQLite 恢复 Run；未知执行不被自动重放 | 控制面恢复 |
| `ST-INF-008` | Runtime/Sandbox 强制终止 | 进程、挂载、网络和 Secret Lease 全部回收 | 资源清理 |

## 12. 非功能场景与基线指标

具体数值在容量评审后配置，测试模型先固定指标名称和判定方法：

| 指标 | 判定方式 |
|---|---|
| Run 受理延迟 | `agent.run.accept.duration` 的 P50/P95/P99 |
| 调度等待 | `agent.run.queue.duration` 按优先级分组，不使用 runId 标签 |
| Runtime 派发 | `agent.runtime.dispatch.duration` 与失败率 |
| 模型首 Token/总耗时 | `agent.model.first_token.duration`、`agent.model.duration` |
| 权限判定 | `agent.permission.decision.duration`，按 Allow/Ask/Deny 低基数分组 |
| 工具/沙箱耗时 | `agent.tool.duration`、`agent.sandbox.start.duration` |
| 取消延迟 | cancel accepted 到无活动动作的时长 |
| 事件延迟 | committedAt 到 publishedAt/consumedAt 的 Lag |
| 遥测丢弃 | `agent.observability.dropped` 必须有界且可告警 |
| 资源泄漏 | 每轮测试后 Worker、Sandbox、句柄、连接和临时 Artifact 回到基线 |

性能测试必须同时断言正确性；吞吐达到目标但出现重复副作用、事件丢失、越权或日志泄漏时一律失败。

## 13. 建议执行分层

| 测试套件 | 运行频率 | 内容 |
|---|---|---|
| `system-smoke` | 每个 PR | `ST-E2E-001/003/005/010`、基础日志和 Trace |
| `system-contract` | 每个 PR | BND 协议版本、幂等、错误映射、事件序号和 DTO 脱敏 |
| `system-security` | 每个 PR + 每夜 | Permit、沙箱、Memory、Secret、旁路和 Canary 泄漏 |
| `system-resilience` | 每夜 | 子进程崩溃、SQLite、日志、PDP 和可选 Exporter 故障 |
| `system-concurrency` | 每夜 | 本地队列重复、旧 Attempt 回调、重复事件和 Permit 并发消费 |
| `system-performance` | 每周/发布前 | 延迟、吞吐、背压、指标基数和资源泄漏 |
| `system-chaos` | 发布候选 | 长时间分区、组合故障、恢复和未知副作用 |

## 14. 评审门禁

以下项目在系统测试实现前需要确认：

- [ ] 接受 SFMEA 的 S/O/D 评分、RPN 和高优先级覆盖规则。
- [ ] 接受所有 `H` 风险必须有自动化测试或阻断性验证。
- [ ] 接受 L2 工具动作经 L1 控制后进入 L3，并通过 `resumeAttempt` 回流。
- [ ] 接受系统不宣称端到端 exactly-once，外部副作用未知时失败关闭。
- [ ] 接受运维 Collector 故障不得阻塞 Run，但遥测丢弃必须有界且可见。
- [ ] 接受 Canary 扫描覆盖日志、Trace、指标、审计、错误和诊断包。
- [ ] 接受首版测试环境为单 Kernel、单 Scheduler、进程内 Runtime，并附加 JSONL 子进程故障档案。
- [ ] 接受 gRPC、Temporal、Event Bus、MicroVM/Vsock 和跨主机 mTLS 不属于首版发布门禁。

评审通过后，下一轮再为每个用例补齐 Given/When/Then、测试数据、故障注入脚本、超时阈值、自动化层级和 CI 分组；本轮不编写测试实现。
