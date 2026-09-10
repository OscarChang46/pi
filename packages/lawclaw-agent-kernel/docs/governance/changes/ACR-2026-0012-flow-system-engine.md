# ACR-2026-0012：FlowEngine系统框架与关联调度

- 状态：IMPACT_ANALYZED；2026-09-08用户明确撤回独立SubagentCoordinator建议，G2按FE统一协调边界修订
- 级别：L2，改变Kernel内部Port、事件、存储及恢复协议；不改变外部子系统职责
- 提议人/本轮设计整理：Codex
- 子系统所有者：Agent Kernel；目标批准人：总体架构所有者（用户确认）
- 日期：2026-09-07
- 目标：AKB-2026-09-03-09候选；不修改活动基线AKB-2026-09-03-08
- 工作区证据：codex/arch-agent-system-v3，HEAD 557b03e，存在大量未提交改动；HEAD本身不包含全部下述实现

## 当前范围决定（2026-09-08，替代此前Fork/Join交付要求）

用户确认当前没有跨flowRun Fork/Join需求。SR-04及ADR-0012降为延期扩展，跨flowRun关联、汇合、取消传播和恢复不纳入本期交付、开发准入或缺陷清单；本ACR下文涉及该扩展的方案、数据、测试、质量预算和待决项均仅为未来候选材料。不得据此创建计划表、协调器或后台循环。SR-01～03的单flowRun四态、Activity、内部有向环和恢复仍需按各自验收交付。Session父子关系仍归SM；已有Agent业务委派不删除，不新增旁路协调实现。

## 1. 触发原因与目标

用户指出第一版FlowEngine绑定ReAct、状态分派不具扩展性，详细设计缺少内部算法与实现约束；后续文档整理仍未完成架构流程。目标是按[ACP-001](../architecture-change-process.md)建立场景→职责→Port→内部算法→持久化→测试→批准的完整追踪。

用户已明确批准的方向：Ready、Running、Yield、Terminate四态；稳定序号、append-only和The Magic拦截；允许有向环并定义循环/退出条件；Flow关联与调度属于框架；业务逻辑外置；删除资源分配组件。上述同一边界不重复申请确认。新增关联计划的具体方案不能借用历史方向批准自动放行。

### 2026-09-08：Session父子关联职责下放

用户明确纠正：Session父子关联不属于FE，归下层SessionManager。此前“父子关联统一归FE”只适用于FlowRun执行关系，不再允许解释为Session关系；“不建立第二套日志/恢复循环”约束Agent适配层重复调度，不禁止SM保存自身血缘、幂等回执或恢复本地事务。FE不得通过Session关系推导FlowRun取消/Join，也不得跨层管理AgentRun。

职责决定已确认；本次同步总体、L1、FE入口、SR-04和SM正文。只修订设计，不修改代码、数据库或部署，不宣称完整Fork/Join协议已实现；历史图形与其他候选契约仍需按此边界完成后续一致性校验。

## 2. 明确不做

不设计ReAct轮次、无人业务循环、模型/工具内部、PDP政策、团队角色、业务结果采纳或资源分配组件。本轮不修改执行代码、数据库或部署，不提交推送。撤回首版仅顺序关联的范围建议；Fork/Join、父子关联、取消传播和恢复均由FE统一承担。现有顺序协议仅是局部草案，不能排除并行汇合。多主机、多库及在线改图仍未设计，同库方案也未获得批准。

## 3. 当前架构与问题证据

[FlowEngine](../../design/layers/l1-control/components/flow-engine/README.md)记录当前源码及SR入口。FlowEngine/ActivityInterceptor/TaskGraph已存在；TaskGraph节点共享一个Run，FlowScheduler仍依赖ReAct。没有FlowPlanPort、计划日志或计划终止资格检查。旧治理登记遗漏0012，且把历史基线说成整个工作区事实，本轮更正。

