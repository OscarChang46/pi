# 运维边界

## 职责

声明 OperationContext 的传播边界，并登记后续日志、追踪、指标、健康与审计装配点。

## 边界与非职责

当前没有日志管线、审计耐久写入或指标后端实现。

## 接口、依赖与生命周期

index.ts 只导出既有 OperationContext；实际可见事件仍是 Run 返回的内存 AgentEvent。不得反向修改领域状态或决定授权。

## 文件与子目录

- [index.ts](index.ts)

## 设计依据

[对应设计](../../docs/design/layers/operations-plane/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
