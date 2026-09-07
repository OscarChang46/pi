# FlowEngine Core

实现 [FE-CON-1](../../../docs/design/layers/l1-control/components/flow-engine.md) 的同步纯推进。包入口导出 `FlowEngine`、`FlowAdvanceInput`、`FlowAdvanceResult` 和 `FlowAdvancePort`。

职责分配：

- `input-schema.ts` 验证封闭字段结构；`input-guard.ts` 验证来源分类、冻结绑定、序号、摘要与重复。
- `transition-definition.ts` 定义类型安全的源状态、触发事件、允许目标与纯动作。
- `flow-transitions.ts` 登记首版9条业务迁移定义，Suspended显式分为approval/tool_unknown/model_unknown。
- `transition-preconditions.ts` 按取消、到期、公共输入不变量执行优先级规则。
- `transition-resolver.ts` 编译迁移表并查表执行，检查动作返回的目标；`transition-context.ts` 只构造计划。
- `variant-matcher.ts` 为封闭结果类型建立穷尽策略表，模型输出及权限结果按类型分派。
- `plan-validation.ts` 通过状态、等待原因和转录角色策略表校验计划绑定，通过记账规则表核对用量。
- `decision-factory.ts` 调用计划校验、分配确定性身份，并复制及冻结完整结果。
- `canonical.ts` 实现 FE-C14N-1；`flow-engine.ts` 按 Guard → Resolver → Factory 调用并短路拒绝。

输入中的时间、状态和事件必须来自可信调用边界。Core 校验 `source` 与事件类型对应关系，不认证生产者；不读取 Artifact、不验证引用所指权限、不消费 Permit。`node:crypto` 仅用于确定性摘要，不产生随机数。

`FlowEngine.advance(input)` 返回 `advance`、`ignore` 或 `reject`。Resolver 预期拒绝直接返回；Factory 矛盾计划返回 `FLOW_INTERNAL_PLAN_INVALID`。非预期代码异常不伪造业务结果，调用方应停止提交并记录内部故障。规范化拒绝超过 64 层、100000 个节点和 2 MiB 的输入；这些是首版协议解析保护，不是可扩大的 Run 额度。

本轮是独立可调用的 Core，尚未替换 `RunFlow` 或接入当前 `AgentSystem`。`StateCommitPort` 已定义，但真实 Inbox/Outbox/CAS、claim、耐久执行与安全启动协议仍需实现。Core 的通过结果不能作为外部派发许可。

验证登记在 [acceptance.json](../../../docs/verification/acceptance.json)，`AK-FE-*` 为纯 Core 用例；`FUTURE-FLOW-RUNTIME` 明确保留为 planned。测试文件位于 [单元测试](../../../test/ut/flow-engine.test.ts) 和 [契约测试](../../../test/contract/flow-engine.test.ts)。


## 扩展迁移

新增迁移时，先更新FE-CON-1状态/事件契约与独立期望矩阵，再通过defineTransition(from,on,targets,action)登记到flow-transitions.ts。动作参数按from/on自动收窄类型；注册表装配后不可修改。同一源状态/事件只能有一条定义，条件分支属于该动作的预算、结果和因果校验，不再用于在全局方法中寻找当前状态。

Resolver无需为新增迁移增加条件分支。构造时拒绝重复注册、空目标集合及终态出边；执行后拒绝未声明目标，未登记组合默认拒绝。公共取消/到期优先级不受业务注册表替换影响。definitions提供只读定义，允许用同一数据检查覆盖和生成图。类型层面的新状态/事件仍需更新封闭协议与Guard，不能只登记字符串绕过输入验证。

AK-FE-015/016验证注册冲突、终态封闭、目标约束、不可变装配及新增定义不修改分派器。原AK-FE-001—014继续验证行为一致性。

AK-FE-017/018验证策略穷尽、未知类型拒绝、装配不可变和计划错绑拒绝。工具及模型核对分别登记处理器。因果绑定、额度、结果是否已知和审批布尔值仍采用局部条件判断；这些判断的具体保留原因见[分支审查](../../../docs/design/layers/l1-control/components/flow-engine-branch-audit.md)。
