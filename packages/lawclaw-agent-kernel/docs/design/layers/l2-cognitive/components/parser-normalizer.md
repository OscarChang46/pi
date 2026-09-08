---
doc_id: L2-CMP-002
level: component
layer: L2 Cognitive Runtime
component: ParserNormalizer
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Kernel 规范事件与 ToolCallCandidate 的结构校验
parent: L2-DES-001
interfaces: [AgentAdapterPort, RuntimeEventPort]
diagrams: []
supersedes: []
---

# ParserNormalizer 组件设计

## 职责

ParserNormalizer 接收 Adapter 已经去除 Provider 私有类型的规范化事件，校验事件种类、顺序、大小、引用完整性和动作候选形状，并生成可由 L1 接受的 Kernel 事件。Provider 原始流、函数调用格式和专有错误的解析属于具体 Adapter，不属于本组件。

## 状态与不变量

组件无持久状态，只在单次解析窗口内持有有界缓冲。它不得补造缺失权限、推断 Tool Provider、改变参数语义或把非法输出宽松降级为可执行候选。任何不完整、超限或顺序冲突均失败关闭。

## 入站与出站 Port

入站是 `AgentAdapterPort` 的规范化事件流；出站是交给 AgentRuntime 的已验证事件和 `ToolCallCandidate`。候选仅表达动作意图与稳定引用，不包含 Permit，也不触发 L3。

## 算法与故障

按 Attempt 内序号增量验证，限制单帧与累计大小；结束时检查未闭合片段。未知事件版本、重复终态、终态后追加内容、引用越界或候选非法均返回规范化解析故障。诊断只记录脱敏摘要和详情引用。

## 契约边界

候选和事件的完整 DTO、版本兼容与错误码在 contracts 中定义；本文不复制字段清单。
