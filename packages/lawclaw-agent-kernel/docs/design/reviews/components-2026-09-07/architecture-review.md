# 架构评审

历史范围：资源分配部分已被ACR-2026-0012撤销；本页保留当时评审依据与结论，不能作为新FlowEngine系统协议的开发或验收要求。

日期：2026-09-07。独立评审；只修改本报告，不修改被评审文档或既有 FlowEngine。

## 范围与结论

按用户最新范围，评审 L1/L2/L3/Security 的 23 个待设计条目；Ops、Infrastructure、L4 执行器只核对消费方依赖要求，不以其完整实现设计为本次通过条件。全文阅读了这些组件、scope.md、CD-1，参考 FlowEngine 第21章及 L1/L2 层设计、BND-L12-001。评审时主代理正在收窄范围，以下定位针对首次 CD-1 草稿，后续需要逐项复核关闭。

**初审不通过：4个 P1、2个 P2，无 P0。** 唯一推进权的方向已明确，但单步身份、Child 权限失败、终态清理以及非阻塞资源取得尚不能由开发者直接实现为唯一行为。

## 数量与必要性

37来自清单38页减去已有FlowEngine；它只回答缺设计的文档数。19独立/5内部/4门面/6机制/3条件启用是合理的初始交付分类，但不证明37个独立实现单元必需。按最新范围应为16独立/3内部/4门面，外部14项退出本轮实现设计。

- Registry、Session、Run、Memory、Scope、Permit具有不同权威事实，分开设计可避免互相覆盖；不因此要求不同数据库或服务。
- Context、路由与Parser的计算需要可检验算法，但单Agent首版的CapabilityRouter可以是Gateway调用的纯函数模块。把它列为独立设计单元合理，不能据此新增动态注册中心。
- RuntimePool、Parser、Guard随父组件交付合理；Guard的检查仍强制存在。三个门面加PEP模式没有理由新增状态库。
- Scheduler与ResourceManager职责可以区分为“选哪个Run”和“能否占资源”；二者不能再各自创建第二个资源等待队列。AR-04尚未完成该收敛。
- Ops/Infrastructure/L4职责有实际依赖用途，但启用条件不等于本轮必须完整实现。此次缩小范围符合用户意图；14项不得纳入23项的完成分母。

## 发现

### AR-01 / P1：模型限额错误地绑定Attempt，正常工具循环会被截断

定位：`layers/l2-cognitive/components/agent-runtime-loop.md:82`；FlowEngine §21.4。

反例：同一个Attempt完成InvokeModel(C1)→ToolObserved→Ready，Core提交InvokeModel(C2)。FE只在恢复接管时新建Attempt，正常下一轮仍是原Attempt；CD-1却规定“每Attempt最多1模型调用”。按字面实现会拒绝C2，或迫使Scheduler为每轮创建Attempt并重建事件，破坏恢复边界。

修订：限制应为每个已提交commandId最多一次外部模型执行，同一Attempt允许多个按序命令，轮数由RunUsage/RunBudget约束。补完整两轮工具轨迹验收，确认attemptId不变、commandId不同、重复C1不发送、合法C2发送一次。

### AR-02 / P1：Parent逻辑终态与Child清理完成存在互斥承诺

定位：`layers/l1-control/components/subagent-coordinator.md:19,58,89`；FlowEngine §21.4取消规则。

反例：Parent等待正在执行工具的Child，收到取消。Core立即T2提交Parent=Cancelled和CancelOutstanding；Child尚未收到取消，随后还可能在30秒清理期内返回。此时“Parent终态后活动Child数量为零”不成立。若SubagentCoordinator为满足该验收阻止Parent终态，又会与Core唯一推进表冲突。

修订：在本轮组件文档中明确定义Run逻辑终态与Scope清理完成为两个事实：终态阻止新业务授权，既有Child进入耐久清理/受控移交；只有清理完成才承诺活动数为零。说明CancelOutstanding的唯一消费方及重启发现未清理Scope的方法，补取消先提交、Child后停止和30秒仍未知的精确观测。不得在Host暗加第二套终态判定，也不修改本轮只读的FE文件来掩盖矛盾。