现有Started唯一插入不能保证外部物理exactly-once。已Started但无Completed不可重发；版本1reconcile只接受Yield。计划终止后的对账和跨Flow资格检查是新增设计，不得从单Run测试通过推导已实现。

## 4. 建议方案

[ADR-0012](ADR-0012-flow-association-and-execution-gate.md)原方案A需修订：FE统一驱动Root/Child及并行关联，复用系统四态和Activity机制；不保留第二套Agent协调器。原顺序子集协议位于[SR-04](../../design/layers/l1-control/components/flow-engine/deferred-scheduling-index.md)，本ACR只维护决定及验收门槛。

## 5. 不扩权替代方案

方案B保持现有单Run接口，由外部模块自行持久化关联，最少新增代码但不满足通用关联目标。方案C以父Run检查点表达计划，另定义专用子Run指令；仍需父栅栏和专门恢复协议。三者比较见ADR；不把普通Activity包裹子Run受理作为可恢复方案。

## 6. 边界影响

| 维度 | 变化及权威来源 |
| --- | --- |
| 职责/依赖 | FlowCoordinator→共享纯规则、FlowScheduleJournal、FlowEngine、外部目录Port；外部RunScheduler只提供唤醒与宿主执行条件，不解释Flow后继 |
| Port/DTO | 新增计划受理/推进/查询/唤醒/恢复/终止；内部受控Run Journal绑定；终态对账维护入口，字段及错误见SR-04 §2、§5 |
| 数据 | 计划事实、不可变激活、命令回执三表；scope来自可信Host；Run日志仍为独立事实；投影不得成为第二权威 |
| 事务 | 计划消费与后继同事务；Run完成与计划消费分提交；仅授予执行资格时同库验证计划代次并追加Run事件 |
| 控制流 | 外部提交→校验/追加激活→CAS推进→Run→纯路由→消费/下个visit或终止 |
| 数据流 | 固定输入、版本→Run身份→Completed结果→固定版本路由→保存下一激活；默认遥测不携带正文 |
| 故障流 | 未确认提交先查询；Started未知Yield；重启扫描发现激活；显式隔离旧宿主；终止清理和对账追加维护事实 |
| 安全 | Host控制scope及接口权限，安全模块负责PDP/PEP，资格栅栏不签发授权；无授权读取同样拒绝 |
| 运维/部署 | 首版同机版本2新库，WAL/FULL；有界扫描/图/数据，可观察unknown/cleanup；不新建资源分配组件 |

## 7. 上层约束追踪与复用冲突

| 约束 | 设计响应 | 校验/风险 |
| --- | --- | --- |
| UP-AGT-001、005 | Run执行事实仍独立；计划只拥有关联 | S10、数据自审 |
| UP-AGT-002、008、010 | 外部模块决定业务含义，框架执行注册关系；不拥有Workflow业务权威或团队 | 非ReAct扩展走读、架构自审 |
| UP-AGT-003、UP-DEP-001/002/003 | Core不引用Pi、SQLite、HTTP；Composition Root装配Port | 后续依赖检查与结构验收 |
| UP-AGT-006、009、UP-DEL-001 | 根/子任务统一复用FE关联、调度、Fork/Join及取消恢复；权限约束经安全接口 | 2026-09-08用户已确认撤回独立SubagentCoordinator；不再为同一边界索要批准 |
| UP-AGT-007、UP-DAT-001 | 先日志后派发、未知关闭、独立结果消费；资格检查不扩展为跨业务巨型事务 | S12/S13、双连接及崩溃测试 |
| UP-SEC-001、UP-TOOL-001 | Host信封及既有PEP/PDP；不得用Started冒充授权 | FE-SCH-TC-06 |
| UP-RES-001、UP-OBS-001 | 有界执行/扫描/存储与OperationContext | FE-SCH-TC-08，尚待实测 |
| UP-INF-001/002 | 存储只实现协议，业务路由留外部回调 | 类图及依赖门禁 |
| UP-CTX-001/002/003 | 本变更不改变ContextFrame或Memory所有权 | 不引入Flow内部Context/Memory副本 |

