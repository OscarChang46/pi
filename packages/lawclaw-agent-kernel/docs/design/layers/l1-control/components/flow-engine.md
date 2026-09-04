---
doc_id: L1-CMP-008
level: component
layer: L1 Control & Orchestration Runtime
component: FlowEngine
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 无状态 FlowEngine Core 的推进输入、决策类别、不变量与失败收敛
parent: L1-DES-001
interfaces: [FlowAdvancePort]
diagrams: []
supersedes: [session-flow-engine-resource-subsystem-design.md 与 flow-engine-detailed-design.md 中的有效 FlowEngine 内容]
---

# FlowEngine 组件设计

## 1. 目标与非目标

FlowEngine 是无状态、确定性的 Run 推进算法：读取不可变且版本相容的 Run、Session、Context 和规范化 RuntimeEvent，计算下一技术状态与命令意图。

它不消费消息、不直接读写 Repository、不持有 Session、不调用模型、不解析 Provider 私有输出、不判权限、不调用 Tool/Sandbox，也不设计业务 Workflow。

## 2. 状态与绝对边界

组件没有持久状态或跨调用可变缓存。相同规范化输入和同一规则版本必须产生相同 decision digest。状态所有权仍在 RunRegistry、SessionManager 和 MemoryManager；FlowEngine 输出的命令只有经各自 Port 成功提交后才成为事实。

```text
不可变快照 + 规范化事件
  -> 校验版本、终态、取消、Deadline 和预算
  -> 计算一个 AdvanceDecision
  -> 调用方按命令类型经权威 Port 提交
  -> CAS 冲突则丢弃决策并重算
```

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `FlowAdvancePort` | 对不可变输入执行一次纯推进 |
| 出站 | 无直接 I/O Port | Core 返回命令意图；调用方分别使用 Run、Context、安全、工具或 Child Run Port |

Provider 输出解析属于 L2 Adapter；L2 Parser 只校验规范化事件和 `ToolCallCandidate`。FlowEngine 不接收 Provider 原生 chunk。

## 4. 推进规则

1. 拒绝版本组合不兼容、终态、已取消或 Deadline 到期的输入。
2. 对重复 sequence 返回幂等无操作，对缺口或乱序事件拒绝推进。
3. 根据当前 Step 与规范化事件计算：请求 Context、请求模型、提交动作候选、挂起、创建/等待 Child、完成或失败之一。
4. 每次输出命令数量受硬上限；终态决策不得附带外部动作。
5. ToolCallCandidate 只生成回到 L1 控制路径的动作意图，绝不直接到 L3。

## 5. 韧性与可观测性

- CAS 冲突后旧 decision 必须销毁，不得重用其命令。
- 未知事件、无效转换和预算耗尽采用显式失败或安全挂起，不猜测继续。
- 重启无需恢复 FlowEngine 内存；运行状态完全来自外部快照与事件。
- 记录 advance 耗时、decision 类别、digest、输入版本和冲突重算；不记录完整 Context。

## 6. 验收

- 性质测试证明确定性、终态封闭、重复事件幂等、序列单调和命令数量有界。
- FlowEngine 对 Repository、Permission、ToolRuntime、Sandbox、模型 SDK 和消息总线的直接依赖为零。
- Host 在提交前崩溃可从旧版本重算；提交后 ACK 前崩溃不会重复已提交命令。
- 无有效 Permit 时，任何 FlowEngine 输出都不能触发物理副作用。
