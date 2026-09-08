---
doc_id: L2-CMP-004
level: component
layer: L2 Cognitive Runtime
component: PiAgentAdapter
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Pi 原生协议适配、私有模型调用与规范事件映射
parent: L2-DES-001
interfaces: [AgentAdapterPort, BND-MOD-001]
diagrams: []
supersedes: []
---

# PiAgentAdapter 组件设计

## 职责

PiAgentAdapter 实现 `AgentAdapterPort`，在 Adapter 私有边界内完成 Pi 请求构造、Provider 调用、流解析、函数调用候选归一化、用量采集和错误映射。Pi 原生 Session、Message、Tool、Event 与 Provider 类型不得越过该边界。

## 私有协作者

Pi Adapter 可以定义私有 `ModelInvocationPort`，用于封装 Provider SDK、HTTPS/SSE、密钥装配和有限重试。该 Port 不被 AgentRuntime、L1 或其他 Adapter 引用，也不进入公共 contracts。

## 状态与生命周期

Adapter 保存的流游标、Provider 请求标识和解析缓冲均为单次调用临时状态；Kernel 的 Session/Run 不能映射为 Provider 进程或原生 Session 所有权。实例由 Composition Root 创建，并接收作用域化的模型出口和 Secret 解析能力。

## 归一化规则

文本、推理摘要、用量、终止原因和动作候选转换为 Kernel 规范事件；Provider 私有字段只可形成脱敏详情引用。Pi 返回的工具调用只是 `ToolCallCandidate`，不得在 Adapter 内执行、授权或重试工具。

## 故障与资源边界

调用遵守端到端 Deadline、最大帧、最大累计输出和取消信号。流中断或结束状态不明时返回未知结果故障，由 L1 决定 Attempt 后续动作。日志不得记录密钥、完整 Prompt 或原始敏感输出。

## 契约边界

本文不冻结 Pi CLI/SDK 版本、Provider 配置字段或 `ModelInvocationPort` 签名。
