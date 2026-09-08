# 认知执行

## 职责

AgentRuntime 执行控制层传来的单轮快照，归一化终态并交还候选。下一轮的新 Frame 承接工具结果。

## 边界与非职责

不保存 Session/Run 目录，不执行工具、决定权限或创建 Child Run。

## 接口、依赖与生命周期

只依赖 contracts 中的 AgentAdapter。取消传递给模型端口；缺少或重复终态报协议错误。

## 文件与子目录

- [adapters](adapters/README.md)
- [agent-runtime.ts](agent-runtime.ts)
- [index.ts](index.ts)

## 设计依据

[对应设计](../../docs/design/layers/l2-cognitive/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
