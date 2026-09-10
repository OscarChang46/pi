---
doc_id: L2-CMP-003
level: component
layer: L2 Cognitive Runtime
component: AgentAdapter Boundary
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: Kernel 公共模型适配边界与 Provider 类型隔离
parent: L2-DES-001
interfaces: [AgentAdapterPort, BND-MOD-001]
diagrams: []
supersedes: ["[归档 C4 边界协议设计](../../../../governance/archive/design-v3-pre-layering/c4-boundary-protocols.md) 中公共 ModelInvocationPort 表述"]
---

# AgentAdapter Boundary 组件设计

## 职责

`AgentAdapterPort` 是 Kernel 唯一公共模型适配边界。它接收 Kernel 规范化且有界的模型步骤请求，输出规范化事件、使用量与故障；屏蔽 Pi、ACP、SDK、SSE 和 Provider 差异。

## 边界不变量

- Kernel Core 不导入 Provider SDK、Pi 类型、网络协议或凭证类型。
- Adapter 不执行 Kernel 策略，不裁决权限，不查询 L3 工具目录，也不修改 Run。
- 可见工具由 L1 冻结在候选的 `payload.tools` 中；Adapter 只能向模型描述这一份快照，不另读目录或平行的 tools 参数。
- Provider 私有解析、重试和网络调用全部在具体 Adapter 内，且服从上游 Deadline 与预算。
- `ModelInvocationPort` 不是公共 Kernel Port，只能作为具体 Adapter 的私有协作者。

## 生命周期与选择

Adapter 类型和配置由 Kernel 外 Composition Root 绑定；Runtime 只持有作用域化的 `AgentAdapterPort`。运行中不得因 Provider 返回内容切换到权限更大的 Adapter。凭证由外部 Scoped Adapter/Secret 机制注入，不进入 Kernel 领域对象。

## 故障隔离

Adapter 将认证失败、限流、超时、协议错误和内容错误映射为稳定故障类别，并避免泄漏 Secret 或原始 Prompt。首版 Adapter、Pi SDK 和 HTTP 层自动推理重试均为 0；故障的 retryable 分类不构成重新发送授权。

## 契约边界

本次CE迁移的模型输入唯一遵循[CTX-CON-1](../../../contracts/context-assembly-contract.md#31-生产者消费者与迁移验收)：`AgentTurnRequest={sessionId,payload,formatVersion,modelAdapterVersion}`。四字段均必填；payload为六字段完整模型载荷；旧frame/tools请求拒绝。事件、Usage及其他执行元数据仍遵循CD-1，不另设模型输入正文协议。

Host先读取完整候选Artifact，核验保存对象摘要、输入/载荷摘要、RunContextBinding及当前读取资格，再只交付四字段请求。Trace留在受控Artifact中。恢复必须消费已采纳候选；Adapter不能读取Session最新历史、重新选择或通过runtimeMessageRef替换规范正文。

## CD-1契约细化（2026-09-07）

本页为契约门面，不新增独立状态库或服务。字段与操作见[CD-1](../../../contracts/component-development-contracts-v1.md#agent-adapter-boundary)；范围见[必要性审查](../../../reviews/components-2026-09-07/scope.md)。

工厂按已冻结adapterBindingRef装配确定Adapter，注入最小Egress/Secret能力；Runtime只调用本接口。输入无Provider类型；输出经过Mapper再由Parser重验。Provider usage缺失返回null/unknown，不伪造0；错误分类不直接决定Run迁移，由L1消费规范事实。

禁止工具自动执行器、Provider私有Session持久化和权限扩大fallback；原生异常只映射封闭错误码，不跨Port传Error对象。

首版所有Adapter及SDK/HTTP层自动模型重试=0。未发送可返回KNOWN_NOT_APPLIED；可能发出且结果不完整返回UNKNOWN。取消后继续收到片段仅记录受限失败事实，不能开始另一调用。

容量：完整模型映射≤1MiB、输出256KiB、流窗口1MiB；120秒；未读流使用背压，满则取消并OUTPUT_LIMIT。Pi Token计量为软目标，required_over_target仍保留必选输入；字节及结构校验是硬约束，Provider真实窗口拒绝不触发自动裁剪或重发。

验收用例（待实现/执行）：

- L2-CMP-003-TC-01：Faux Adapter固定文本：唯一end及完整规范输出。
- L2-CMP-003-TC-02：usage缺失：tokens=null/source=unknown。
- L2-CMP-003-TC-03：Provider 429：RATE_LIMITED且请求次数1。
- L2-CMP-003-TC-04：流未end直接EOF：UNKNOWN非成功。
- L2-CMP-003-TC-05：工具候选输出：无Provider execute-tool调用。
- L2-CMP-003-TC-06：Kernel消费者类型检查：不依赖Pi/Provider原生类型。
- L2-CMP-003-TC-07：两个真实入口的首轮、工具后续及同Session跨Run，模型替身断言收到候选payload且工具只取payload.tools，无Trace、frame和额外tools字段。
- L2-CMP-003-TC-08：旧候选格式、摘要损坏及绑定失配在模型调用前拒绝；恢复不访问当前历史、不重新执行选择算法。

### R1评审修订适用项

本组件关联的授权/Child受理与池预算/Session及Context冻结/资源扫描/UNKNOWN与审计完成点，按[CD-1 R1闭环](../../../contracts/component-development-contracts-v1.md#授权闭环r1替代首轮工具专用decisionrequest)执行。R1补充是本轮完整设计的一部分；前文概括不能省略这些字段和事务步骤。
