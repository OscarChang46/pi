---
doc_id: L4-CMP-002
level: component
layer: L4 Execution Runtime
component: SandboxRuntime
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 一次性有界 Sandbox execute 生命周期与隔离不变量
parent: L4-DES-001
interfaces: [SandboxPort]
diagrams: []
supersedes: ["[归档工具调用子系统设计](../../../../governance/archive/design-v3-pre-layering/tool-call-subsystem-design.md) 中 SandboxPort 与沙箱生命周期部分"]
---

# SandboxRuntime 组件设计

## 职责

SandboxRuntime 实现一次性、有界的 `SandboxPort.execute`：为单个已授权工具动作建立隔离环境，注入最小输入和作用域化能力，执行后采集有界结果并可靠回收。远程 Tool Provider 不复用 SandboxPort，而通过独立 ToolProviderPort 调用。

## 生命周期与不变量

每次 execute 均经历准备、限制、启动、运行、收集、回收并终结；环境不跨 ToolCall 复用，不代表 AgentSession、AgentRuntime 或工作流实例。L4 入口仅供 L3 调用，Sandbox 内不存在可绕过 Guard 的公共执行 API。

隔离策略至少在语义上限制 Deadline、CPU、内存、进程数、文件范围、网络出口、输入输出大小和可见 Secret；能力默认拒绝并只能缩小。业务 stdout 与控制协议必须分离，超限立即终止并进入回收。

## 入站与出站 Port

入站是已由 L3 校验消费 Permit 后形成的冻结执行计划；出站是有界结果、Artifact 引用、资源使用摘要和规范故障。Sandbox 不读取 Permit、不调用 PDP、不持久化 ToolCall。

## 取消、恢复与故障

取消或 Deadline 触发后先阻止新子进程和网络动作，再终止执行树并回收临时资源。宿主崩溃后通过 Infrastructure 清理扫描回收遗留资源；执行结果未知时返回未知状态，不自动再次执行。回收失败必须产生运维与安全审计信号。

## 契约边界

本文不冻结容器/MicroVM 产品、命令 DTO、挂载结构、网络策略格式或具体资源默认值。