**R1已撤回（2026-09-08）。** 先前把可能重复拥有Run误判为已成立的高层复用冲突，再建议保留SubagentCoordinator作为独立协调入口，依据不足且背离FE统一复用方向。用户明确要求撤回：FE拥有通用父子关联、Fork/Join、等待、唤醒、取消传播与恢复；外部模块只提供业务定义、参数转换及结果解释，安全模块拥有授权。不得通过改名保留第二套协调、持久状态或恢复循环。旧组件职责分配不再约束此设计；不删除业务委派能力。

旧无状态FlowEngine及资源组件的相关候选描述已被用户的新边界决定替代；不因此整体废止0008～0010的其他设计或批准整份总体架构。

## 8. 兼容、迁移与回退

版本1系统Run和ReAct业务库保留；新计划使用版本2新库，不能推断旧Run父子关系。新旧程序不共管一个计划。先关闭新受理、隔离执行，再用识别版本2的维护程序清理和对账；不降级schema、不用旧备份覆盖新副作用历史。版本化处理器保留到关联计划结束。完整步骤与限制见SR-04 §5.4。

## 9. 质量波动预算

| 指标 | 当前基线 | 候选阈值 | 验收证据 |
| --- | --- | --- | --- |
| 责任/依赖 | 当前源码及上层约束表 | 未授权职责、禁止依赖、循环依赖均0 | G4/G5结构检查 |
| 状态/契约 | 四态及已有单Run协议 | 裸状态分派0，公开契约覆盖100% | 穷尽表检查、中文接口审查 |
| 正确性/安全 | 既有AK-FS用例，非本轮新执行 | 受影响用例100%通过，跨scope泄漏0 | AK-FS回归+FE-SCH-TC-01～08 |
| 性能 | 通用跨Flow无现成测量；需固定机器/数据集采样 | 复用改造的原单Runp95与峰值RSS退化≤10%；新路径记录绝对值供批准 | 同机前后对照；未测，不填虚构数值 |
| 有界性 | 版本1无总日志量门禁 | SR-04容量档案全部生效，无无限重试 | 极限输入、写失败、扫描测试 |
| 可观测/回退 | 新路径尚未实现 | 关键操作Span/错误分类覆盖100%，回退演练通过 | E2E及运维记录 |

## 10. 产物及实施追踪

| SR | 当前/拟议开发单元 | 行为验收及结构验收 |
| --- | --- | --- |
| SR-01 | flow-system.ts、flow-system-transitions.ts、FlowEngine | AK-FS-001/009/012；四态穷尽与外部业务隔离 |
| SR-02 | ActivityInterceptor、SqliteFlowJournal；拟议计划绑定journal/终态对账 | AK-FS-002～005/010；TC-05/06；日志事务及未知关闭 |
| SR-03 | TaskGraph；拟议共享GraphRules | AK-FS-006～008；TC-02；新增节点不改中央循环 |
| SR-04 | 拟议flow-plan契约、FlowCoordinator、PlanRules、FlowScheduleJournal及SQLite适配 | TC-01～08；指令分派/状态覆盖、故障注入、部署回退 |

类图和逐场景流程保留在各SR。总体Draw.io无需修改：本变更仅Kernel内部，且手工画布不是此次替换对象。SR-04类图及事务流程为候选，不混称代码图。

## 11. 风险与待决项

- D1：原“首版顺序、同库”组合建议已撤回；按FE统一承担Fork/Join修订多激活、汇合、取消与恢复协议后再评审具体存储方案。
- R1：错误冲突判断及保留独立SubagentCoordinator建议已撤回，不再是用户待决项。
- R2：新计划绑定journal、终态对账、存储上限和工具尚未实现；不以文档闭合代替实现验收。
- R3：普通Workflow仍须遵守确定性及Activity入口；框架不沙箱任意JavaScript。
- R4：历史代码已经先行，本轮不会伪造先审后写的时间线。需G4逐项审计既有代码与批准方案的偏差。

