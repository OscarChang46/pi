# 组件必要性与详细设计范围审查

历史范围：资源分配部分已被ACR-2026-0012撤销；本页保留当时评审依据与结论，不能作为新FlowEngine系统协议的开发或验收要求。

日期2026-09-07；候选设计判断，不是用户批准或已验证实现。

## 37的来源

document-manifest.yaml列出38个组件文档：L1 13、L2 4、L3 3、L4 2、安全4、基础设施8、运维4。扣除已有详细设计FlowEngine得37，属于文档计数，不是37个独立实现模块的必要性证明。

## 筛选准则

有独立权威状态、复杂算法或独立失败生命周期才需要独立详细设计；机械转发只需契约；同一生命周期的内部职责一起实现；基础设施按机制契约交付；具体执行器需有启用场景与经过验证的隔离能力。能力有用不等于要独立成服务。

当前代码不等同目标架构：src/control/run-flow.ts仍在一个循环中协调Context、模型、工具与委派，类注释说明事件保存在内存、持久化后续提供。不能用同名文件存在证明目标设计完成。FlowEngine及相关代码在本轮开始已有工作区改动，本轮不修改这些文件。

## 分类

用户收窄范围后：本轮仅L1/L2/L3/Security的23项，即16个独立组件、3个内部职责、4个契约门面。其余14项（Infrastructure8、Operations4、L4执行机制2）不做本轮详细设计，只在各自目录保存必要依赖要求。所有既有能力保留。

