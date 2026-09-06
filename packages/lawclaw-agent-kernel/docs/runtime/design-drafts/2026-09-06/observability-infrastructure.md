# 运维与基础设施机制装配草稿

状态：**DRAFT / 待用户评审 / 非规范性**。日期：2026-09-06。

本文只提出候选边界和实现顺序，不更改现有设计的 `candidate` 状态或批准任何契约。
操作表描述输入输出语义，不冻结完整 DTO、具体 SDK 或外部服务选型。

## 1. 问题与当前缺口

例：Trace 导出失败不应取消已经执行的 Run；安全审计写入失败却不能继续启动受保护工具。
若把两者放入同一个可丢弃队列，既会妨碍可用性，也会失去安全事实。

实际代码状态：

- [observability/index.ts](../../../../src/observability/index.ts) 仅导出 `OperationContext`，没有 Sink。
- [contracts/types.ts](../../../../src/contracts/types.ts) 已有时间 Port 和关联上下文，尚非完整 W3C 传播模型。
- [infrastructure/index.ts](../../../../src/infrastructure/index.ts) 仅暴露时间相关类型。
- [本地 Adapter](../../../../src/infrastructure/adapters/README.md) 包括系统时间、内存权限快照及 Fake 委派。
- [Composition Root](../../../../src/application/composition-root.ts) 装配只读 Sandbox，没有这里提出的生产机制链。
- [框架映射](../../framework-boundaries.md) 将日志、审计、健康、出口、Secret 与进程机制列为未实现。

设计依据：

- [BND-OPS-001](../../../design/contracts/bnd-ops-001.md)：普通遥测与安全审计的不同故障语义。
- [BND-INF-001](../../../design/contracts/bnd-inf-001.md)：作用域 Adapter 与机制结果。
- [Operations Plane](../../../design/layers/operations-plane/README.md)、[Infrastructure Plane](../../../design/layers/infrastructure-plane/README.md)。
- [Composition Root](../../../design/deployment/composition-root.md)、[Local-first](../../../design/deployment/local-first-profile.md)。
- [公共元数据](../../../design/contracts/common-metadata.md)：稳定命令 ID、deadline 和不透明执行信封引用。

## 2. 职责与所有权

默认单 Host、本地日志/Trace、内存指标快照、本地 SQLite 安全审计；远程 Exporter 不启用。
Port 由消费者定义，application 装配具体 Adapter；组件不能自行打开数据库或绕过出口直连。

| 组件 | 拥有的技术状态 | 禁止承担 |
|---|---|---|
| Logging / Tracing / Metrics | 脱敏记录、活动 Span、低基数计数 | 领域状态和请求正文归档 |
| TelemetryPipeline | 有界队列、批次、丢弃计数、导出状态 | 安全审计或 Run 恢复 |
| Health / Diagnostics | 带时间与原因码的只读健康投影 | 直接取消、重试或改写 Run |
| SecurityAudit | 按事件 ID 去重的耐久追加事实 | 权限批准或审计成功即执行成功 |
| Secret / Transport / Process | 秘密租约、连接、帧、进程与回收句柄 | 业务身份、工具授权和调度规则 |
| Capacity / ModelEgress / Clock | 槽位、连接、截止时间与时钟机制 | Run 优先级、Prompt 理解、模型选择 |

## 3. 候选操作表

| 操作族 | 边界 | 输入与输出语义 | 失败语义 |
|---|---|---|---|
| 记录日志/Span/指标 | BND-OPS-001 | 白名单字段、关联上下文 → 接收或可见丢弃 | 有界非阻塞，丢弃计数增加 |
| 追加安全事实 | BND-OPS-001 | 稳定审计 ID、动作引用、结果与因果链 → 耐久收据 | 失败关闭受保护动作；同 ID 异义冲突 |
| 查询健康 | BND-OPS-001 | 探针范围 → liveness/readiness/degraded 与采集时间 | 超时或过期标 UNKNOWN，不推断健康 |
| 生成诊断包 | BND-OPS-001 / BND-INF-001 | 范围、大小与时间上限 → 脱敏 Artifact 引用 | 失败不改领域状态 |
| 获取/释放容量 | BND-INF-001 | 已计算资源类别、数量、deadline → 不透明 Handle | 饱和、取消、过期均有界失败 |
| 创建/查询/终止进程 | BND-INF-001 / BND-L34-001 | 已授权且机制可满足的执行计划 → Handle/技术状态 | 无法隔离则拒绝，无宿主 Shell 回退 |
| 解析/撤销 Secret | BND-INF-001 | 已验证 scope/purpose/expiry 的 Handle → 短时私有租约 | 无法验证即拒绝，不泄露是否存在 |
| 打开传输/发送帧 | BND-INF-001 / 对应 BND | 协商版本、受限连接、帧 → 技术接收结果 | 超限拒绝；断线不等于命令未发生 |
| 模型出口请求 | BND-INF-001 / BND-MOD-001 私有适配 | 已配置端点、SecretHandle、deadline、流限制 → 有界响应流 | 返回技术错误；不决定模型重试 |
| 读取时间/测量耗时 | BND-INF-001 | 时间需求 → UTC 时间点或单调值 | 时钟不可验证则关闭相关受保护动作 |

