> 历史归档，2026-09-08从docs/runtime移出。正文保留当时讨论，不代表当前实现、有效设计或批准；后继来源与迁移原因见[归档索引](../../README.md)。

# 工具调用、远程 Provider 与生产 Sandbox 草稿

> DRAFT · 待用户评审 · 2026-09-06
>
> 本文是非规范性提案，不批准现行 candidate 设计，不冻结完整 DTO 或接口签名。
> 默认 local-first、单 Host；只设计上层模块，不实现工具业务能力，不选择商业供应商。

## 问题与当前事实

远程工具已经写入数据，但响应在网络中丢失，不能把“客户端超时”当成“没有执行”。
需要由 ToolCall 保存权威执行状态，先查询证据，再决定是否能收敛；不能自动换 Provider 重做。
本地任务即使已创建取消信号，也不能据此宣称具备操作系统隔离或强制终止能力。

| 已核对事实 | 证据 | 尚缺能力 |
|---|---|---|
| 工具目录在内存初始化，execute 直接返回结果 | [ToolRuntime](../../../../../../src/tools/tool-runtime.ts) | ToolCall 耐久聚合、版本化冻结路由 |
| ToolExecutor 查本地 Provider 并 create/execute/finally terminate | [ToolExecutor](../../../../../../src/execution/tool-executor.ts) | 独立远程执行路径、可查询执行记录 |
| 当前 Sandbox 明确没有 OS 隔离、网络、Secret、写入与强制终止 | [只读 Sandbox](../../../../../../src/execution/adapters/in-process-read-only-sandbox.ts) | 生产隔离能力与残留清理 |
| 框架尚无 UNKNOWN_SIDE_EFFECT 恢复协议 | [框架映射](../../framework-boundaries.md) | 不确定结果与恢复操作边界 |

设计依据：[BND-L13-001](../../../../../design/contracts/bnd-l13-001.md)、[BND-L34-001](../../../../../design/contracts/bnd-l34-001.md)、[BND-INF-001](../../../../../design/contracts/bnd-inf-001.md)。
组件依据：[ToolCall](../../../../../design/layers/l3-tool-runtime/components/tool-call-runtime.md)、[目录与路由](../../../../../design/layers/l3-tool-runtime/components/tool-catalog-router.md)、[Guard](../../../../../design/layers/l3-tool-runtime/components/tool-execution-guard.md)、[Provider](../../../../../design/layers/l4-execution-runtime/components/tool-provider-adapter.md)、[Sandbox](../../../../../design/layers/l4-execution-runtime/components/sandbox-runtime.md)。

## 职责与数据所有权

| 组件 | 权威状态 / 行为 | 排除职责 |
|---|---|---|
| control | 候选冻结、请求安全判定、Run 恢复 | 直接执行 Provider、替 ToolCall 推断成功 |
| ToolCatalogRouter | 版本化目录投影、不可变路由快照 | 本次动作授权、运行中热切路由 |
| ToolCallRuntime | ToolCall 聚合、派发意图、结果、恢复与去重 | Provider 私有协议、业务补偿 |
| ToolExecutionGuard | 绑定校验和 Permit 原子消费 | PDP 规则、授权重签发 |
| ToolProvider Adapter | 单次远程传输及状态查询归一化 | ToolCall/Run/Permit 仓储 |
| Sandbox Runtime | 单次受限环境、进程树、输出采集和清理 | 业务工作流、权限判定 |
| Infrastructure | 资源句柄、传输、Secret 解析、Artifact 机制 | ToolCall 状态机和重试决策 |

ToolCall 记录稳定调用标识、动作摘要、Run/Attempt 引用、路由版本、Permit 引用、派发证据及结果引用。
Provider operation key 在本地创建 ToolCall 时生成并耐久保存；相同调用不能在重启后换 key。
本地去重以可信作用域和稳定 ToolCall 标识为基础，同一 key 的摘要不同必须报冲突。
结果进入 Run 是另一个聚合的提交，通过事件幂等接收，不跨 Run/ToolCall/Permit 建立巨型事务。

## 执行主流程

1. control 将冻结动作与 Permit 提交 tools，ToolCallRuntime 获取或创建同一调用记录。
2. 已完成调用返回其耐久结果；已有执行中或未知调用返回状态，不再次进入执行链。
3. 解析原目录和路由版本；目标、参数、工具版本变化时退回 control 重新提案。
4. 在 ToolCall 聚合提交执行意图与唯一派发者版本，禁止并发工作者各自调用 Guard。
5. Guard 原子消费 Permit，tools 记录消费回执与即将派发状态；任一步状态未知都暂停派发。
6. tools 选择一次路径：远程 Provider 使用 ToolProviderPort，本地任务使用 SandboxPort。
7. execution 接收冻结执行计划，核对机制能力后执行；不读取 Permit、不再次判定权限。
8. 有界结果先写 Artifact 并完成发布，再提交 ToolCall 结果及待发布事件。
9. control 幂等消费完成事件、读取权威结果，再恢复认知循环。

