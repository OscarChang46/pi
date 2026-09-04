# Operations Plane 与 Infrastructure Plane 最小能力设计

> 状态：`ACR-2026-0009` 五步评审步骤一候选
> 返回主文档：[运维与基础设施](agent-kernel-design.md#15-pi-adapter运维与基础设施)
> 边界协议：[C4 层间边界协议](c4-boundary-protocols.md)
> 运行资源：[AgentSession、FlowEngine 与资源调度](session-flow-engine-resource-subsystem-design.md)

## 1. 设计目标

首版只交付本地可用、可诊断、失败关闭的最小能力。Operations Plane 只观察和审计；Infrastructure Plane 只提供机制。两者都不能拥有 Run、Session、权限、工具或业务状态。

## 2. Operations Plane 最小能力

| 能力 | 最小实现 | 必须记录 | 禁止记录 |
|---|---|---|---|
| OperationContext | 进程内传播 | traceId、spanId、correlationId、causationId、deadline | Token、Prompt、正文 |
| 结构化日志 | stderr JSONL + 滚动文件 | 时间、级别、组件、run/attempt/session 引用、错误码 | Secret、工具原始参数、chain-of-thought |
| Trace | 进程内 Span Recorder | Scheduler wait、Context、Model、Permission、Tool、Storage 耗时 | 原始输入输出 |
| 指标 | 内存计数器/直方图快照 | 活动 Run、队列深度、执行槽、失败数、阶段耗时 | 高基数正文标签 |
| 健康 | `health.get` | liveness、readiness、SQLite、队列、时钟、Sandbox 状态 | 修改领域状态 |
| 安全审计 | SQLite append-only journal | Permit 决策/消费、Sandbox、Secret handle 使用摘要 | Secret 值、物理路径 |
| 诊断快照 | 有界本地包 | 配置摘要、版本、健康、最近错误和指标 | 用户内容和凭据 |

最小 Port：

```ts
/** 横切观测端口；调用失败不得改变领域决定。 */
export interface ObservabilityPort {
  emitLog(record: StructuredLogRecord): void;
  startSpan(context: OperationContext, name: SpanName): SpanHandle;
  recordMetric(sample: MetricSample): void;
}

/** 安全事实端口；载荷必须先完成脱敏与摘要化。 */
export interface SecurityAuditPort {
  append(event: SecurityAuditEvent): Promise<void>;
}

/** 本地运维查询；只返回脱敏快照。 */
export interface OperationsQueryPort {
  health(): Promise<HealthSnapshot>;
  metrics(): Promise<MetricsSnapshot>;
  diagnostics(request: DiagnosticRequest): Promise<ArtifactReference>;
}
```

## 3. Infrastructure Plane 最小能力

| Port | 首版本地 Adapter | 责任边界 |
|---|---|---|
| `SessionRepositoryPort` | SQLite WAL + optimistic version | Session 档案和版本 CAS |
| `RunRepositoryPort` | SQLite WAL + optimistic version | Run/Attempt/Step 权威状态 |
| `LocalQueuePort` | 有界内存队列 + 重启扫描重建 | 可运行 Run 提示，不作为权威状态 |
| `ExecutionResourcePort` | Semaphore + 有界 FIFO | 执行槽和临时资源配额 |
| `ArtifactPort` | 本地目录 + 内容摘要 + 不透明 Ref | 大内容和临时资产，不泄露路径 |
| `SandboxPort` | 受控子进程 JSONL | 单次有界执行、超时、终止、回收 |
| `SecretResolverPort` | 环境变量映射的 SecretHandle | 只在执行瞬间解析，不持久化明文 |
| `ClockPort` | UTC system clock + IANA TimeContext | 统一绝对时间和时区解释 |
| `TransportPort` | stdin/stdout JSONL | CLI/Host 本地通信，有界帧 |
| `ModelEgressPort` | HTTPS Adapter | 仅允许配置的模型端点、deadline 和取消 |

首版不引入 Temporal、Kafka、独立 Event Bus、gRPC、服务发现、分布式锁、MicroVM 编排或远程遥测集群。未来替换 Adapter 时不得改变上层 Port 的领域语义。

## 4. 最小 Composition Root

```text
KernelHost
├── AgentKernelProtocolFacade
├── AgentSystemGateway
├── FlowEngine（无状态）
├── RunScheduler + ResourceManager
├── RuntimePool
├── PermissionSystem + ToolRuntime + ContextEngine
├── Operations
│   ├── JsonlLogger
│   ├── InProcessTracer
│   ├── InMemoryMetrics
│   ├── SqliteSecurityAuditJournal
│   └── HealthService
└── Infrastructure
    ├── SqliteSessionRepository / SqliteRunRepository
    ├── BoundedLocalQueue / SemaphoreResourceManager
    ├── LocalArtifactStore / ChildProcessSandbox
    ├── EnvironmentSecretResolver / SystemClock
    └── JsonlTransport / HttpModelEgress
```

## 5. 故障语义

- 日志、普通 Trace 和指标写入失败不得推进或回滚领域状态，但必须限流并记录降级计数。
- 安全审计写入失败时，受保护副作用默认拒绝执行。
- SQLite 不可用时不接受新 Run，不签发或消费 Permit。
- 队列满时拒绝新排队或施加背压，不能扩成无界 Buffer。
- Sandbox、Secret 或 Model Egress 不可用时返回稳定技术失败，不回退为宿主直连。
- 时钟异常或 deadline 无法验证时，权限与副作用执行失败关闭。

## 6. 实现顺序与门禁

本文件在评审阶段定义“最小实现切片”，不授权提前修改运行代码：

1. 固化 DTO、Port 和稳定错误码；
2. 实现 stderr JSONL、内存指标、健康快照与 OperationContext；
3. 实现 SQLite Repository、WAL、CAS 和安全审计；
4. 实现有界队列、Semaphore ResourceManager 和重启扫描；
5. 实现 Artifact、Secret、Clock、JSONL Transport；
6. 最后接入受控子进程 Sandbox 和 Model Egress；
7. 通过 SFMEA、资源泄漏、日志脱敏和故障注入用例后才进入代码基线。
