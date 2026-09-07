# CLI 子进程适配

## 职责

通过有界 JSONL 启动单层 Pi CLI 子调用并返回摘要。

## 边界与非职责

不负责父 Run 权威状态或 Scheduler，不允许递归委派。

## 接口、依赖与生命周期

仅由 CLI 扩展创建 PiCliDelegationProvider；任务通过 stdin 传入，取消向子进程传播，输出和退出宽限有界。

## 文件与子目录

- [index.ts](index.ts)
- [pi-cli-delegation-provider.ts](pi-cli-delegation-provider.ts)

## 设计依据

[对应设计](../../../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