初始派发只由持有当前有效派发权且收到本次消费成功响应的工作者发起。
重放旧成功响应或查询已消费记录不产生新派发权；一次消费不等于恰好一次外部副作用。

## 候选操作表

| 操作 / 边界 | 调用方 | 输入输出语义 | 失败处理 |
|---|---|---|---|
| 获取目录快照 / BND-L13-001 | control | 技术范围 → 工具描述及冻结路由引用 | 缺版本或超容量明确失败 |
| 提交已授权调用 / BND-L13-001 | control | 动作、稳定标识、Permit → 受理/结果/已存在状态 | 同标识异摘要冲突，不执行 |
| 查询调用 / BND-L13-001 | control、恢复器 | 作用域内调用引用 → 权威版本、结果或未知 | 不依赖客户端超时猜状态 |
| 取消调用 / BND-L13-001 | control | 调用引用和取消原因 → 已记录意图及已知状态 | 不承诺回滚既有副作用 |
| 执行远程动作 / BND-L34-001 | tools | 冻结路由、动作、operation key → 规范执行证据 | 可能已发送则未知，不换路由 |
| 查询/取消远程操作 / BND-L34-001 | tools 恢复器 | 原 operation key → 权威远程证据或不支持 | 不支持不能模拟为未执行 |
| 执行本地隔离动作 / BND-L34-001 | tools | 冻结计划和资源上限 → 有界结果与清理状态 | 能力不足关闭，不退回宿主 |
| 清理遗留资源 / BND-INF-001 | 执行恢复器 | 本 Host 资源记录及 fencing 信息 → 清理证据 | 归属不明隔离并报警，禁止误杀 |

长任务的受理、查询、取消、事件流只对显式声明能力的工具暴露。
通用框架不假设每个 Provider 都支持查询或取消；目录保留能力声明，Adapter 负责证据真实性。

## ToolCall 生命周期与恢复

候选状态语义为：待执行、派发准备、执行中、成功、确定失败、确定取消、结果未知。
有副作用可能性的未知结果标记为 UNKNOWN_SIDE_EFFECT；它是恢复等待状态，不当作成功或可重试失败。
成功、确定失败、确定取消的事实不因重复消息回退。
未知状态可以通过可信执行证据收敛；人工处置只能附加决定与证据，不能伪造已成功或未执行事实。

| 故障窗口 | 恢复动作 | 禁止行为 |
|---|---|---|
| 执行意图已提交、Permit 明确未消费 | 当前 Attempt 仍有效且未取消时重新走 Guard | 绕过消费 |
| Permit 消费提交响应丢失 | 查询 Permit 和 ToolCall，保持暂停 | 直接重放执行 |
| 消费成功后进程崩溃、是否派发不可证明 | 查询远程状态或本地执行证据；否则未知 | 恢复 Permit、补发等效 Permit 盲重试 |
| 远程已受理、响应丢失 | 用原 operation key 查询 | 新 key、换 Provider、超时判未执行 |
| 结果已到达但本地提交失败 | 查询或重新接收相同结果，幂等提交 | 再执行以重新获取结果 |
| ToolCall 结果已提交、Run 未恢复 | 重投结果事件，Run 按事件去重 | 因 Run 未推进重做动作 |
| 本地清理失败 | 记录清理债务、隔离占用容量并报警 | 报告资源已回收 |

每个 ToolCall 使用版本比较更新，过期工作者不能覆盖新状态。
Attempt/Lease 已失效的工作者禁止新的派发，迟到结果可作为带来源的证据进入专用收敛路径。
取消在派发前确认为未执行时可收敛为确定取消；派发后只是取消意图，必须等待证据。
只读且 Provider 明确幂等的瞬时故障可由 control 发起有限新尝试，并重新取得独立 Permit。
框架首版不做 Adapter 内部透明执行重试；状态查询和幂等结果接收可以有限重试。
远端声明幂等能力也不能使本地宣称“恰好一次”；其保留窗口和查询语义必须经 Adapter 契约测试。

## 远程 Provider 边界

- 每个版本路由绑定允许的端点、工具契约与操作能力，不在已授权调用中动态发现替代目标。
- Transport 负责连接与认证机制；SecretResolver 仅在执行边界解析最小范围凭证。
- 禁止凭证进入领域 DTO、日志和 Artifact；Provider 原生错误映射为稳定脱敏类别。
- 使用端到端 Deadline、有限连接与请求帧、输出流限额；超过限额停止读取并报告证据完整性。
- 网络重定向或资源解析改变授权目标时拒绝；不自动跟随到范围外地址。
- 已发送的认证错误、网关错误、限流响应也须由 Adapter 判别是否能证明未受理，不能只看 HTTP 状态推断。
- 查询结果保留 Provider 操作标识和证据时间，过期或无法关联的回执不用于解除 UNKNOWN_SIDE_EFFECT。

