# 工具目录与执行检查

## 职责

维护版本化描述目录，复核 Grant 的绑定、时效、撤销版本和停止状态，再通过 ToolExecutionPort 派发。

## 边界与非职责

不判定新权限，不创建沙箱，不直接调用 Provider，不声称具备一次性 Permit。

## 接口、依赖与生命周期

入口 ToolRuntime；依赖 GrantValidationPort、KillSwitchPort、TimePort 与 ToolExecutionPort。停止订阅随单次调用创建并在 finally 关闭。

## 文件与子目录

- [index.ts](index.ts)
- [tool-runtime.ts](tool-runtime.ts)

## 设计依据

[对应设计](../../docs/design/layers/l3-tool-runtime/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
