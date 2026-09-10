# FlowEngine Core 首次实现

历史阶段记录：以下Core现为ReActFlowPolicy，原验证时间和范围保留；当前通用框架及部署证据见[系统验证](../../../../../../verification/flow-system-validation.md)。

验证完成：2026-09-07T06:45:42.924Z；Node：v24.19.0。

已实现 FE-CON-1 类型、封闭字段校验、InputGuard、TransitionResolver、DecisionFactory、FlowEngine及确定性编码。包入口导出独立Core，现有RunFlow和AgentSystem装配未切换。

## 验证结果

- 根目录 `npm run check` 通过：格式/lint、固定依赖、相对导入、锁文件、全仓类型检查、浏览器静态检查。
- 包内验收框架筛选 `AK-FE-001`—`AK-FE-014`，使用 `--checks`，14项通过；类型、职责边界、公开注释和目录文档检查均通过。
- 8组固定输入/完整输出与实际Core相等；6组固定字节与摘要通过；状态矩阵覆盖11种状态（含3种Suspended原因）×11种事件，共121种组合，另测各状态取消/超时。
- 本次未运行付费模型、外部工具、全量测试或构建；未提交Git。

## 已执行用例

| 用例 | 层级 | 结果 |
|---|---|---|
| AK-FE-001 FE-CON-1八个独立设计向量与实际Core完整输出一致 | contract | passed |
| AK-FE-002 FE-C14N-1固定字节与摘要保持跨实现一致 | contract | passed |
| AK-FE-003 非JSON值与超界输入不能被规范化为合法摘要 | contract | passed |
| AK-FE-004 A-B-A交错推进稳定且输出不共享可变输入 | contract | passed |
| AK-FE-005 Guard拒绝未知字段作用域旧Attempt与非法事件载荷 | ut | passed |
| AK-FE-006 重复终态序号缺口按优先级短路且不调用ResolverFactory | ut | passed |
| AK-FE-007 模型文本工具Child迁移保留完整转录并只预留新动作用量 | ut | passed |
| AK-FE-008 权限允许Ask拒绝不可用过期及预算零均有封闭结果 | ut | passed |
| AK-FE-009 UNKNOWN不重试且恢复必须匹配命令incident与结果种类 | ut | passed |
| AK-FE-010 Context失败预算边界与取消超时不依赖外部服务 | ut | passed |
| AK-FE-011 Factory拒绝终态业务命令错配下标及用量回退 | ut | passed |
| AK-FE-012 未声明状态事件组合均拒绝且错配回执不解除等待 | ut | passed |
| AK-FE-013 状态乘事件矩阵覆盖全部等待类型和终态封闭 | ut | passed |
| AK-FE-014 已知失败审批拒绝与输出超限不产生新业务命令 | ut | passed |

## 实现边界

可信调用方负责生产者认证、Artifact授权与发布、冻结模型窗口、Child权限子集证明。Core验证结构和因果绑定，只生成命令意图；DispatchTool意图不是外部执行许可。

尚待实施：RunRegistry的T1/T2与CAS、Inbox/Outbox/claim、Permit与authorizeStart、耐久执行事实、Coordinator装配、真实Adapter故障注入和容量性能验证。验收清单将FUTURE-FLOW-RUNTIME保留planned，不用纯Core用例替代这些证据。

## 代码与复现

- [业务策略入口](../../../../../../../src/control/react-flow/react-flow-policy.ts)
- [数据契约](../../../../../../../src/contracts/flow-engine.ts)
- [契约用例](../../../../../../../test/contract/flow-engine.test.ts)
- [规则用例](../../../../../../../test/ut/flow-engine.test.ts)
- [验收登记](../../../../../../verification/acceptance.json)

从包目录运行精确验证（不触发未选中的运行测试）：

```sh
node scripts/verify.mjs --checks --id AK-FE-001 --id AK-FE-002 --id AK-FE-003 --id AK-FE-004 --id AK-FE-005 --id AK-FE-006 --id AK-FE-007 --id AK-FE-008 --id AK-FE-009 --id AK-FE-010 --id AK-FE-011 --id AK-FE-012 --id AK-FE-013 --id AK-FE-014 --report-dir .artifacts/flow-engine-core
```


## 状态机结构修订

验证完成：2026-09-07T06:59:54.479Z。按反馈将全局条件分派改为显式迁移表，完整说明见设计21.13及源码README。新增AK-FE-015/016验证定义冲突、终态封闭、目标集合与扩展接入。当前16个选中用例通过，根目录npm run check及包内类型/边界/注释/文档门禁通过。上方14项记录保留为首次实现历史。

## 分支审查修订

2026-09-07：继续检查迁移动作及Factory中的类型分派，将模型输出、权限结果和计划绑定校验改为穷尽策略表，分离工具/模型恢复处理。检查结果和保留条件的依据见[分支审查](react-branch-audit.md)。新增AK-FE-017/018后，18个选中用例及包内`--checks`通过，根目录`npm run check`通过。前文14/16项为历史验证记录；运行边界接入范围未改变。