## 本地生产 Sandbox 边界

SandboxPort 表达一次性 execute：准备、落实限制、启动、采集、终止进程树、回收；不向上层暴露可复用宿主句柄。
内部可使用 Process/Container 机制，但不选定具体产品；单纯 spawn 子进程不视为生产隔离。
本地协议按 BND-L34-001 使用 stdout 纯净 JSONL、stderr 脱敏日志，工具业务输出作为结构化内容承载。
握手验证版本、能力和最大帧；未知版本、非法帧或超长帧终止执行并进入清理。

必须在启动前证明落实：文件读写范围、网络出口、CPU、内存、进程数、总时长、输入输出、scratch 配额和 Secret 可见范围。
禁止继承宿主全量环境、宿主凭证和未授权挂载；资源映射使用稳定绑定，阻止路径穿越和符号链接逃逸。
隔离环境不跨 ToolCall 复用；重用只读镜像缓存不得带入上次调用的数据和身份。
网络缺省关闭；操作系统不支持所需限制时拒绝该计划，不回退到进程内或无隔离执行。
当前进程内只读 Adapter 继续仅供受信只读工具使用，不能接收任意生成代码。
取消先阻止新动作，再终止执行树；强制终止依赖 OS 能力，协作 AbortSignal 不作为终止证明。
清理失败需要单独事实，不能覆盖已知业务执行结果；未知副作用与清理状态分别记录。
Host 重启扫描只清理自身有可靠归属证据的残留，无法确认隔离状态时停止新隔离任务准入。

## 安全与容量

工具目录版本、活跃 ToolCall、未知调用、并发执行、连接数和输出 Artifact 均有有限配额。
默认容量由上层 ResourceManager 统一分配，tools 不另建无限队列；等待审批不占执行容量。
未知调用释放已确认无占用的计算资源，但保留恢复记录；占用不明资源计入隔离容量。
输入输出大小、单次 Deadline 取所有适用上限的最小值，execution 只能收紧。
Artifact 发布失败不生成悬空成功结果；已完成外部动作不能因此当作未执行重试。
审计或本地状态提交失败时不开始新的受保护动作；外部已经发生的动作保留未知并报警。

## 验收场景

1. 同 key 同摘要重复提交返回同一调用；异摘要拒绝；并发工作者不能重复派发。
2. 消费前故障不调用 execution，消费后任一崩溃窗口都能通过故障注入进入正确恢复路径。
3. 模拟远端成功但断开连接，进入 UNKNOWN_SIDE_EFFECT；查询确认后收敛，无第二次执行。
4. Provider 不支持查询时保持未知并请求核对，不假装失败、不自动换目标。
5. 冻结后目录更新不改变运行中工具版本和路由；缺失旧版本明确失败。
6. 取消与迟到成功竞争时保留真实执行证据，不用取消信号掩盖已发生副作用。
7. Sandbox 对路径逃逸、越界网络、超大帧、资源耗尽、子进程残留均关闭并产生有界故障。
8. OS 缺少所需隔离能力时启动失败；测试证明没有宿主执行回退路径。
9. 结果落库后恢复事件重复投递只推进一次 Run；Artifact 不存在时不能返回成功引用。
10. 残留资源清理失败时容量不可虚假归还，且不会终止其他 Host 或新 Attempt 的进程。

## 待用户评审决策与实施切片

| 决策 | 默认提案 | 替代与取舍 |
|---|---|---|
| EXE-01 首版重试 | 只做状态查询；只读新尝试经 control 重新授权 | Adapter 自动重试更省延迟，但难证明消费与副作用边界 |
| EXE-02 未知副作用 | 保持未知、查询或人工核对 | 业务补偿可恢复体验，但必须由工具业务方单独定义 |
| EXE-03 Sandbox 后端 | 能力探测后选择可证明落实计划的机制 | 固定单一平台可简化验证，但限制本机可用性 |
| EXE-04 首版远程 Provider | 单 Adapter、显式能力、冻结路由 | 动态路由与自动故障转移需新增授权和幂等证明 |

实施顺序：先做 ToolCall 耐久状态与故障注入，再接 Permit Guard，随后分离远程和本地执行端口，最后接生产隔离与遗留清理。
与[安全草稿](security-approval-permits.md)共同评审消费窗口；与存储草稿协调结果、Artifact、事件提交和去重保留。
与调度草稿协调有效派发者、Attempt fencing、取消、未知等待和容量归还；与运维草稿协调清理债务与未知结果告警。
