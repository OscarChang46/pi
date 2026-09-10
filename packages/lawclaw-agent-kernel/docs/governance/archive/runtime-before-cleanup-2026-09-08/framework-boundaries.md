> 历史归档，2026-09-08从docs/runtime移出。正文保留当时讨论，不代表当前实现、有效设计或批准；后继来源与迁移原因见[归档索引](README.md)。

# 当前框架与候选设计的映射

本记录说明边界重构事实，不批准候选架构、不更新历史基线，不声称完成 V3.1 全部协议。目录以职责命名，设计编号仅用于追踪。

| 目录 / 组件 | 所有权与当前接口 | 设计边界 |
|---|---|---|
| control / AgentSystem、RunRegistry、AgentSession | 独立 Run 目录、会话 ID 关联；run/getRun | BND-EXT-001、BND-L1-001 |
| control / RunFlow、ContextEngine、DelegationEngine | 无状态推进、有界 Frame、现有单层委派；ContextEnginePort、DelegationPort | BND-L1-001、BND-L12-001 |
| cognitive / AgentRuntime | 单轮临时执行，候选交还控制；AgentAdapter | BND-L12-001 |
| cognitive/adapters / PiAgentAdapter | Pi 私有消息及模型目录，不暴露原生类型 | BND-MOD-001 |
| control / ToolCoordinator | 判定前检查与权限协调；PermissionDecisionPort、ToolRuntimePort | BND-SEC-001、BND-L13-001 |
| security / PermissionApprovalService、InMemoryKillSwitch | 现有 Grant、撤销复核、停止状态 | BND-SEC-001 的过渡子集 |
| tools / ToolRuntime | 工具目录、Grant 绑定与有效性复核；GrantValidationPort | BND-L13-001、BND-L34-001 |
| execution / ToolExecutor、SandboxPlanner、只读 Adapter | 单次执行及 finally 清理；ToolExecutionPort、SandboxPort、ToolProviderPort | BND-L34-001 的过渡子集 |
| observability | 仅传播 OperationContext，未绑定后端 | BND-OPS-001 |
| infrastructure / 本地 Adapter | 时间、内存权限快照、Fake 子调用 | BND-INF-001 |

## 待实现边界与装配点

以下只登记组件责任与接口方向，不臆造未评审的完整方法签名，不创建空成功实现。正式签名继续以 contracts 设计评审为准。

| 归属 | 待实现组件 | 依赖方向 / 装配点 |
|---|---|---|
| control | ProtocolFacade、Gateway 完整协议、AgentRegistry、CapabilityRouter | 主机 → 控制入口；application 注入 |
| control | RunScheduler、RuntimePool、ResourceManager | 控制调度 → 认知执行及基础设施资源端口；application 注入 |
| control | SessionManager 持久化、RunRegistry 持久化、Attempt/Lease 恢复 | 控制 → 独立仓储 / Journal 端口；application 注入 |
| control | MemoryManager、SubagentCoordinator / ExecutionScope | Context → Memory；Child Run → Scheduler；application 注入 |
| security | ExecutionPermit、ApprovalBridge | 控制请求判定 / 审批；工具执行点消费 Permit；application 注入 |
| observability | Logging、Tracing、Metrics、TelemetryPipeline、HealthDiagnostics、SecurityAudit | 各职责 → 运维窄端口；禁止运维反向写领域状态 |
| infrastructure | StateStorage、ArtifactStorage、ExecutionCapacity、ProcessContainer、Transport、ModelEgress、SecretResolver | 消费者定义 Port，application 注入机制 Adapter |
| execution | 生产 Sandbox、远程 ToolProvider | tools → execution → 基础设施机制；application 注入 |

## 当前保留的限制

- Run/事件保存在内存，没有事务提交、Journal 或 UNKNOWN_SIDE_EFFECT 恢复流程。
- 现有单层委派仍通过 DelegationProviderPort；没有冒充 Scheduler 或完整 Child Run 聚合。
- Grant 仍为短时可复核授权，没有原子消费；原有 Sandbox create/terminate 端口由一次调用的 ToolExecutor 包装。
- 配置保留 objectModel 等现有键名以保持配置行为，其注释已调整为控制入口容量。
- 尚未具备完整执行信封和技术身份模型；当前快照隔离检查被保留。

## 验证入口

在本包执行 `npm run typecheck`、`npm test`、`npm run check:boundaries`、`npm run check:comments`、`npm run check:docs`。这些检查不表示候选文档已经通过完整评审。