### AR-03 / P1：Child/Memory权限流程不能由现有工具Proposal契约表达

定位：`contracts/component-development-contracts-v1.md`的permission-decision-engine、pep-enforcement、subagent-coordinator章节；`layers/l1-control/components/subagent-coordinator.md:83,95`。

反例：CreateChildRun已提交，Child的PDP返回Ask。Parent当前是AwaitingChild，FE只在Suspended(approval)消费ApprovalResolved；ScopeLink没有等待审批或拒绝阶段，DecisionRequest却只接受有toolDescriptorRef/argumentsRef的FE ActionProposal，不能准确绑定ChildSpec。开发者只能伪装成工具或私下推进Parent。Memory apply同样被声明需要独立授权，但缺少非工具动作的数据形状。

修订：保持FE工具ActionProposal不变，在Security契约增加明确判别的tool/child/memory/read动作输入与各自摘要绑定；选择Child首版Ask的确定处理方式并冻结Saga阶段、审批回传消费方和稳定命令身份。若Child未创建即拒绝，定义受信ChildCompleted(failed)的耐久拒绝记录与因果验证来源，使Parent可通过Core失败，不能只等待不存在的Child终态。

### AR-04 / P1：Scheduler要求非阻塞获取，但资源契约只提供最长5秒等待的acquire

定位：`layers/l1-control/components/run-scheduler.md:76`；`layers/l1-control/components/resource-manager.md:94`；CD-1 resource-manager操作。

反例：全局1槽已占用，第二Run取得claim后调用唯一acquire。若按ResourceManager/FIFO等待5秒，Scheduler无法遵循“失败释放claim并保留runnable”的即时行为；若为每个Run创建等待Promise则引入第二个等待队列；若把业务deadline改为now来模拟tryAcquire，到期校验会连空闲槽也拒绝。

修订：为消费方冻结tryAcquire的原子即时语义（或acquire带封闭waitMode），未满足返回RESOURCE_EXHAUSTED而不入Capacity等待队列。Scheduler只使用即时模式；明确claim释放操作及失败时归属。补1槽占满、2个Root和1个Child的轨迹，验证资源等待项不增加、claim不被无谓续期、原durable runnable保留。外部Capacity只需按该依赖契约实现，不要求本轮展开其实现。

### AR-05 / P2：root预算是子任务池还是含Parent的总账，未明确

定位：SubagentCoordinator CD-1正常流程；CD-1 ScopeBudget。

反例：Root maxTurns=16，Parent已保留1轮，Child请求16轮。单独Run预算与Scope子预算分别均合法，但若“root预算”表示全树总量，实际会超过16；ScopeBudget.used与RunUsage分别由谁在什么事务更新未说明。

修订：明确ScopeBudget为独立子任务池还是全树总账。如果是子池，声明Root自身Run预算不包含Child执行消耗并冻结池初始化值；若全树总账，提供Parent预留与Child分配的共同账本更新协议。无须引入跨机预算服务。

### AR-06 / P2：层设计仍指向旧循环与调度创建Child的职责

定位：`layers/l1-control/README.md` §1、§4、§5；`layers/l2-cognitive/README.md` §4；`contracts/bnd-l12-001.md`核心语义。

CD-1已说明Core唯一决定、Host只协调、L2单步、RunRegistry创建Child；上层仍描述L2恢复后继续循环与Subagent→Scheduler创建Child。开发者从权威导航入口进入时会获得不同职责图。修订上层文字和边界映射，明确旧描述被哪个新契约替代；图未更新时标明待同步及具体差异，不能用新增章节自动覆盖所有旧箭头。

## 已成立的边界与复核要求

