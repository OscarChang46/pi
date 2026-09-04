---
doc_id: SYS-CON-003
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "边界契约、公共元数据或契约语义的唯一来源"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: [docs/design/c4-boundary-protocols.md]
---

# 契约交付与兼容语义

## 全局规则

- 消息、事件、流窗口和队列均有配置上限；禁止无界 Buffer。
- 查询可有限重试；幂等命令用相同 command/idempotency key 重试。
- 请求超时不等于动作未执行；有副作用的操作超时后先查询权威状态。
- 持久事件按至少一次与稳定 ID 去重；瞬时进度和普通遥测允许有界丢失。
- 系统不宣称端到端 exactly-once；未知外部副作用进入 `UNKNOWN_SIDE_EFFECT` 并失败关闭。
- TypeScript Port 与 JSONL Schema 使用语义版本；不兼容变化提升主版本。未知必填语义拒绝，不猜测降级。

## 绑定规则

首版为 Local Embedded/Sidecar：进程内 Port、本地有界队列、SQLite 事务、必要时 stdio JSONL。gRPC、Temporal、Event Bus、MicroVM/Vsock、跨主机 mTLS 与远程 OTLP 只在新的 ACR 说明触发条件后启用。

## 错误与安全

HTTP/gRPC 状态只表达传输类别，稳定 `BoundaryError.code` 表达原因。每个入口校验大小、截止时间、服务身份、执行信封作用域和授权 epoch。Raw Token、Secret、Prompt、Memory 正文、工具参数与物理路径不得进入错误或遥测。
