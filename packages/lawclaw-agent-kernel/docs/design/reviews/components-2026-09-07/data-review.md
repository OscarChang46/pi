# 数据设计独立评审

日期：2026-09-07。对象：CD-1、RunRegistry、SessionManager、ContextEngine、MemoryManager、SubagentCoordinator、ToolCallRuntime（含 Guard）、StateStorage、ArtifactStorage 全文，以及 FE-CON-1 第 21 章。仅评审文档，不修改设计，不将设计推演当作运行测试。

结论：**尚未达到待开发状态**。P0 0 项、P1 5 项、P2 1 项。Run T1/T2、旧 claim 屏障、Tool STARTED 后不重执行的方向成立；下面的跨组件字段及事务缺口仍会让实现者自行选择不同语义。

## DATA-01 / P1：Child 的稳定身份及父取消条件无法通过受理契约传入

位置：`contracts/component-development-contracts-v1.md:198,248,318-320`；`layers/l1-control/components/subagent-coordinator.md:83,89`。

问题：设计要求 RunRegistry 按 FE childId 幂等受理，并在受理线性化点复核父取消和 claim。唯一 `admit(StartIntent)` 输入没有 childId、parentRunId、parentClaim、Scope 预留收据或授权启动回执。ScopeLink 又没有已选 Session/Route/Agent 版本，恢复 reserved 无法完整重建 StartIntent。

反例：Scope 已 reserved，Parent 取消后恢复器重新走普通 admit；仅凭 StartIntent 无法在 Run 事务里识别需要拒绝的 Parent，也不能证明返回 runId 就是 FE 稳定 childId。查询 childId 会始终不存在或产生孤儿 Run。

修法：给内部受理增加封闭 `admitChild` 请求，包含已提交 CreateChildRun 引用、稳定 childId、父当前 claim/cancelEpoch、Scope reservationId、不可变 admission bindings、Permit/startGrant 证据。明确同 SQLite 受理事务权威读取父状态与预留，原子插入 childId 索引及受理回执；Scope 保存 Session 分支身份与精确版本。无需改变普通 Gateway 的外部受理能力。

验收：在 reserved、Session 已建、Run 已提交三个窗口分别终止进程；父取消先提交时新 Child 数为 0，受理先提交时恢复与取消始终引用同一个 Child。

## DATA-02 / P1：Root 总预算与 Parent 自身用量没有统一扣减协议

位置：`contracts/component-development-contracts-v1.md:318`；`layers/l1-control/components/subagent-coordinator.md:83,89`；`layers/l1-control/components/flow-engine.md:2352,2356,2380`。

问题：ScopeBudget 只有 allocated:RunBudget、used:RunUsage；文字要求预留“完整 Child 预算”，但没有明确累计维度、Parent 自身已用量与未来余额、T2 和 Scope 预留的关系。RunBudget 同时混有累计动作数和单次上下文大小，不能全部直接相加。FE 只增加当前 Run 的 turns/tools/childrenReserved。

反例：Root maxTurns=16，Parent 已用 1 轮；为 Child 预留 16 轮仍满足 Child 单项不大于 Parent 的判断。Child 用满 16 轮后 Parent 再执行 1 轮，总数 18；各自 Run 的 T2 均合法。“不退还预留”并不能阻止这个超支。

修法：明确 Root 总额只累计哪些维度、每个 Run 获得的独占额度与消耗之间的公式。增加按 commandId 唯一的 reservation、ledgerVersion、parent allocation/delegated counters；选择并写死 Parent 余额转移或 T2 联合校验协议，确保 Parent 和 Child 不重复拥有同一额度。bytes/token 窗口等单次上限采用子集约束而非总和扣减。

验收：Root 16 轮，Parent 已用 1 轮时 Child 请求 16 必须失败；将剩余额度全部委派后 Parent 的后续模型动作必须按已确定策略拒绝。覆盖预留响应丢失及重复 Join，额度不得增加。

## DATA-03 / P1：Context 确定性所依赖的 Memory 和估算器版本没有输入身份

位置：`contracts/component-development-contracts-v1.md:270,282`；`layers/l1-control/components/context-engine.md:77,83`；`layers/l1-control/components/memory-manager.md:78,84`。

问题：ContextRequest 只有 FE bindings、转录头、预算及 requiredMemory；FE bindings 不含 MemorySpace/version、queryRef、indexVersion、estimatorVersion。正文却要求冻结检索索引、scoreRank、估算器并在相同来源下重建同一 Prompt。MemoryView 也没有检索/索引身份，ReductionTrace 的 reason 联合不能表达正文要求的 unavailable。

