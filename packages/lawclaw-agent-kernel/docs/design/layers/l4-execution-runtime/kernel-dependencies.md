# Kernel对本目录的依赖要求

> 历史轮次范围说明：以下内容保留 CD-1 时期调用方需求，不代表 L4 是系统外部组件。2026-09-09 已按用户要求细化 L4 内部架构，当前入口见 [L4 层设计](README.md)，新增候选结构见 [L4-DD-1](../../contracts/l4-execution-runtime-detail.md)。本文旧 ExecutionPlan/ExecutionResult 不与 L3-FD-2 拼接使用；字段冲突和联合冻结项见 L4-DD-1 的 B1/B2。

本轮范围说明：这是Kernel内部详细设计所需的输入输出与保证，不是本目录组件详细设计、外部产品选型或实现任务。既有概要保留；外部所有者实现前须提供满足这些契约的Adapter。Kernel测试用Faux依赖验证正确使用边界，不用替身证明外部服务已实现。

所有调用传播可信Scope、稳定commandId与Deadline；依赖不可验证时Kernel停止新受保护动作。下面是调用方需求规格，版本CD-1，未发布为公共Schema。

2026-09-09：L3-FD-2调用档案的ExecutionPlan/L4Reply/L4Query/L4Cancel以[BND-L34-001](../../contracts/bnd-l34-001.md)为唯一当前定义。下方旧CD-1同名执行请求/响应为历史兼容说明，不适用于新L3入口；ExecutionLimits及Sandbox机制要求继续有效。不得混用两种plan或以旧字段缺省填充新请求。

## 调用方必需保证

L3是唯一执行调用方。L4仅接受经Guard形成的内部执行计划，不扩大路由/资源范围，不隐藏重试；支持时按原commandId查询事实，不支持查询明确UNKNOWN。外部取消不代表物理回滚。Sandbox能力未被验证则Kernel不得把不可信代码交给宿主Shell；具体隔离产品和进程生命周期不在本轮。

首版Kernel要求工具调用默认60秒、输出256KiB且上游可缩短；CPU/内存/pids等是目录描述及授权绑定的硬限制，实际限额能力由外部Adapter证明。具体实现前需本目录自己的设计与验收，不能由本轮文档默认批准。

<a id="tool-provider-adapter"></a>

### L4-CMP-001 tool-provider-adapter

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：ExecutionPlan={commandId:Ref,routeRef:Ref,argumentsRef:Artifact,scopeRef:Ref,startGrantRef:Ref,deadlineAtMs:Millis,limits:ExecutionLimits}; ProviderReceipt={providerRequestRef:Ref,querySupported:Bool}; ExecutionResult={outcome:success|failed,effect:Effect,resultRef:Artifact|null,providerReceipt:ProviderReceipt|null}。

操作：execute(ExecutionPlan)->ExecutionResult; inspect({commandId:Ref,providerReceipt:ProviderReceipt|null})->ExecutionQuery; cancel({commandId:Ref,providerReceipt:ProviderReceipt|null})->CancelExecutionResult；仅L3通过受控装配句柄调用。



<a id="sandbox-runtime"></a>

### L4-CMP-002 sandbox-runtime

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：SandboxExecution={commandId:Ref,environmentRef:Ref|null,phase:preparing|limited|running|collecting|reclaiming|done|reclaim_pending}; ExecutionLimits={cpuMillis:Count,memoryBytes:Count,pids:Count,diskBytes:Count,outputBytes:Count,network:deny|scoped,mountsRef:Ref}。机制事实由Process Adapter持久化。

操作：execute(ExecutionPlan)->ExecutionResult; inspect({commandId:Ref})->ExecutionQuery; cancel({commandId:Ref})->CancelExecutionResult；出站Process/Artifact/Capacity/Clock，不能用宿主Shell兜底。
