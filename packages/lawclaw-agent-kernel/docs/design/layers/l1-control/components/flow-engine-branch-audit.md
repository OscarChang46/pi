# FlowEngine Core 分支审查

日期：2026-09-07。范围：本轮新增的`src/contracts/flow-engine.ts`、`src/control/flow-engine/`及对应测试。现有RunFlow和其他模块未纳入此次重构。

## 问题与处理

上次改造将状态/事件分派移入迁移表，但动作内部仍集中判断结果类型，Factory也重复按状态选择校验逻辑。扩展结果类型时仍需修改条件链，遗漏分支不够显式。

| 位置 | 具体问题 | 本次处理 |
|---|---|---|
| flow-transitions.ts：ModelCompleted | answer/tools/child条件链承担三种策略选择 | 三个具名类型处理器；新增ModelOutput变体必须补处理器，否则类型检查失败 |
| flow-transitions.ts：PermissionResolved | ask/deny/unavailable/allow集中分派 | 四种权限结果的穷尽策略表，共用因果校验留在迁移入口 |
| flow-transitions.ts：EffectReconciled | 同一处理器判断模型或工具等待原因，再选择不同目标 | 两条迁移分别实现恢复动作；只共享命令、incident和结果有效性校验 |
| decision-factory.ts | 状态命令关系、记账、转录约束与身份生成混合 | 提取plan-validation.ts；状态、等待原因和转录角色按穷尽表验证，用量按规则表验证 |

例如模型新增第四种输出时，先扩展FE-CON-1类型与输入结构，再补对应输出处理器和测试；无需给Resolver增加条件。策略表只接受自有键并复制冻结，不能把原型属性当作处理器，也不受调用方后续修改原表影响。

## 保留的条件与边界

| 文件或位置 | 保留原因 |
|---|---|
| input-schema.ts | 验证封闭字段及联合结构；结构解析需要判断数据是否合法，不选择业务迁移 |
| input-guard.ts | 按规定优先级拒绝作用域、版本、摘要、序号及绑定错误；重复和终态需短路 |
| canonical.ts | 区分JSON值类型及拒绝非规范值，属于编码算法 |
| transition-definition/resolver/preconditions.ts | 检查注册冲突、终态出边、目标合法性及取消/到期优先级 |
| Ready迁移 | 有待处理工具时先申请权限；否则检查上下文和模型预算。这是该迁移内有序业务条件 |
| ModelFailed/ToolObserved | 判断执行事实是否未知、是否失败以及结果是否超限；UNKNOWN必须先进入核对，不能作为普通失败重试 |
| ChildCompleted/ApprovalResolved | 核对因果绑定后，根据完成结果或审批布尔值选择已声明目标 |
| plan-validation.ts | 集合、额度、大小及跨字段一致性拒绝；不决定下一业务状态 |
| decision-factory.ts | 捕获非法规范化、拒绝不一致计划、将commandOrdinal换成确定性commandId；取消命令使用独立截止时间 |
| transition-context.ts/flow-engine.ts | 构造计划、按Guard与Resolver结果短路，属于固定推进流程 |
| contracts/flow-engine.ts | 数据类型定义，不包含运行时业务分派 |
| 测试与fixture | 条件用于构造输入、断言结果与独立期望矩阵，不作为生产策略来源 |

局部条件没有全部消除：显式迁移表负责源状态/事件的选择，动作内仍有守卫条件和目标选择。新增多种可独立扩展的行为策略时应继续拆分；二值判断和拒绝式检查保持直接表达。不能用减少if数量或替换成三元表达式作为完成标准。

## 验证

- 根目录`npm run check`通过。
- 包内验收框架筛选AK-FE-001—018并执行`--checks`，18个用例通过；报告目录`.artifacts/flow-engine-branch-audit`。
- 原契约向量、状态事件矩阵、权限结果和恢复用例继续通过。
- AK-FE-017新增策略穷尽类型断言、未知变体拒绝、处理器表不可变验证。
- AK-FE-018新增Proposal、Child、转录角色及核对命令错绑拒绝验证。

这些证据验证纯Core重构；不证明真实事务、Permit执行、耐久调度或进程崩溃恢复已经完成。
