---
doc_id: L4-CON-001
level: contract
layer: L4 Execution Runtime
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: L4-DD-1解析后执行限制与机制证据候选契约
parent: L4-DES-001
interfaces: [BND-L34-001]
diagrams: []
supersedes: []
---

# L4-DD-1：受控执行详细契约

本文件是候选内部契约，不是发布 Schema。[BND-L34](bnd-l34-001.md)拥有方向；[L3-FD-2](l3-tool-runtime-detail.md)拥有 RouteBinding/ExecutionLocator；[BND-L34](bnd-l34-001.md)唯一拥有 ExecutionPlan、L4Reply、L4Query、L4Cancel；[CD-1](component-development-contracts-v1.md)拥有 Ref、Count、Millis、Artifact、TrustedScope、Error 等公共标量。下列类型不替换这些类型。

## 1. 输入与确认点

入站为 BND-L34 的 `execute(plan, signal)`，可信 meta/scope 由装配上下文提供；inspect/cancel 接收完整 ExecutionLocator。plan 的 commandId、operationKey、descriptorRef、argumentsRef、route、scopeRef、startGrantRef、deadlineAtMs、limits、resourceProfileRef 在 L3 派发前冻结。operationKey=commandId；L4 只解析同一版本句柄，绝不从参数或 startGrantRef 构造权限。

L1/宿主按 L3-C01/C04/C06 保证同 command 一次有效执行、接管隔离、事实保存与恢复；Guard 调用 Security.consume/authorizeStart 后返回启动许可，L3 只执行一次有界调用。本设计不依赖已被 L3-FD-2 撤出的 STARTED CAS/outbox 实现。

B1规范缺口由L34-SPEC-1.0.0关闭：plan.resourceProfileRef引用完整ResourceProfile，L1在PDP前准备ToolTargetV1，Guard核对完整targetDigest，Host安装ExecutionAdmission。L4先verify Admission，再按同一Artifact解析限制；不从route或mountsRef猜档案。BND-L34拥有字段、限额与摘要；实际安全/存储接入仍须实现验收。

L1 从可信资源档案准备 limits，Guard 校验，L4 机械检查所有约束可落实。参数、约束、路由引用由 L1/宿主按 C04 保留。本轮原 B2“查询 DTO 冲突”已由新 BND-L34 的 L4Reply/L4Query/L4Cancel 收敛；B2 现在只保留调用方可靠保存、迟到事实和 pin 交接的集成依赖。

## 2. 字段级候选结构

全部字段必填，只有显式 `null` 可空。整数采用 CD-1 安全整数；数组只读且去重，不允许悬空引用，按 Ref 升序序列化。物理路径、endpoint、凭据只存在机制内部。以下限制结构只针对 Sandbox，Provider 使用其适用的时间/字节/出口限制，不假称能限制远端 CPU。

```text
SandboxConstraints = {
  profileRef: Ref, workloadRef: Artifact, cleanupTimeoutMs: Count,
  cpuMillis: Count, memoryBytes: Count, pids: Count,
  diskBytes: Count, maxOpenFiles: Count,
  inputBytes: Count, outputBytes: Count,
  frameBytes: Count, queueBytes: Count,
  mounts: MountBinding[], egressRefs: Ref[], secretHandleRefs: Ref[]
}
MountBinding = {resourceRef: Ref, mode: read|write, targetSlot: Ref}
PreparedExecution = {
  plan: BND-L34.ExecutionPlan,
  resourceProfile: BND-L34.ResourceProfile, constraints: SandboxConstraints|null,
  input: Artifact, remainingMs: Count,
  maxOutputBytes: Count, adapterBindingRef: Ref
}
UsageSummary = {
  elapsedMs: Count, cpuMillis: Count|null,
  peakMemoryBytes: Count|null, outputBytes: Count
}
CleanupReceipt = {
  operationKey: Ref, state: clean|pending,
  remainingResourceRefs: Ref[], receiptRef: Ref
}
MechanismObservation = {
  operationKey: Ref, routeRef: Ref, sourceReceiptRef: Ref,
  dispatch: not_sent|may_have_sent,
  work: pending|success|failed|unknown,
  effect: Effect, resultRef: Artifact|null, error: Error|null,
  cleanup: CleanupReceipt|null, usage: UsageSummary
}
```

