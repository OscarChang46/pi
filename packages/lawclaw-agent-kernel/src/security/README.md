# 技术安全

## 职责

对已编译快照计算权限交集，生成和复核现有 Grant，维护内存紧急停止状态。

## 边界与非职责

不认证用户、不解释 RBAC、不执行业务审批或工具，不实现一次性 Permit。

## 接口、依赖与生命周期

PermissionDecisionPort 供控制层使用，GrantValidationPort 供工具守卫使用；快照通过 Port 读取。Grant 仅提供内容绑定与时效校验，未提供原子消费。

## 文件与子目录

- [index.ts](index.ts)
- [kill-switch.ts](kill-switch.ts)
- [permission-approval.ts](permission-approval.ts)

## 设计依据

[对应设计](../../docs/design/layers/security-plane/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