CD-1协作段把Core计算、RunRegistry提交、Scheduler选择、Host协调与L2执行区分开；ToolRuntime的STARTED胜者唯一调用L4；RuntimePool不因断线切换Runtime重发；Session显式追加与Run转录T2分离。这些方向正确。

关闭上述发现需要文档中的确定行为及对应输入/预期，未要求本次先实现外部机制。文档复核通过也不代表SQLite、授权或实际恢复已验证，更不代表架构所有者批准。

## R1复核（2026-09-07）

实际重读修订后的CD-1、Subagent组件、scope、16项跨组件验收矩阵以及L1/L2层与BND-L12，核对L2和资源调度的修订文本。以下结论替代初审的当前状态；初审保留作为问题来源。

| 发现 | R1状态 | 已核对证据 |
|---|---|---|
| AR-01 / P1 | 关闭 | L2配置明确每command最多一次，同Attempt多个不同命令；K-TC-04保持Attempt不变、两模型命令各执行1次、重投旧命令不发 |
| AR-02 / P1 | 关闭 | CD-1 Child取消闭环明确Core先提交Cancelled，Host CommandDispatcher唯一消费CancelOutstanding，独立CleanupRecord/祖先栅栏/扫描/30秒incident；K-TC-11不将逻辑终态误报物理停止 |
| AR-03 / P1 | 关闭 | SecurityAction增加child/memory类型和摘要，非工具Ask明确ACTION_APPROVAL_REQUIRED、不进入工具审批状态；ChildAdmissionOutcome提供未创建Child的耐久失败凭据及T1来源校验；K-TC-06/09分别覆盖授权分支与受理故障 |
| AR-04 / P1 | 关闭 | CD-1资源闭环新增tryAcquire与releaseClaim，容量不足不入等待队列且保留runnable；K-TC-13覆盖1槽、Child与额外Root竞争 |
| AR-05 / P2 | 关闭 | RootChildPool与Root自身RunBudget独立，明确默认全树上限32轮/64工具；Scope按originCommandId唯一预留不退还，Child仍受父剩余额度校验；K-TC-10给出16拒绝/15允许与池剩1的数值例 |
| AR-06 / P2 | 大部分关闭，保留文字残留 | L1/L2 README与BND-L12已同步Core唯一推进、Child由RunRegistry受理和Run级sequence；Subagent前半部仍有下述旧句 |

当前**无未关闭架构P0/P1**；在本角色范围，23项内部组件的职责与关键协作可进入开发。该结论以CD-1 R1及组件末尾明确的适用规则为解释依据，不是全部五角色联合通过，也不是代码/外部依赖已实现。

### AR-06残留 / P2：Subagent旧Port描述和清理主语需统一

复现定位：`layers/l1-control/components/subagent-coordinator.md` §3 Port表仍将RunSchedulerPort描述为“统一创建和调度 Child Run”；§5仍说“无法确认Child终态时Parent保持收敛中”。同页正常流程、验收和CD-1已明确创建者为RunRegistry、Parent可已Cancelled，故该残留不再构成行为选择阻断，但会误导只读概要的开发者。

建议只改两句：Scheduler负责通知调度；未确认时Scope/Cleanup保持收敛或incident，Parent逻辑终态不回退。同步Port列表中的RunRegistry受理入口名称。图本次未重新渲染或做视觉验收，不能把上述文字复核当成图形验收。

验收矩阵给出的16项是可实施的故障规格，未执行，风险状态应继续保持待实现验证。外部14项不在本轮开发就绪分母。

## 最终文字复核（2026-09-07）

已实际核验Subagent组件§3与§5：RunSchedulerPort现为“仅提示统一调度；Child创建经RunRegistry的admitChild”；未确认Child终态时由Scope清理保持收敛/incident，Parent逻辑终态不回退。**AR-06关闭。**

本次架构评审6项发现全部关闭，未关闭P0/P1/P2为0。23项内部设计在本角色范围达到待开发状态；完整交付仍以其他角色独立结论为准，外部14项与实现/运行验证不在此通过结论内。