| 字段组 | 范围、所有权和生命周期 |
|---|---|
| profileRef / workloadRef | 精确隔离档案和工作负载内容；无任意命令拼接、可变 tag 或默认 Shell。目录发布者供给，L3 冻结引用 |
| cpuMillis / memoryBytes / pids / maxOpenFiles | 正数；CPU 累计毫秒、峰值驻留内存字节、存活进程上限、打开文件数；能力不能硬落实则拒绝 |
| diskBytes | 非负字节，0 禁写；全部可写挂载与 scratch 共享预算，不能每个目录各放大一次 |
| inputBytes / outputBytes | 正数；不超过上游 64 KiB / 256 KiB；结果包括内联、附件与业务 stdout/stderr 解码字节之和 |
| frameBytes / queueBytes | 正数，frameBytes≤queueBytes；按 UTF-8 线格式字节计，解码后另验总量；配置必须显式提供 |
| mounts | 0..64；同 targetSlot 不能重复，父子槽冲突拒绝；resourceRef 在 scope 内已授权。宿主路径解析、无跟随打开与挂载只由机制负责 |
| egressRefs / secretHandleRefs | 各 0..64，空为拒绝；引用精确出口/Secret 能力，不接受通配授权；Lease 到期不延长执行 |
| PreparedExecution | 单调用内存值；Provider 的 constraints=null，Sandbox 必须非 null；input 必须等于 plan.argumentsRef，绑定与参数不重新读可变源 |
| remainingMs / maxOutputBytes | `max(0, deadline-now)`，0 拒绝启动；输出取上游、档案与组件上限最小值。Clock 可信性检查与单调计时由机制实现 |
| UsageSummary | 无法测量的字段为 null，不填 0；只说明观测，不证明限额已实施 |
| CleanupReceipt | clean 必须空数组；pending 必须有至少一个作用域内资源或隔离组 Ref；Mechanism 存储权威。Provider 无本地待清理资源时 cleanup=null |
| MechanismObservation | Adapter 产生并耐久保存/引用原始机制证据；resultRef 必须已发布。work=success 要求结果且 error=null；failed 要求 error；unknown 保留错误/部分结果；未发送才能凭本地证据断言 none |

资源档案上限已由BND-L34 Schema冻结；本文件的机制内部对象仍为候选实现结构。缓冲不得先读全量后检查；未知字段、重复 JSON 键、非法 UTF-8、超深嵌套按 CD-1 拒绝。

具体字段传播：resourceProfile是plan.resourceProfileRef已验摘要的内容；SandboxConstraints.profileRef=resourceProfile.profileId，其余同名字段原样映射（含cleanupTimeoutMs、workloadRef、mounts）；Provider constraints=null但仍保存完整resourceProfile。PreparedExecution.maxOutputBytes=profile.outputBytes=plan.limits.outputBytes；CPU/内存/pids/磁盘及mountsRef按BND-L34逐项相等，不裁剪出另一份未授权档案；network=deny当且仅当egressRefs为空。Provider 不应用 Sandbox CPU/pids 等字段，但仍须遵循冻结的出口、参数、时间和结果限制。不能实现适用限制时拒绝。

## 3. 返回和查询映射

`execute` 返回 BND-L34.L4Reply；不另定义回复 DTO。locator 三字段来自 plan 的原 commandId/operationKey/route.routeRef，必须在派发前形成并由上游可靠保存。机制 sourceReceiptRef 在首次外部发送/创建前分配并关联原操作；映射为 L4Reply.evidenceRef，仅可信事实可填入。未确认来源时 evidenceRef=null且回复必须unknown；success/failed均要求非空可信证据。

| 机制观察 | 给 L3 的回复 | 禁止推断 |
|---|---|---|
| 发送/启动前确定拒绝 | outcome=failed，effect=none，稳定 Error | 不把“未收到 handle”当未启动 |
| 可信完整成功 | outcome=success，已知 effect，resultRef 非 null，error=null | exit 0 / HTTP 200 / 工作负载自报不能单独证明副作用范围 |
| 可信失败 | outcome=failed，effect=none 或 applied，error 非 null | 业务失败不等于 none |
| 超时、断线、丢进程或效果不明 | outcome=unknown，effect=unknown，error 非 null | 不重试、不把 unknown 装进 failed 分支 |
| 结果已确认但回收 pending | 返回原执行回复；evidenceRef 关联机制回收事实，另发安全/健康信号 | 不覆盖原结果、不释放未回收资源容量 |

