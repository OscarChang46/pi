---
doc_id: BND-EXT-001
level: contract
layer: cross-layer
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "BND-EXT-001 Client/Backend 与 L1 的边界契约"
parent: SYS-DES-001
interfaces: [BND-EXT-001]
diagrams: []
supersedes: [docs/design/c4-boundary-protocols.md]
---

# BND-EXT-001：Client / Backend ↔ L1

## 操作族

`startRun` 幂等受理 Root Run；`getRun` 查询权威快照；`cancelRun` 幂等请求取消；`readRunEvents` 按序号补拉持久事件；`subscribeRunEvents` 提供可恢复订阅。具体签名与 DTO 待步骤二确认。

## 语义

Kernel 写命令只返回已持久化受理结果或既有幂等结果，不等待运行完成。原程序化 CLI 可用进程内绑定；新 LawClaw TUI 档案明确使用本机 HTTP/SSE，Desktop Host 的 stdio JSONL 档案不变。断线不取消 Run；取消必须显式发命令。Backend/KernelHost 在进入 Kernel 前终止原始 User Token 与租户身份，只传可信 `executionEnvelopeRef`。

新客户端协议见 [TUI-CON-001](kernel-tui-contract.md)。Host 的 submitConversation 接收首次会话意图，先按 CTX-CON-1 完成候选准备及 Session 确认，再通过 Facade/Gateway start；preparing 只表示 Host 准备记录耐久，accepted 才表示 Run 受理。低层 start 不创建未准备的空 Session，TUI 也不负责调用 ensure/Context。完整接口仍为候选，不代表现有 HTTP 已支持。

## 恢复

相同 command/idempotency key 与相同载荷返回同一 Run；异载荷稳定冲突。订阅以最后确认序号补拉，服务端 Snapshot/version 为权威。
