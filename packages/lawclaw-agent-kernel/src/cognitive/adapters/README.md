# Pi 模型适配

## 职责

封装 Pi 原生流、模型选择与私有消息引用缓存。

## 边界与非职责

不将原生类型导出到核心，不执行工具，不使用 Pi 原生 Agent Loop。

## 接口、依赖与生命周期

既有入口调用createPiAdapter；耐久Flow调用createConfiguredFlowModel。原生消息仍封装在Adapter内，通过AdapterMessageStore保存并按租户、模型校验后恢复；未注入该端口时仍只有有界进程内缓存。

## 文件与子目录

- [index.ts](index.ts)
- [pi-adapter-factory.ts](pi-adapter-factory.ts)
- [pi-agent-adapter.ts](pi-agent-adapter.ts)

## 设计依据

[对应设计](../../../docs/design/layers/l2-cognitive/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
