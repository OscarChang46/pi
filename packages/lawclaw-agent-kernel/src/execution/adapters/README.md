# 只读执行适配器

## 职责

提供受工作区约束的只读文件工具与进程内协作沙箱。

## 边界与非职责

不提供 OS 隔离、文件写入、网络、Secret、子进程或强制终止。

## 接口、依赖与生命周期

由应用装配；只实现规范化 Provider/Sandbox 端口。文件路径经 realpath 检查，能力不足时拒绝，不回退为无隔离执行。

## 文件与子目录

- [in-process-read-only-sandbox.ts](in-process-read-only-sandbox.ts)
- [index.ts](index.ts)
- [read-only-tool-provider.ts](read-only-tool-provider.ts)

## 设计依据

[对应设计](../../../docs/design/layers/l4-execution-runtime/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
