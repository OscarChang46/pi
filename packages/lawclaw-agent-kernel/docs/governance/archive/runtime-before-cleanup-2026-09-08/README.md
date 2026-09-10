# Runtime历史材料清理记录

2026-09-08按用户要求清理活动运行文档。10份设计草稿移出runtime；两份旧运行说明留存历史版本，活动版本改为当前装配入口说明。归档不是批准，也不表示草稿所有建议已落实；未确认选择和独有场景留存本目录，不再列为当前运行指引。

## 后继位置与处理理由

| 原材料 | 处理理由 | 当前阅读入口 |
|---|---|---|
| design-drafts/2026-09-06/README.md | 联合草稿导航不再作为活动设计入口 | [总设计](../../../design/agent-kernel-design.md) |
| host-gateway.md | 候选Host流程混入运行目录；已有分层设计和真实HTTP装配 | [Gateway](../../../design/layers/l1-control/components/agent-system-gateway.md)、[部署](../../../design/deployment/composition-root.md) |
| agent-registry-routing.md | 注册与路由已有独立组件设计 | [Registry](../../../design/layers/l1-control/components/agent-registry.md)、[Router](../../../design/layers/l1-control/components/capability-router.md) |
| control-scheduling.md | 旧资源组件已撤回；不能继续指导当前实现 | [RunScheduler](../../../design/layers/l1-control/components/run-scheduler.md)、[FlowEngine](../../../design/layers/l1-control/components/flow-engine/README.md) |
| context-memory-subagents.md | 混合Session/Context/Memory/Child职责，旧协调归属已演进 | [Session](../../../design/layers/l1-control/components/session-manager.md)、[Context](../../../design/layers/l1-control/components/context-engine.md)、[Memory](../../../design/layers/l1-control/components/memory-manager.md) |
| security-approval-permits.md | 旧授权草稿未含后续完整启动与审计闭环 | [安全层](../../../design/layers/security-plane/README.md)、[CD-1](../../../design/contracts/component-development-contracts-v1.md) |
| tool-execution.md | 旧资源分配和执行草稿不应与L3设计并列 | [L3](../../../design/layers/l3-tool-runtime/README.md)、[L4](../../../design/layers/l4-execution-runtime/README.md) |
| storage-journal-recovery.md | “无Journal”仅适用旧内存路径；已有持久Flow装配 | [存储](../../../design/layers/infrastructure-plane/components/state-storage.md)、[Artifact](../../../design/layers/infrastructure-plane/components/artifact-storage.md) |
| observability-infrastructure.md | 外部机制提案不属于当前运行事实 | [运维依赖](../../../design/layers/operations-plane/kernel-dependencies.md)、[基础设施依赖](../../../design/layers/infrastructure-plane/kernel-dependencies.md) |
| context-assembler-responsibilities-and-flows.md | 正文已明确被组件设计归并替代 | [Context](../../../design/layers/l1-control/components/context-engine.md) |
| framework-boundaries.md、pi-kernel-runtime.md | 未区分内存与持久装配，仍使用旧组件目标和全局无Journal断言 | [当前运行说明](../../../runtime/pi-kernel-runtime.md)、[当前装配映射](../../../runtime/framework-boundaries.md) |

## 迁移清单

原始SHA-256对应迁移前全文；归档只增加历史标记并重定位相对链接，原章节、决策和场景保留。正文中的“当前”“待实现”等均为历史表述。

| 原runtime路径 | 保存位置 | 原始SHA-256 |
|---|---|---|
| `design-drafts/2026-09-06/README.md` | [历史正文](design-drafts/2026-09-06/README.md) | `fc13ff5ca2caf9356125a3df27229ea5c0262d39dc6e7a04861f7609fcb6f704` |
| `design-drafts/2026-09-06/agent-registry-routing.md` | [历史正文](design-drafts/2026-09-06/agent-registry-routing.md) | `618d680225b4ada7cabca889ee5bd7819c199f2b5a58ceaed67f01bba0951786` |
| `design-drafts/2026-09-06/context-memory-subagents.md` | [历史正文](design-drafts/2026-09-06/context-memory-subagents.md) | `d6e6dc16e95d1ed4510952b696c26761b6b066863e32f3a1da3d02cfb25545ff` |
| `design-drafts/2026-09-06/control-scheduling.md` | [历史正文](design-drafts/2026-09-06/control-scheduling.md) | `3b23c96b7804cd2319042ff9224f80b49b60e23680cb08ea99f16a288b97606f` |
| `design-drafts/2026-09-06/host-gateway.md` | [历史正文](design-drafts/2026-09-06/host-gateway.md) | `7329256149fb7e28834e8dda97b5b55c0bf167b460442147150e68433b921124` |
| `design-drafts/2026-09-06/observability-infrastructure.md` | [历史正文](design-drafts/2026-09-06/observability-infrastructure.md) | `081720d9cf199faaea9d597e2dca7082a74b95c92c2bad70bca106a0d2dd7a3c` |
| `design-drafts/2026-09-06/security-approval-permits.md` | [历史正文](design-drafts/2026-09-06/security-approval-permits.md) | `1fe539b11a8bc2b2e45a1fbdacabdc7021774930a7b6ed0965bda5f6fa1b69c1` |
| `design-drafts/2026-09-06/storage-journal-recovery.md` | [历史正文](design-drafts/2026-09-06/storage-journal-recovery.md) | `4e41adcedcd6b3bf6f5a579e5115b77a7874d6104af17c876f00d8b04a23bdf6` |
| `design-drafts/2026-09-06/tool-execution.md` | [历史正文](design-drafts/2026-09-06/tool-execution.md) | `5df9a0f13a3de903488af451c1cd14229c1ece7ae51f2e0e3e86314d37ae35fd` |
| `design-drafts/2026-09-07/context-assembler-responsibilities-and-flows.md` | [历史正文](design-drafts/2026-09-07/context-assembler-responsibilities-and-flows.md) | `71a2378c3f8cb41089a379297b7e68c8f17edd872d353df283b97e8cf2ea8637` |
| `framework-boundaries.md` | [历史正文](framework-boundaries.md) | `50060959e3c6c6c6278a3e14d44ed8b10c35673c6856fb55f7fd52d29c378f00` |
| `pi-kernel-runtime.md` | [历史正文](pi-kernel-runtime.md) | `0afa2be87f590082a9a5cdb4b50f7176d5e1cf4ac884d95d51aecb9d2981a3f6` |
