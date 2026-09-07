# 应用装配

## 职责

创建并连接控制、认知、安全、工具与执行组件；提供配置化本地入口。

## 边界与非职责

不处理业务编排，不直接使用 Pi 原生类型，不提供缺失安全依赖的默认放行。

## 接口、依赖与生命周期

composition-root.ts 返回 AgentSystem；tool-composition.ts 装配工具链；run-kernel.ts 是可执行本地 Faux 入口。具体 Adapter 只在装配边界创建。

## 文件与子目录

- [composition-root.ts](composition-root.ts)
- [index.ts](index.ts)
- [run-kernel.ts](run-kernel.ts)
- [tool-composition.ts](tool-composition.ts)

## 设计依据

[对应设计](../../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