反例：Session@7/转录头 A 不变，第一次组装读取 Memory@8，重启后读取 @9；两个请求字段完全一致但 Prompt 不同。或者相同 Memory 版本在更换检索算法后排名改变，预算裁剪选入不同条目，无法复现先前 Frame。

修法：增加不可变 ContextSourceSpec 或受控 sourceSpecRef，固定 MemorySpace/version/query/index algorithm+version、授权 epoch、估算器/模型窗口版本和源排序规则；由 Run/命令或组装回执持有该身份。补全检索结果排序键、Prompt 序列化方式和 Trace unavailable 原因。若某来源首版不使用，明确空集合，不能运行时猜测最新值。

验收：固定完整 source spec，改变最新 Space/索引/估算器后输出 digest 不变；冻结版本不可获得时显式失败/按已冻结可选策略降级，并保存不同降级身份。

## DATA-04 / P1：Pin 回收缺少可恢复的领域事务绑定和迟提交屏障

位置：`contracts/component-development-contracts-v1.md:92,102-104`；`layers/infrastructure-plane/components/artifact-storage.md:49,55`。

问题：Pin 只有 pinId/ownerRef/artifactId，而恢复要求“owner 查询领域收据后释放”。未规定 owner 如何定位具体组件、command/transactionId，非 Run 领域也没有相应失效/屏障操作；保留 pin 的创建成功而领域操作尚未开始窗口缺少明确恢复记录。

反例：Session append 先 pin 后事务请求超时，清理器只查到暂时 absent 就 unpin。延迟 append 随后提交，GC 删除 Artifact，Session 成为悬空引用。如果为避免此问题永远不释放无法关联的 pin，失败写入可持续耗尽 10GiB 配额。

修法：Pin 增加封闭 ownerKind、ownerId、operationId/transactionId、payloadDigest 及 pending/attached/releasing 状态；明确领域事务原子附着 pin，或定义与所有领域写入共享的取消/屏障后 absent 证明。恢复扫描能列举 pending pin，并通过固定查询接口发现提交、确认未提交或保持 incident。禁止将一次 absent 当释放证据。

验收：pin 已成功后分别在领域提交前/中/后终止，双屏障安排 absent 后迟提交；所有已提交引用可读，确认未提交者可回收，不出现永久不可追踪 pin。

## DATA-05 / P1：Session 历史没有能支持完整轮次筛选的内容契约

位置：`contracts/component-development-contracts-v1.md:234-236`；`layers/l1-control/components/session-manager.md:80-86`；`layers/l1-control/components/context-engine.md:77`。

问题：SessionDelta.entries 仅为 Artifact[]；sourceSequence 是单个序号。没有消息角色、轮次边界、Proposal/结果关系或不可变转录切片身份。Session 要验证“完整已提交轮次”、Context 要按整轮保留工具链，不能从仅含 id/digest/bytes 的 ArtifactRef 推导这些内容。正文未指定 Artifact 内部的完整历史 Schema。

反例：一次 append 只提交工具结果 Artifact，声称来源 sequence 合法；另一次提交对应 assistant Artifact。两次 CAS 都合法，但 Context 裁掉一项后出现裸工具结果，完整链验收没有统一判据。

修法：定义规范化 SessionHistory/Turn Schema（或使用有序 TranscriptEntry 加完整轮次描述），明确 sourceRunId、起止序号、转录头/提交收据、角色及 Proposal 对应关系。append 服务验证该切片确实出自权威已提交转录、完整且顺序正确；禁止客户端任意 Artifact 列表冒充历史。

验收：拒绝裸结果、缺失 Proposal、反向顺序及跨 Run 拼接；合法多工具完整轮次在 branch/恢复/裁剪后保持同一因果关系。

## DATA-06 / P2：Artifact 发布耐久点缺少目录项同步

位置：`layers/infrastructure-plane/components/artifact-storage.md:49`。

问题：目前写明 fsync 数据、rename、耐久索引，但没有目录项持久化步骤。进程 kill 与断电/OS 崩溃不是同一故障；索引可恢复不证明 rename 的目录项已耐久。

修法：将所支持本地文件系统的发布顺序写为数据同步、rename、目标目录同步、索引提交；不支持必要同步能力的档案不得宣称断电后发布耐久。清理/补发布恢复也以同一顺序为依据。

验收：分别报告进程终止测试与文件系统/系统崩溃证据；故障后不得出现 published 索引指向缺失文件。当前不是已观察到的数据丢失。

## 关闭条件

上述每项需要权威契约与对应组件同步修订，并以精确输入、事务顺序和期望状态补入验收场景。评审复核通过只说明规格可交给开发；实现、真实持久性与外部系统验证仍须独立完成。

## R1复核（2026-09-07）

