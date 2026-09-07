# 基础设施边界

## 职责

隔离时间、快照存储与本地测试机制；其余机制仅登记待实现边界。

## 边界与非职责

不包含调度、路由、业务规则或权限判定。

## 接口、依赖与生命周期

index.ts 导出规范化时间端口；具体机制在 adapters，由 application 注入。未来数据库、网络和进程机制不得反向驱动 Run。

## 文件与子目录

- [adapters](adapters/README.md)
- [index.ts](index.ts)

## 设计依据

[对应设计](../../docs/design/layers/infrastructure-plane/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
