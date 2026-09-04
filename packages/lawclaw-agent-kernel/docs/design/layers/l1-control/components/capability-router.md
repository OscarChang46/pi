---
doc_id: L1-CMP-004
level: component
layer: L1 Control & Orchestration Runtime
component: CapabilityRouter
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: 能力匹配、技术候选排序和 RouteProposal 生成
parent: L1-DES-001
interfaces: [CapabilityRoutingPort, AgentRegistryQueryPort, AdapterCapabilityPort]
diagrams: []
supersedes: [agent-registry-routing-subsystem-design.md 中的路由内容]
---

# CapabilityRouter 组件设计

## 1. 目标与非目标

CapabilityRouter 把已验证的能力要求与已发布 Agent 描述、Adapter 技术能力和健康信息进行匹配，输出可解释的 `RouteProposal`。它不创建 Run、不冻结路由、不解释业务价值或优先级，也不实例化 Adapter。

## 2. 状态与不变量

本组件无持久权威状态。`RouteProposal` 是带候选版本、约束满足证据和拒绝理由的查询结果；RunRegistry 在受理 Run 时校验并创建唯一权威 `RouteSnapshot`。

相同冻结输入应产生确定性候选顺序。实时健康只能影响新 Proposal，不能静默替换运行中 Run 的路由。

## 3. Port

| 方向 | Port | 语义 |
|---|---|---|
| 入站 | `CapabilityRoutingPort` | 根据能力约束请求技术路由候选 |
| 出站 | `AgentRegistryQueryPort` | 获取已发布、Provider 无关的定义快照 |
| 出站 | `AdapterCapabilityPort` | 获取 Adapter 支持能力和脱敏健康快照 |

## 4. 算法

算法依次完成硬约束过滤、版本兼容校验、执行信封范围求交、技术偏好排序和解释信息生成。任何必需能力缺失都返回无候选，不以更宽权限或未声明能力降级。权重相同使用稳定键排序，保证重算可解释。

## 5. 韧性与可观测性

- AdapterCapabilityPort 超时按不可用处理，不猜测旧能力可用。
- 并发健康变化通过快照版本隔离；生成 Proposal 后由 RunRegistry 再校验。
- 记录候选数量、过滤原因、耗时和输入版本；不把业务请求正文写入标签。

## 6. 验收

- 相同版本化输入产生相同候选顺序与决策摘要。
- 无匹配能力时不创建 Run 的虚假 RouteSnapshot。
- Router 对业务优先级、团队角色和 Adapter 构造逻辑的依赖为零。
- 运行中路由只能由 RunRegistry 持有和恢复。
