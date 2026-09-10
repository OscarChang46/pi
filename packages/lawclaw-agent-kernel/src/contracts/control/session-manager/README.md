# SessionManager 契约

## 职责

定义 SessionManager 可公开复用的封闭状态和值对象，不包含仓储、协调或执行实现。

## 边界

`ActiveRunBinding` 只表示 Session 当前占用，不复制 AgentRun 状态、历史 Run、权限对象或 ContextFrame 正文。状态常量由 [session-manager-contract.ts](session-manager-contract.ts) 唯一定义。

## 设计依据

[SessionManager 数据契约](../../../../docs/design/contracts/component-development-contracts-v1.md#session-manager)。