## 12. 评审与批准

[完整流程与五视角自审](../reviews/flow-system-architecture-review.md)列出问题、修订和未闭合项。本轮为单代理自审，不冒称五名独立评审人。2026-09-08用户明确确认撤回上述错误建议；此边界决定已记录，无需再次确认。剩余协议及实现的批准尚未完成。状态保持IMPACT_ANALYZED，不跳到APPROVED。

## 13. 实施与验证

本轮只修改设计/治理文档。既有测试仅用于实现定位，历史运行记录见[系统协议验证](../../verification/flow-system-validation.md)；不作为SR-04验收。本轮文档与图形检查结果记录在自审文档；后续G4/G5需记录实际文件、提交、命令、场景及恢复证据。

## 14. 基线与关闭

已登记pending_changes；活动基线和approved_changes保持不变。G4受控实现、G5运行验证、并入基线、兼容窗口结束关闭均未执行。批准只放行指定范围，不能自动变成VERIFIED/BASELINED/CLOSED。

## 15. 独立组件删除评估（2026-09-08）

用户授权：评估SubagentCoordinator是否还有其他用途；无独立用途则从设计文档删除。核对组件、CD-1、Session/Context场景、对象目录及正式图源后，结论为**没有独立保留价值**。

| 原职责 | 现行唯一归属 | 删除后的要求 |
|---|---|---|
| Child创建、父子关系、Fork/Join、取消和恢复 | FE关联协议 | 不在外部改名保留第二套协调器、状态日志或恢复循环 |
| 委派授权、权限子集和Permit | 安全模块 | 外部回调调用现有接口，授权失败关闭 |
| 分支、冻结快照、归档 | SessionManager | FE执行外部准备/清理回调；Session只维护自身事实 |
| Agent/Route选择、上下文隔离与结果采纳 | 外部业务处理器 | FE只传递冻结引用，不解释业务字段 |
| 额度预留与资源池 | 外部政策或依赖 | 不迁入FE，不保留资源分配组件 |

删除L1-CMP-013清单项、活动组件入口和CD-1独立组件契约；原11号图由[Flow关联边界图](../../design/diagrams/components/l1-control/11-flow-relations.puml)替代。总体、L1、FE SR-04、Session、Context和对象目录同步。旧文档、图源及契约快照保存在[历史目录](../archive/flow-before-system-v1/)，历史评审链接指向归档，退役ID不复用。

完整性重点：保留“Session已创建但Child未受理”的失败窗口。FE持久恢复进度，外部回调查询原Session回执；受理未知不提前归档，父取消与受理在线性化点竞争，清理失败继续可诊断。业务输入与安全状态没有迁为FE领域模型。

真实性限制：源码没有名为SubagentCoordinator的定义或引用；既有flow-child-coordinator.ts仍是业务宿主辅助实现，本次未修改源码，不能据此声称代码已统一迁移。SR-04完整多激活/Fork/Join协议仍待细化实现。手工Draw.io及旧评审记录是历史材料，不以本次删除伪造其已重审通过。

本轮校验：现行设计正文、清单、PlantUML与生成SVG中该组件名称/ID/旧路径引用为0（历史评审与手工画布不计入现行规范）；3张独立图源与SVG同步且XML有效，另检查5张受影响的Session/Context内嵌图。使用PlantUML 1.2026.7与中文字体完成渲染及视觉检查，修正宽图PNG截断和领域图连线文字重叠。全量文档架构检查通过：7层、34组件、80份受治理文档；framework-docs的30份文档检查通过；git diff --check通过。当前全量检查已无先前test-coverage元数据阻塞。未执行运行测试，不把文档检查作为Fork/Join运行证据。
