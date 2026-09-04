---
doc_id: BND-EXT-001
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "边界契约、公共元数据或契约语义的唯一来源"
parent: SYS-DES-001
interfaces: [BND-EXT-001]
diagrams: []
supersedes: [docs/design/c4-boundary-protocols.md]
---

# BND-EXT-001：Client / Backend ↔ L1

## 操作族

`startRun` 幂等受理 Root Run；`getRun` 查询权威快照；`cancelRun` 幂等请求取消；`readRunEvents` 按序号补拉持久事件；`subscribeRunEvents` 提供可恢复订阅。具体签名与 DTO 待步骤二确认。

## 语义

写命令只返回已持久化受理结果或既有幂等结果，不等待运行完成。CLI 默认进程内绑定，Desktop Host 默认 stdio JSONL，Loopback HTTP/SSE 可选。断线不取消 Run；取消必须显式发命令。Backend/KernelHost 在进入 Kernel 前终止原始 User Token 与租户身份，只传可信 `executionEnvelopeRef`。

## 恢复

相同 command/idempotency key 与相同载荷返回同一 Run；异载荷稳定冲突。订阅以最后确认序号补拉，服务端 Snapshot/version 为权威。