不透明 Handle 不能被序列化成凭据；OS PID、数据库连接和 Provider SDK 类型留在 Adapter。
各操作注释需说明取消是否可能晚于外部效果，以及重复释放是否幂等。

## 4. 日志、Trace 与指标

组件先构造白名单记录，Pipeline 再执行防御性过滤，禁止对任意对象直接 stringify。
允许字段包括稳定错误码、组件名、阶段、脱敏引用、耗时与计数。
禁止 Prompt、Memory 正文、Token、Secret、工具原始参数、响应正文和物理路径。
Provider 异常先转换为稳定错误；`detailsRef` 只能指向经过脱敏的受控诊断资料。

Trace 覆盖受理、调度、上下文、模型、安全判定、工具、Sandbox 与存储阶段。
现有 UUID trace/span 标识不能直接宣称符合 W3C；后续在 Host 边界验证与规范化传播格式。
异步步骤用 correlation/causation 关联；重试保持原因链但创建新的执行 Span。
日志可含受控 Run/Attempt 引用；指标标签不能含 runId、sessionId、参数或任意错误文本。
指标标签使用固定集合：组件、阶段、结果类别和资源类别；标签预算超限必须可见。

各信号独立有界排队，按条数和字节限制，不因为日志堆积阻塞模型和工具完成。
队列满优先丢弃低级别记录，增加低基数丢弃计数；审计绝不进入这条队列。
JSONL 协议使用 stdout 时，日志只写 stderr 或配置的滚动文件。
重启不重放内存遥测；日志和 Trace 不作为 Run 状态的权威证据。
Exporter 仅消费副本，可选 Exporter 不可用只标 degraded。

## 5. 安全审计与副作用闸门

审计是独立耐久 append-only Journal，与普通日志和领域事件 Journal 分开。
按稳定审计事件 ID 去重；同一事件重复追加返回同一收据，不更新原事实。
记录决策、审批、Permit 消费、Secret 使用摘要和越权检测，不保存原始参数或明文身份材料。

候选受保护执行流程：

1. security / tools 根据本域规则确定授权与执行阶段，构造必要安全事实。
2. 在设计规定的执行前写入点取得耐久审计收据；失败不进入 Provider。
3. Permit 消费与 ToolCall 状态保持各自事务，由稳定引用关联审计收据。
4. 开始执行；完成、拒绝或结果未知分别追加事实，不修改先前记录。
5. 执行后审计失败必须报告事实缺口并阻止新的受保护动作，不能宣称已回滚外部效果。

审计收据不代表 Permit 已消费，也不代表工具已执行；无法用它直接恢复或重放动作。
跨库或跨聚合不能声称原子；精确审计写入点与消费顺序需和 Security 草稿一起评审。
数据库不可写时不能回退文件日志假装审计成功；导出成功也不能替代本地耐久收据。
审计故障不能阻止 KillSwitch、取消和回收等降低风险的操作；恢复后补记可验证事实。
首版不自动删除审计；容量将满要提前拒绝新受保护动作并暴露健康原因。

## 6. 机制 Adapter 约束

**SecretResolver**：Host 绑定受限的环境秘密名称映射，不把整个环境传给工具或子进程。
调用方先提供已验证用途，Resolver 校验句柄绑定，明文只在可信 Adapter 执行窗口内存在。
失效、取消和关闭撤销租约；运行时无法保证所有内存副本物理清零，不作绝对清零承诺。
审计记录句柄摘要与结果；秘密不可进入错误、Artifact、stdio 或公开 DTO。

**Transport**：首版维持进程内调用，Desktop 外部入口按 Host 草稿使用 stdio JSONL；内部 Runtime Sidecar 通道仅按需装配。
连接协商主版本、能力与最大帧；限制未确认事件窗口、每连接队列和总连接数。
断开不自动取消 Run，重连由协议层凭原命令 ID、收据和 Journal 游标收敛。
不承担授权或持久化重试；未来 Loopback 入口需本机凭据，默认不监听公网。

