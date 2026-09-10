# ACR-2026-0013：上下文组装职责与调用协议重整

- 状态：IMPACT_ANALYZED；G0—G2候选材料完成，G3待总体架构所有者复核。
- 级别：L2；日期：2026-09-08；提议人：Codex。
- 范围：根据用户反馈重写ContextEngine/SessionManager协作设计，明确Session查询即创建、必选内容、类关系、Child绑定失败、选择性父上下文注入、Token白盒上界及assemble边界。
- 授权：本轮修改设计文档；不修改代码、Schema、数据库或发布。不把用户同意“查询即创建”扩大为所有接口已批准。

## G1：影响与边界

正文：[ContextEngine](../../design/layers/l1-control/components/context-engine.md)与[SessionManager](../../design/layers/l1-control/components/session-manager.md)；接口增量唯一来源：[CTX-CON-1](../../design/contracts/context-assembly-contract.md)与CD-1。继续沿用安全域和Flow公共Activity；按后续已确认职责，Child Session血缘、Fork/Join/Reduce、Context输入准备调用及归档协调归SessionManager内部Coordinator，FE只执行单Child Flow。ContextEngine只读取/选择/冻结输入并返回完整内存候选，不反向创建Session或调用FE。不新增服务部署或资源分配组件。只读组装与Session写命令分离；入口先只读lookup并准备意图，候选成功后才执行SessionCommandPort.ensure或branch，指定历史缺失仍失败。

候选变更涉及Session ensure操作、显式Requirement、ParentContextSliceSpec、TokenAccounting、Child候选保存/绑定守卫、逻辑归档/GC分离及Run采纳恢复；不是纯排版L0。数据状态按可信scope隔离；来源与已保存候选通过Port访问；无Pi私有类型、反向业务调用或跨聚合大事务。总体外部职责未改变，因此不改用户手工Draw.io。

本次补充只覆盖ACR-0011的Context相关候选内容；旧“无未关闭问题/待开发”结论不适用于本次新增协议。ACR-0012对系统框架的已确认方向继续有效；其跨Flow方案待决项不由Context替代裁决。

## G2：方案比较与候选选择

| 问题 | 方案A | 方案B | 本次选择 |
|---|---|---|---|
| Session取得 | 先创建实体再组装 | 只读准备已有锚点或创建意图，成功后原子ensure/branch | B；创建冲突后重新准备，不能改绑空历史候选 |
| 并发组装 | Context自行加锁或竞争独立回执 | SessionManager保证串行；Context非线程安全，外部提交校验版本/执行资格 | B；接管旧执行仍须外部拒绝 |
| 类图组织 | 所有对象都画依赖 | 接口实现、专属组成、持有引用及值包含分别表示 | B，按真实生命周期表达，不为图形强加继承 |
| Child绑定失败 | 改读latest/创建空历史继续 | 原身份查询、明确失败、Saga收敛 | B；复用现有Session和Child协议 |
| Child父上下文 | 默认复制父全文或让Child自行读取live head | Fork冻结显式候选/必选子集，ContextEngine从Parent确切版本组装 | B；限制泄漏和Token放大，恢复结果稳定 |
| Child受理顺序 | 先branch再组装 | assemble候选→branch确认→保存/绑定→Run受理及FE执行 | B；组装失败时Child创建和模型调用均0 |
| 模型输入转换 | 在Kernel复制Pi消息/Provider映射 | 优先通过PiModelInputAdapter复用Pi，显式补齐六字段投影 | B，用户确认；采纳后不二次压缩 |
| Pi备选组装 | 用Pi compact整体替换纯策略 | pi-recent-history/v1复用截断建议，Kernel保留必选/依赖/预算约束 | B，显式配置备选，不自动故障切换；不调用模型摘要 |
| Token质量判断 | 精确完整预算/Provider容差作为交付门槛 | Pi粗估软目标，必选超标保留并标记，字节/结构为硬约束 | B，用户确认；不保证实际Provider不超窗，usage仅观测 |
| Child销毁 | Parent结束同步级联硬删除 | Coordinator幂等逻辑归档，满足retention/pin/outbox/UNKNOWN/incident后才GC | B；保留恢复与审计依据 |

