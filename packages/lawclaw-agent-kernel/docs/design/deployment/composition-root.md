---
doc_id: SYS-DEP-003
level: deployment
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "部署绑定与 Composition Root"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: [docs/design/operations-infrastructure-minimum-design.md]
---

# Composition Root 设计

`KernelHost` 是 Kernel 内部依赖的唯一装配位置，负责把 Domain/Application Port 绑定到 Adapter；内部组件不得自行创建 SQLite、HTTP、Pi SDK、进程或系统时钟依赖。独立 LawClaw TUI 有自己的应用装配入口，创建 pi-tui 界面、Kernel Client 与本地连接适配器，不装配 Kernel 内部执行器。两进程关系见 [TUI宿主档案](kernel-tui-host.md)。

```text
KernelHost
├── AgentKernelProtocolFacade → AgentSystemGateway
├── L1 Control（FlowEngine 四态、ActivityInterceptor、TaskGraph、ReAct业务适配）
├── L2 Cognitive Runtime（AgentRuntime、Parser、PiAgentAdapter）
├── Security Plane → L3 Tool Runtime → L4 Execution Runtime
├── Operations
│   ├── JsonlLogger / InProcessTracer / InMemoryMetrics
│   ├── SqliteSecurityAuditJournal
│   └── HealthDiagnosticsService
└── Infrastructure
    ├── SqliteFlowJournal / SqliteRepositories
    ├── LocalArtifactStore / ChildProcessAdapter
    ├── EnvironmentSecretResolver / SystemClock
    └── JsonlTransport / HttpModelEgress
```

启动顺序为 Infrastructure → Operations 本地 Sink → Security/L3/L4 → L2 → L1 → 外部 Transport；关闭顺序反向，先停止受理，再在 deadline 内取消或收敛活动动作并回收资源。装配失败时不开放 Gateway readiness。