**Process/Container**：仅执行已经授权并归一化的计划，工具场景只供 execution Sandbox 使用。
检查计划要求能否被所选机制兑现；普通子进程不能冒称强沙箱或网络隔离。
每次创建具备上限、取消、关闭流与幂等回收路径；清理失败标记待回收并隔离相关容量。
重启不能仅凭旧 PID 杀进程，需验证 Host 所有权与启动标记，避免误杀 PID 复用对象。
无法满足挂载、出口或隔离约束就拒绝，不静默降级更宽权限。

**ModelEgress**：只实现端点白名单、TLS、连接/字节上限、取消与 deadline。
PiAgentAdapter 私有解释模型事件及重试阶段；不新增第二套公共 ModelInvocation 契约。
需要先验证 Pi Adapter 可注入所需传输钩子，不能以改 Pi 核心作为接入前提。
若 SDK 无法满足出口约束，该装配档案应拒绝启动，不用文档宣称已经受控。

**Capacity / Clock**：ResourceManager 决定申请多少资源，机制层只提供有界 FIFO 与信号量。
取消或超时移除等待者，Handle 幂等释放；进程重启后旧 Handle 全部无效。
多个资源按上层固定次序获取，失败释放已得资源；机制层不发明 Run 优先级。
deadline 使用 UTC，耗时/等待使用单调时钟；跨进程不持久化单调值，墙钟异常明确上报。

## 7. 装配、健康与关闭

启动顺序：机制资源 → 本地日志及耐久审计 → Security/工具执行 → 认知 → control → 外部接入。
Host 验证所有必需 Port 已绑定且探针通过后才开放 readiness，不以空成功 Adapter 占位。
必需能力按运行档案确定；未启用的可选容器、Sidecar、Exporter 不应阻塞只读本地档案。
readiness 判断是否能安全受理新工作；liveness 只检查进程能否响应探针。
探针涵盖数据库、审计、时钟和当前档案必需机制；超时/过期事实不当作健康。
健康服务只产出投影，Host/领域入口消费它决定受理；健康服务不直接修改 Run。
诊断包仅收集版本、配置摘要、原因码与聚合指标，有大小、并发和生成 deadline。
关闭先停止接入，再在 deadline 内收敛活动工作、撤销资源，最后关闭审计、遥测与存储。
普通遥测限时排空可丢弃；审计失败保留故障报告，不将丢失记录伪装成已落盘。

## 8. 验收场景

1. 日志写失败、Exporter 卡住和队列满不会推进/回滚 Run；丢弃及 degraded 可查询。
2. 执行前审计失败，Provider 调用次数为零；执行后失败不伪造外部效果已撤销。
3. KillSwitch 在审计不可写时仍能停止后续动作和发起回收。
4. 使用恶意 Provider 异常与参数验证日志、Trace、指标、诊断包均不含秘密或正文。
5. 高基数标签、超大日志和慢消费者受到固定预算约束。
6. Secret 过期/跨作用域拒绝；未知端点、无法兑现的隔离计划及缺失 Port 拒绝运行。
7. Transport 断线重连不会重复命令；stdout 不含日志污染。
8. 容量申请取消、双重释放、创建失败、回收失败和 PID 复用均正确处理。
9. Clock 回拨、健康探针过期与 shutdown deadline 超时都产生显式技术状态。

## 9. 待用户决定与实施切片

| 决策 | 建议默认 | 替代与取舍 |
|---|---|---|
| OPS-01 运维后端 | 本地 Sink 和指标快照；不启用远程 Exporter | 远程导出便于集中观察，但增加部署和数据边界 |
| OPS-02 调试材料 | 始终不收集原始 Prompt、工具参数与 Secret | 若需内容调试，应另行评审专用授权与存储协议 |
| OPS-03 运行隔离 | 首版维持只读机制；未满足隔离要求的工具拒绝 | 子进程/容器档案需先完成机制兑现与回收验收 |
| OPS-04 审计保留 | 不自动删除，阈值前预警并阻止新受保护动作 | 有期限归档需要独立保留与验证设计 |

1. 先评审窄 Port、字段白名单、错误分类及普通遥测/审计分离；补中文接口说明与替身。
2. 装配本地遥测和只读健康查询，验证故障不改变领域行为。
3. 依赖仓储切片完成耐久审计，与 security/tools 一同确认执行前后写入点。
4. 逐项接入容量、Secret、受控出口及进程机制；未通过对应验收的档案保持不可用。
5. 最后按实际需要增加 Sidecar 或远程 Exporter，不把可选后端作为框架启动依赖。

跨域协调：控制层决定调度与恢复；Security 定义必须审计的动作和闸门；
execution 定义可兑现的 Sandbox 计划；Pi Adapter 私有拥有模型语义；Host 负责身份终止、
分区绑定、启动与关闭；本地审计和 Artifact 依赖[存储草稿](storage-journal-recovery.md)。