| ID | 能力 | 分类 | 必要性与归属 |
|---|---|---|---|
| INF-CMP-001 | [state-storage](../../layers/infrastructure-plane/components/state-storage.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| INF-CMP-002 | [artifact-storage](../../layers/infrastructure-plane/components/artifact-storage.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| INF-CMP-003 | [execution-capacity](../../../governance/archive/flow-before-system-v1/execution-capacity.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| INF-CMP-004 | [process-container](../../layers/infrastructure-plane/components/process-container.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| INF-CMP-005 | [transport](../../layers/infrastructure-plane/components/transport.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| INF-CMP-006 | [model-egress](../../layers/infrastructure-plane/components/model-egress.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| INF-CMP-007 | [secret-resolver](../../layers/infrastructure-plane/components/secret-resolver.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| INF-CMP-008 | [clock-time](../../layers/infrastructure-plane/components/clock-time.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| L1-CMP-001 | [protocol-facade](../../layers/l1-control/components/protocol-facade.md) | 契约门面 | 只冻结输入输出、错误与版本，不新增状态所有者 |
| L1-CMP-002 | [agent-system-gateway](../../layers/l1-control/components/agent-system-gateway.md) | 契约门面 | 只冻结输入输出、错误与版本，不新增状态所有者 |
| L1-CMP-003 | [agent-registry](../../layers/l1-control/components/agent-registry.md) | 独立组件 | AgentRegistry：聚合命令 |
| L1-CMP-004 | [capability-router](../../layers/l1-control/components/capability-router.md) | 独立组件 | CapabilityRouter：取得冻结输入 |
| L1-CMP-005 | [session-manager](../../layers/l1-control/components/session-manager.md) | 独立组件 | SessionManager：唯一聚合命令 |
| L1-CMP-006 | [run-registry](../../layers/l1-control/components/run-registry.md) | 独立组件 | RunRegistry：Run规则与事务入口 |
| L1-CMP-007 | [run-scheduler](../../layers/l1-control/components/run-scheduler.md) | 独立组件 | RunScheduler：有界FIFO调度 |
| L1-CMP-009 | [context-engine](../../layers/l1-control/components/context-engine.md) | 独立组件 | ContextEngine：只读组装 |
| L1-CMP-010 | [memory-manager](../../layers/l1-control/components/memory-manager.md) | 独立组件 | MemoryManager：Space与候选入口 |
| L1-CMP-011 | [resource-manager](../../../governance/archive/flow-before-system-v1/resource-manager.md) | 独立组件 | ResourceManager：计算请求类别及进程档案上限 |
| L1-CMP-012 | [runtime-pool](../../../governance/archive/flow-before-system-v1/runtime-pool.md) | 内部职责 | 随run-scheduler交付，保留原层与Port归属 |
| L1-CMP-013 | [subagent-coordinator（已撤回归档）](../../../governance/archive/flow-before-system-v1/subagent-coordinator-withdrawn-2026-09-08.md) | 独立组件（历史分类） | SubagentCoordinator：结构化并发入口 |
| L2-CMP-001 | [agent-runtime-loop](../../layers/l2-cognitive/components/agent-runtime-loop.md) | 独立组件 | AgentRuntime：接收一个已提交模型步骤 |
| L2-CMP-002 | [parser-normalizer](../../layers/l2-cognitive/components/parser-normalizer.md) | 内部职责 | 随agent-runtime-loop交付，保留原层与Port归属 |
| L2-CMP-003 | [agent-adapter-boundary](../../layers/l2-cognitive/components/agent-adapter-boundary.md) | 契约门面 | 只冻结输入输出、错误与版本，不新增状态所有者 |
| L2-CMP-004 | [pi-agent-adapter](../../layers/l2-cognitive/components/pi-agent-adapter.md) | 独立组件 | PiAgentAdapter：实现公共Adapter |
| L3-CMP-001 | [tool-catalog-router](../../layers/l3-tool-runtime/components/tool-catalog-router.md) | 独立组件 | ToolCatalogRouter：目录快照用例 |
| L3-CMP-002 | [tool-call-runtime](../../layers/l3-tool-runtime/components/tool-call-runtime.md) | 独立组件 | ToolCallRuntime：唯一ToolCall聚合 |
| L3-CMP-003 | [tool-execution-guard](../../layers/l3-tool-runtime/components/tool-execution-guard.md) | 内部职责 | 随tool-call-runtime交付，保留原层与Port归属 |
| L4-CMP-001 | [tool-provider-adapter](../../layers/l4-execution-runtime/components/tool-provider-adapter.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| L4-CMP-002 | [sandbox-runtime](../../layers/l4-execution-runtime/components/sandbox-runtime.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| OPS-CMP-001 | [telemetry-pipeline](../../layers/operations-plane/components/telemetry-pipeline.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| OPS-CMP-002 | [logging-tracing-metrics](../../layers/operations-plane/components/logging-tracing-metrics.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| OPS-CMP-003 | [health-diagnostics](../../layers/operations-plane/components/health-diagnostics.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| OPS-CMP-004 | [security-audit](../../layers/operations-plane/components/security-audit.md) | 本轮范围外 | 仅在对应目录记录Kernel依赖要求 |
| SEC-CMP-001 | [permission-decision-engine](../../layers/security-plane/components/permission-decision-engine/README.md) | 独立组件 | PermissionDecisionEngine：安全用例 |
| SEC-CMP-002 | [execution-permit](../../layers/security-plane/components/execution-permit.md) | 独立组件 | PermitService：生命周期命令 |
| SEC-CMP-003 | [pep-enforcement](../../layers/security-plane/components/pep-enforcement/README.md) | 契约门面 | 只冻结输入输出、错误与版本，不新增状态所有者 |
| SEC-CMP-004 | [approval-bridge](../../layers/security-plane/components/approval-bridge.md) | 独立组件 | ApprovalBridge：耐久投递与回写 |

## 首版避免的复杂度

- RuntimePool先作为Scheduler的薄调用适配，单个embedded Runtime即可；多个Runtime/Sidecar能力不意味着立即建设池服务。
- Parser可独立测试但属于L2内部；Guard是L3内部安全模块，合并交付不能省略强制检查。
- ResourceManager拥有准入规则，ExecutionCapacity实现唯一信号量/FIFO，禁止双重排队与计数。
- LoggingTracingMetrics是TelemetryPipeline内部Sink；SecurityAudit因耐久且失败关闭保持独立。
- Registry/Router支持目标多定义架构；单Agent档案只需冻结一条定义、确定性匹配，不引入动态注册中心和权重框架。
- Memory/Child保留既有目标能力；不增加团队角色、通信和仲裁框架。
- Sandbox/Process/具体Provider实现以明确启用条件为边界；文档有设计不代表当前宿主具有恶意代码隔离保证。

五角色必须进一步检查这些分类，发现冗余或遗漏应在评审记录说明具体后果，不能按文档数量批准。

## 用户范围修订

运维和基础设施等外部边界不属于本轮设计对象。移出它们的组件实现设计与测试任务，只保留[基础设施依赖](../../layers/infrastructure-plane/kernel-dependencies.md)、[运维依赖](../../layers/operations-plane/kernel-dependencies.md)、[L4依赖](../../layers/l4-execution-runtime/kernel-dependencies.md)。五个角色评审均只对Kernel内部设计给出就绪结论。
