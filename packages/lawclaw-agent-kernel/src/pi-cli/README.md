# Pi CLI 集成

## 职责

launcher 启动固定版本 Pi；extension 装配只读工具协调链与受限委派。

## 边界与非职责

不改变 Pi 核心，不提供业务服务 API，不启用 Shell 或文件写入。

## 接口、依赖与生命周期

唯一允许直接使用 Pi ExtensionAPI 的边界；工具通过 createToolCoordinator 调用，委派通过 DelegationEngine。CLI 原生 Loop 不等同于程序化 AgentRuntime。

## 文件与子目录

- [adapters](adapters/README.md)
- [extension.ts](extension.ts)
- [index.ts](index.ts)
- [launcher.ts](launcher.ts)

## 设计依据

[对应设计](../../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
