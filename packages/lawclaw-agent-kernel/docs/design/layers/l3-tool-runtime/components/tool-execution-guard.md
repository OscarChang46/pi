---
doc_id: L3-CMP-003
level: component
layer: L3 Tool Runtime
component: ToolExecutionGuard
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ToolExecutionGuard职责与功能域交互标准
parent: L3-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# ToolExecutionGuard 组件设计

## 1. 职责与功能域

只保留GD-01“执行授权检查”一个功能域：将实际固定动作与Security许可绑定核验，调用已有consume/authorizeStart能力。校验和授权确认属于同一个执行前目标，无独立业务生命周期，不再按Hasher/Client拆功能域。Guard作为Runtime内部职责，无状态库、无授权缓存、不调用PDP或L4。

## 2. 组件交互标准

`GuardRequest={commandId:Ref,resolved:ResolvedTool,argumentsRef:Artifact,permitRef:Ref,binding:SecurityBinding,claim:ExecutionClaim,executorRef:Ref,target:ToolTargetV1}`；`GuardResult={kind:ready,startGrantRef:Ref}|{kind:rejected,error:Error}`。全部必填，无null；ResolvedTool来自Router组件，Artifact/安全类型绑定L3-CON-001及Security当前契约，不能在本层自定义claim字段。target由L1在decide前创建，Guard读取target.resourceProfileRef，复核完整档案、route/limits/scope/deadline与原proposal，按BND-L34公式核对binding.targetDigest；任何不等在consume前拒绝。相同参数字节、目录及资源绑定用于校验和最终ExecutionPlan，不得验证后读另一个可变路径。

输入生产者RT-01，输出消费者仍RT-01；执行顺序是有权读取参数→实际字节摘要复核→绑定比对→Security.consume→Security.authorizeStart→返回grant。参数Schema由RT-01统一验证，Guard不再维护第二套Schema规则。授权审计及执行资格的原子性由C03和C01承担，Guard不实现事务算法。消费成功但启动校验失败时返回rejected，不恢复Permit、不补发等价授权。

## 3. 失败与集成约束

任何来源、scope、绑定、有效期、服务或审计错误都不得输出ready。历史grant不是当前执行权。Security接口到新FE执行资格的桥接由宿主与Security联合提供，尚未落实前不可接通受保护工具；简化L3不等于可以用旧Grant接口代替一次性Permit。Ref不构成授权。

## 4. 验收

L3-GD-IT-01：参数字节变更→DIGEST_MISMATCH，consume/L4均0；消费确认后启动校验过期→PERMIT_EXPIRED，L4=0；有效结果只能被原executor/command使用。GD-01域内覆盖字段错配与时效边界。此处保留跨组件使用规则，具体Security存储/审计故障验证归C03所有者。

<a id="l3-dd-1-最终执行检查"></a>
旧Guard章节由本版及单功能域设计替代；能力与安全检查未删除。
