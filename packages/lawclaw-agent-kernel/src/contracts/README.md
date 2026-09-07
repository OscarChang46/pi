# 共享契约

## 职责

定义规范化输入输出、窄 Port、授权绑定和值校验。

## 边界与非职责

不导入任何职责实现，不冻结尚未评审的完整 V3.1 协议。

## 接口、依赖与生命周期

types.ts 承载既有模型边界；control.ts、tool-runtime.ts、permissions.ts 分别表达控制、工具与安全接口。type-only 引用仅描述结构，不引入运行时依赖。

## 文件与子目录

- [authorization-digest.ts](authorization-digest.ts)
- [control.ts](control.ts)
- [errors.ts](errors.ts)
- [index.ts](index.ts)
- [kill-switch.ts](kill-switch.ts)
- [permissions.ts](permissions.ts)
- [request-context-guard.ts](request-context-guard.ts)
- [sandbox-digest.ts](sandbox-digest.ts)
- [tool-runtime.ts](tool-runtime.ts)
- [tool-scope.ts](tool-scope.ts)
- [tool-security.ts](tool-security.ts)
- [types.ts](types.ts)

## 设计依据

[对应设计](../../docs/design/contracts/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