用户需求不要求自动摘要、业务相关性模型、并行团队或新数据库，均不在本次实现范围。新ctx-input-1需显式版本；已采纳引用和活动运行保持原输入，回退不删除日志或替换旧模型输入。迁移细节见组件第11节。

## G3：五视角自审

组件专项评审归档于L1组件目录：[上下层一致性检查](../../design/layers/l1-control/components/context-engine-review.md)。本ACR只记录变更与决策，不另存组件设计或专项评审副本。

| 视角 | 本次证据 | 剩余复核 |
|---|---|---|
| 架构 | assemble内外分离，SM→Context→内存候选和SM→FE outbox均为单向协作；类图明确所有权 | Session ensure、ParentContextSliceSpec与组装端口的正式Schema归并 |
| 安全 | ensure写权限明确；分支失败不扩权；回放不等于授权 | 实现时检查真实读/释放/派发边界 |
| 数据 | 会话唯一键、冻结anchor、父上下文选择摘要、完整候选、Run采纳/归档回执、部分成功和UNKNOWN处理 | 物理迁移与Artifact/pin保留协议实现证据 |
| 测试 | Context新增选择性继承/Token/受理守卫用例；Session增加23个Join测试和6个E2E场景 | 测试实现、固定编码向量、故障脚本与实际运行 |
| 运维 | 容量、逻辑归档/GC责任、Token聚合计量、正文隔离与诊断顺序 | Pi估算偏差观测及Context延迟告警档案 |

未自行批准L2。G4未开始，G5仅执行文档与图检查，不称为运行验证。开发前需完成CTX-CON-1可编译Schema及具体Activity映射联合复核；不让开发者在实现时自由猜测接口版本。

## 检查记录

- 组件与契约、ACR及索引的本地链接检查通过；本轮文件差异格式与YAML检查通过。
- 组件正文8张PlantUML图使用本地1.2026.7渲染，已逐张查看完整PNG；两张类图区分接口实现、组成、持有及数据引用，场景图无文字裁切，assemble主图较长，按独立内部流程展示。
- 2026-09-08按用户要求补齐`docs/verification/test-coverage.md`元数据及验证索引，修复缺失图引用和组件归档后的历史链接；运行`bash packages/lawclaw-agent-kernel/scripts/check-document-architecture.sh`通过：7个层、34个组件、80份受治理文档。检查器规则未修改；该结果只证明文档治理检查通过，不代表候选设计已批准。
- 2026-09-08补充sub-session选择性上下文、Token上界、创建/归档生命周期、确定性故障注入和6条E2E后，重新运行文档架构检查通过：7个层、34个组件、84份受治理文档；架构依赖静态检查通过；19/19权威PlantUML检查通过；本轮改动的7张内嵌PlantUML另以1.2026.7 `-syntax`逐张通过；acceptance.json可解析且diff格式检查通过。以上仍不等于运行实现或E2E已通过。
- 未运行代码测试、未改变生产配置/数据库、未提交；新增Context、Join及E2E条目均为验收设计，不是已通过证据。

- 2026-09-09按用户确认补齐延迟创建和完整候选，同步总设计§12及CD-1直接调用契约；新增10条SESSION/PAYLOAD用例。具体未关闭调用方冲突与静态验证见组件评审“延迟创建与完整候选契约传播”，不沿用前轮图形视觉验收作为本轮证据。

- 2026-09-09按用户要求补充Pi转换优先复用及备选组装：上下文组件/CTX-CON-1/CD-1已同步输入、策略、适配及验收；10张内嵌PlantUML语法和文档结构检查通过。具体证据见组件评审“Pi转换复用与备选组装”；未实施代码。

- 2026-09-09用户确认三项：Pi预算软约束、pi-context-1固定输入映射、外部受信准备后延迟创建Session。对应正文/类型/场景/验收及CD-1和总设计已同步；Memory排名/Child来源接口仍为独立待办，本轮未实施代码。