复核范围按用户修订限定为 23 个 Kernel 内部待设计项；Ops/Infrastructure/L4 的 14 项只审核 Kernel 消费方所需契约，不要求其具体实现设计。读取当前 CD-1 R1、相关组件修订、Infrastructure kernel-dependencies 和 16 项统一验收矩阵。以下结论替代本报告开头的首轮结论，但不删除首轮证据。

**数据角色结论：原 5 项 P1 的设计缺口已闭合，未发现新增 P0/P1；可进入 Kernel 开发。** 原 DATA-06 按外部依赖保证闭合，外部 Adapter 的断电耐久证明不属于本轮完成条件。保留 1 项 P2 文档一致性修正，见 DATA-R1-01。这里的关闭是规格关闭，K-TC 测试尚未执行。

| 原问题 | R1核对依据 | 结论与验收 |
|---|---|---|
| DATA-01 Child受理 | CD-1 `Child受理、预算与取消闭环`：ChildAdmissionRequest 携带稳定 childId、parentClaim/cancelEpoch、originCommand、reservation、admission 和安全回执；受理事务检查父权威状态。Scope 保存完整绑定；rejected 之前要求失效/屏障，拒绝结果有耐久通知 | 已闭合；K-TC-09覆盖三个崩溃窗口与取消顺序，K-TC-11覆盖后代清理 |
| DATA-02 预算 | 同节明确 Root Run 与 RootChildPool 为独立额度，默认全树上界32轮而非16；所有后代从同池按完整预算预留，Parent当前剩余另作上限，CAS去重且不退额 | 已闭合。原16轮全树反例不再适用新契约，不能按旧口径继续判超支；K-TC-10有16/15与并发预留的精确预期 |
| DATA-03 Context来源 | CD-1 ContextSourceSpec 固定Memory Space/索引/算法/epoch、估算器和窗口；freezeContextSources持久冻结，AssemblyReceipt固定命中与降级，重试读既有回执；ctx-json-1约束顺序及编码 | 已闭合；K-TC-05覆盖换版不变与撤销拒绝。实现必须测试“第一次组装失败”和“已有降级回执后服务恢复”两个不同状态 |
| DATA-04 Pin恢复 | Infrastructure依赖R1明确ownerKind/operationId/transactionId/payloadDigest、耐久关联、原子附着或失效屏障证明；禁止一次absent释放，提供queryOperation/invalidateOperation/confirmAbsentAfterBarrier | 消费方规格已闭合；K-TC-15覆盖迟提交顺序。实际GC实现与外部数据库机制验证不扩大为本轮任务 |
| DATA-05 Session轮次 | SessionDelta使用TranscriptSlice/HistoryTurn；CD-1规定助手Block、结果一一匹配和连续已提交切片，经RunRegistry读取权威内容验证，禁止任意Artifact列表 | 已闭合；K-TC-05覆盖裸结果、逆序、跨Run，局部Session TC继续覆盖CAS与分支版本 |
| DATA-06 Artifact耐久 | Infrastructure依赖R1要求内容及名称索引均耐久，指出仅数据fsync不足；发布未知时Kernel不能引用，并要求Adapter说明故障档案 | 按范围外依赖保证闭合。并非断言外部已实现断电恢复 |

### DATA-R1-01 / P2：依赖目录仍保留旧Pin签名

位置：`layers/infrastructure-plane/kernel-dependencies.md:5` 与 `:45-47`。

R1顶部已经要求完整操作/事务身份，下面的 Pin 类型与 pin 请求仍只有ownerRef/artifactId。如果开发者直接从分项表生成类型，会漏掉R1必填字段。由于顶部“须带”已明确要求完整字段，本项不再按缺失恢复协议列P1。

修正：将分项表的Pin及pin请求直接替换为R1完整字段，或明确它是非规范旧摘要并只链接R1类型，避免同一文件两套签名。无需增加外部实现设计或工具。

本次复核只追加评审结论，未改设计、未运行实现测试。开发门槛仍需其他四角色共同结论；数据角色通过不能代替架构批准。

## R1最终关闭核验（2026-09-07）

仅复核 DATA-R1-01：`layers/infrastructure-plane/kernel-dependencies.md:45-47` 已统一为完整 PinRequest，包含 ownerKind、ownerId、operationId、transactionId、payloadDigest、artifactId；Pin复用该请求并增加身份及阶段。unpin明确pending需要失效/屏障后未提交证明，attached需要领域解除引用凭证。旧ownerRef简化签名已替换，与顶部R1所需保证一致。

**DATA-R1-01关闭。数据角色最终未关闭问题：P0 0、P1 0、P2 0。** 按既定23项Kernel内部范围，数据设计评审通过，可作为待开发输入；外部依赖实现及全部K-TC运行证据仍未由本报告证明。初审和R1复核保留供追溯，本次未修改设计。