结果损坏但已有可信applied证据时，返回failed/applied及错误；不能抹掉已知效果。完整结果需要符合冻结工具 outputSchema。L4 通过 descriptorRef 的作用域化只读解析能力取得原 Schema；无法取得时不伪造成功，L3 仍执行其独立输出校验。无论物理工作是否结束，只要效果未知即按 BND-L34 返回 unknown。

inspect 使用 BND-L34.L4Query：有完整回复为 completed+reply，仍在运行且可证明为 pending+locator，其余 unknown+locator。没有查询能力、查无记录、索引已清理或失联不能当作确定未执行。completed 表示得到一次完整观察，可包含 outcome=unknown；调用方按 reply 的 outcome/effect 判断。可信迟到结果可补证据，矛盾证据留 Incident，原始事实不覆盖。

cancel 使用 BND-L34.L4Cancel：requested 只受理，stopped 必须 evidenceRef 非 null 且确证全执行树或远端工作停止，不能由关闭 socket 推断。effect 另查；停止不等于撤销。查询/取消使用新的有限操作 Deadline，不沿用已过期的执行 Deadline。L4 在执行 Deadline 到达时返回 unknown 或由受信适配器归一化；安全清理可在独立预算内继续，机制 receipt 保留后续查询依据，不能为了等待清理无限延迟主回复。

## 4. 机制持久化与幂等

Provider 私有 OperationMapping 候选字段为 `{operationKey:Ref, routeRef:Ref, bindingDigest:Digest, providerRequestRef:Ref|null, dispatch:not_sent|may_have_sent, receiptRef:Ref, version:Count}`。主键由可信 scope、adapterBindingRef、operationKey 组成；唯一绑定不可覆盖，更新采用 version CAS。bindingDigest 复用 FE-C14N-1 对冻结 plan 的规范编码；资源档案必须包含在已冻结的绑定输入中，不另造摘要算法。

在发送前把 dispatch 从 not_sent 耐久改为 may_have_sent，CAS 胜者仅在当前调用栈获得一次发送机会。崩溃恢复只查询，不凭该状态恢复发送。重复 execute 返回已有证据或 unknown；同键异载荷拒绝。远端幂等能力只能增加保护，不能成为 Adapter 自动重试依据。此记录是协议映射，不是 Permit、ToolCall 或业务状态；通过 Infrastructure 私有机制存储实现，不要求 L3 建库。

Sandbox 的环境创建/启动事实、标签、执行树及回收账本由 Process/Container Port 持久化。创建前先登记 scope+operationKey 的机制意图，创建所得环境必须原子附带可扫描标签；handle 回执丢失时按标签核对，不创建第二环境。未支持该保证的机制属于 B3 阻塞。

记录和路由保留至少至 L1/宿主确认调用终态后 30 天，且所有 pin/Incident/cleanup pending 解除；过期保留不可复用墓碑。配额不足拒绝新操作；禁止清理 unknown 以腾空间。结果发布后到 L1/宿主 pin 确认之间，由机制 receipt 持有 Artifact；L1/宿主保存失败不能让已返回引用被 GC。

## 5. 故障、证据和安全

Provider AUTH_FAILED→ACCESS_DENIED，RATE_LIMITED→RESOURCE_EXHAUSTED，协议错误→SCHEMA_INVALID/PROTOCOL_UNSUPPORTED，超帧→FRAME_LIMIT，超结果→OUTPUT_LIMIT，隔离不满足→ISOLATION_UNAVAILABLE。execute 错误 retryable=false；本协议wire错误一律retryable=false；只读查询可由调用方显式再次发起，不能隐含重执行。detailsRef 仅脱敏；不记录 endpoint、路径、参数或原生异常。

证据可信度来自受信 Adapter 对固定 Provider 协议的验证，或受信 supervisor 的过程观测。工作负载 stdout 中的 success/effect 字段不直接升级为可信执行效果；Provider 业务凭据必须匹配 scope、operationKey 和原 route。Secret 不进入通用结果；需要 Secret 的插件须通过 scoped proxy 使用，禁止把明文交任意不可信代码后声称可保证不外泄。相关机制验收属于 B3/B4。

进程内受信调用不可强行终止 JS，同步阻塞也不能依赖 AbortSignal 保证硬 Deadline；有此要求的工具使用 Sandbox 路由。读 Provider 的 none 证据只涵盖协议定义的目标资源，无权宣称远端连日志都没有写入。
