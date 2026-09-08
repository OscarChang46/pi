# 受控执行

## 职责

ToolExecutor 执行已检查的调用；SandboxPlanner 把现有 Grant 收敛为执行计划。

## 边界与非职责

不选择模型可见工具，不裁决授权，不持有 Run 权威状态，不自动重试。

## 接口、依赖与生命周期

只从 tools 的 ToolExecutionPort 进入；依赖 SandboxPort、ToolProviderPort。沙箱创建成功后，无论成功、取消或失败均在 finally 清理。

## 文件与子目录

- [adapters](adapters/README.md)
- [index.ts](index.ts)
- [sandbox-planner.ts](sandbox-planner.ts)
- [tool-executor.ts](tool-executor.ts)

## 设计依据

[对应设计](../../docs/design/layers/l4-execution-runtime/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
