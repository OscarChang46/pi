---
doc_id: L1-REV-009
level: review
layer: L1 Control & Orchestration Runtime
component: ContextEngine
status: reviewing
baseline: AKB-2026-09-03-09
authoritative_for: ContextEngine上下层一致性评审证据与未关闭问题
parent: L1-CMP-009
interfaces: []
diagrams: []
supersedes: []
---

# ContextEngine 上下层一致性评审

最新增量见文末“来源转换契约”。此前的输入摘要和问题状态为历史审查快照，不能用于判断本轮新契约已通过实现验收。

组件设计：[ContextEngine](context-engine.md)。本文件随组件归档，仅承载评审证据；变更决策见[ACR-0013](../../../../governance/changes/ACR-2026-0013-context-assembly.md)。

日期：2026-09-08。使用architecture-design-review，范围为ContextEngine及直接约束链，不是全库所有组件语义审计。结论：**未通过开发就绪评审**；1项上下层依赖定义冲突、4项契约或恢复证据不足。仅记录审查和修订建议，不改变设计批准状态或实现。

## 输入与决策状态

分支codex/arch-agent-system-v3，HEAD c482b79735d83c3150d962cd9dbe19d0264a226c；审查包含未提交工作区，不能只用HEAD复现。ACR-0012已确认FE统一关联方向；ACR-0013仍IMPACT_ANALYZED。其他候选文档用于核对设计一致性，不视为已批准实现。

| 主要输入 | SHA-256 |
|---|---|
| [总设计](../../../agent-kernel-design.md) | 2bb991f58b6ca883d5c001f2dd5bd84c12a3af6edd5675e9aa8cb1d20e1d1e46 |
| [L1层](../README.md) | 3b8b22f1f39436929fe28fb5ecf80e3f9d402b0068d683cc2255923629350ca2 |
| [Context组件](context-engine.md) | 3be2f378108342133a49751a7f41013cddfd0f72849dc3d2a4424f3c5ae53e07 |
| [CTX-CON-1](../../../contracts/context-assembly-contract.md) | 0dde391ac6ef5bfe27aab7bfd3ac567b15e0b41f7318a772bb1d4c93d2c8002e |
| [CD-1](../../../contracts/component-development-contracts-v1.md) | 04c235eb6b25b1ad08bb1b903cbc959f67991246a2e0fbc8e26ca39a7eb89323 |

另核对SessionManager的ensure/branch约束、BND-L1/MEM/INF、FlowEngine入口及SR-FE-SYS-02。对相邻组件只审查本模块依赖的行为，不作其完整性结论。相关输入变化后须重审受影响项。

## 上层约束追踪

| 上层约束及位置 | 模块位置与行为 | 结论 | 场景影响与处理 |
|---|---|---|---|
| 总设计§5.2、§11：Session/Memory权威独立，Frame为投影 | Context§1/3/6：只读来源，不写Session/Memory、不启动模型 | 一致 | 必选超限返回失败，不改权威历史 |
| L1§4：Context只列Session、Memory、Artifact查询Port | Context§5.1/7.2与CTX-CON-1§3：FrameFreezer发布Artifact并确认回执 | 冲突 | C01，层允许依赖未覆盖新增发布职责 |
| SessionManager§1.1/2.3：ensure归Session命令，指定版本查询不创建 | Context§4.1、CTX-CON-1§1 | 一致 | 同key并发ensure归Session唯一键，历史缺失不伪造 |
| 总设计§12、CD-1“Child业务输入与Session协调要求”：SM Coordinator拥有父子恢复 | Context§4.3：Context只组装冻结输入，不持协调进度 | 一致（方向） | Fork/Join 开发验收仍须以 SessionManager `SES-JOIN-T-*` 实现证据关闭 |
| 总设计§13、CD-1冻结闭环：绑定固定，重复不能改变输入 | Context§7及CTX-CON-1§3 | 证据不足 | C03，合法降级与非确定结果的比较缺契约 |
| CD-1冻结闭环：规范助手建议与结果一一匹配、稳定排序 | Context§5.2/6.2、CTX-CON-1§2 | 证据不足 | C02，结构算法所需类型与关系未闭合 |
| SR-FE-SYS-02 S5/S6：Completed不执行回调，Started未完成只能对账 | Context§4.4/6/7.2 | 证据不足 | C04，释放前鉴权与对账查询的拦截位置未定 |
| UP-RES-001、UP-SEC-001：容量有界、授权失败关闭 | Context§6.3/8：完整预算、记录/关系限额、逐边界复核 | 一致（规则） | 尚无容量测量或安全集成证据 |
| UP-DEP-001/002/003：Port隔离与组合根装配 | Context§5/9：reader注入，工作集私有，无具体存储类型 | 一致（结构方向） | 发布依赖按C01另行关闭 |
| 总设计§17步骤2：接口唯一来源和完整定义 | CD-1§公共类型、Context契约引用FE-CON-1 | 证据不足 | C05，指向已无第21章的FE入口 |

## 发现与关闭条件

### C01 / P1：只读依赖表与组件内发布职责不一致

证据：L1§4的ContextEngine行只允许查询；组件§5.1明确FrameFreezer持有ArtifactPort、AssemblyReceiptPort，§7.2先发布再确认。总设计§6.1允许Context逻辑持久化，因此这不是证明“Context一律禁止保存派生物”，而是层与模块尚未给出一致的授权边界。

例：assemble读完来源后直接确认持久回执，实现遵循类图却超出了层依赖表。

建议：保留上层只读组装边界，由外部Context发布适配层执行Artifact发布和confirm，组件返回冻结候选；公开assemble门面仍可等待发布完成后返回。若选择保留组件内发布，必须由架构所有者明确补充L1允许依赖，限定只写派生产物和回执、不拥有Session/Memory/Run。两案不能同时保留为当前正文。关闭需同步层定义、组件类图、确认点和契约；本次不代替所有者作职责选择。

### C02 / P1：结构准确性算法缺少可传递的关系契约

证据：组件§5.2只列SourceRecord的字段类别，§6.1要求dependencyClosure，§6.2按原Run/模型命令/callId配对。CTX-CON-1§2的KernelMessage声明“沿用公共规范类型”，但当前活动设计未找到其完整定义；CD-1定义的是HistoryTurn及TranscriptEntry体系。Requirement成员引用未规定到记录、资料、片段或因果单元的统一身份空间；SourceRecord的显式依赖边、稳定顺序和来源kind契约也未闭合。

例：两个Run都出现callId=c1，或者一段资料依赖另一段可选资料；两个reader可能输出不同引用格式，Organizer无法按统一契约配对或补齐闭包。当前固定排名要求scoreRank，但CD-1 MemoryView.entries没有对应字段，也没有明确的排名返回结构。

建议：明确SourceRecord及SourceIdentity、依赖边、顺序键、规范消息类型和Memory排名的唯一契约来源；给出从Session/Run/Memory到规范记录的映射。关闭用独立夹具证明跨Run同callId不误配、乱序结果稳定、跨单元依赖闭合；不能仅补可编译类型而不定义语义。

### C03 / P1：并发确认缺少判断来源证据是否相同的协议

证据：CTX-CON-1§3同时规定同inputDigest返回原结果，以及完整来源证据相同但frameDigest不同为确定性缺陷。confirm输入只有key/result，result提供inputDigest、frameDigest、degradedSources和traceRef，Trace内容及来源证据比较规则未定义；没有明确由谁加载Trace、如何验证降级证据及判断优先级。

例：A/B同key同输入。A因Memory暂不可用生成F1，B读取成功生成F2，这是允许由首个回执固定的差异；但相同来源因排序缺陷得到F1/F2必须报错。实现若只按inputDigest幂等返回就掩盖缺陷；只按frameDigest拒绝又误拒合法降级。

建议：定义来源读取清单/证据摘要、降级原因及Trace完整结构；明确提交前证据验证者和比较顺序，存储端口只执行已确定的唯一性与条件提交规则。关闭需覆盖合法降级竞争、相同来源不同帧、伪造降级理由及提交响应丢失四类测试设计。

### C04 / P1：Activity回放与授权、查询恢复的操作映射未闭合

证据：SR-FE-SYS-02 S5的Completed直接返回保存结果而不执行execute；Context§4.4/8要求每次释放Frame重新鉴权，§6要求读/发布I/O复用Activity，但未列操作级包裹边界。文档已承认Activity映射待复核，此处是确认该缺口会影响安全与恢复，不声称已经发生旁路。

例一：若把整个assemble及授权检查放进同一个Activity回调，恢复命中Completed将跳过重新鉴权。例二：findAssembly查询Activity已经Completed=absent，随后confirm提交成功但响应丢失；恢复若复用原查询key将持续回放旧absent。

建议：列出来源读取、发布、确认、对账查询各自的Activity身份、返回值、重放/未知行为与当前授权检查位置。释放鉴权必须位于可跳过的历史回调之外；对账查询必须能读取新事实且遵循FE受信维护入口，不能换业务动作key盲目重发。Memory query还应保留CD-1的CommandMeta安全回执语义。关闭需双屏障撤销及confirm后崩溃的完整轨迹。

### C05 / P2：公共类型仍指向已移除章节

证据：CD-1开头称FE-CON-1引用FlowEngine第21章，并据此引用Ref/Digest/FrozenBindings等；当前FlowEngine入口为SR目录，没有第21章。CTX-CON-1继续继承CD-1公共类型及FE-C14N-1。因此文件链接虽有效，语义目标已失效。

建议：为ReAct公共契约指定当前有效的独立权威来源及版本，逐项迁移引用；历史归档只能说明来源，不能自动成为现行批准契约。关闭需能从CTX-CON-1逐级定位每个继承类型和规范编码定义。

## 场景走读与五视角结论

- 主成功：ensure取得Session@7 → 绑定head42 → 读取 → 结构整理 → 预算 → 发布/确认 → 采纳 → 模型。职责前半段清楚，C01/C02/C03阻止整条链开发就绪。
- 并发：head42组装晚于head43采纳，组件要求拒绝旧帧；该规则正确，但当前仅有测试设计，不声称CAS集成已验证。相同head竞争回执由C03阻塞。
- 异常恢复：分支成功但Child受理未知保持待核对，与FE归属一致；组装确认后崩溃和撤销后Completed回放由C04阻塞。
- 扩展：合同片段reader复用Organizer/BudgetReducer的方向正确；C02未补齐前，新增reader仍需自行发明事件和依赖编码。

架构关注C01；安全关注C04；数据关注C02/C03/C05；测试已有25例设计，但未覆盖上述全部判定分支；运维已有有界档案，延迟告警配置和容量实测仍待补。没有发现需要Context拥有Session/Memory或另建Child协调器的理由。

## 验证与范围限制

本轮自动检查：`bash packages/lawclaw-agent-kernel/scripts/check-document-architecture.sh`通过，7层、34组件、80份受治理文档。它没有验证语义目标章节及自然语言一致性。

本轮检查了内嵌PlantUML关系含义，未重新渲染或执行视觉验收；未执行代码测试、持久化/安全集成或性能测试。既有图形验证不冒充本轮证据。只新增本评审记录，未修改候选设计、批准状态或运行代码；未提交。

## 2026-09-08 sub-session 上下文与生命周期增量复核

本增量按用户五项反馈复核 SessionManager、ContextEngine、CTX-CON-1 与 CD-1。上方SHA-256和“只新增本评审记录”是前一次审查快照，不覆盖本次增量；G3前必须重新冻结全部输入摘要。

问题：原场景把“共享冻结快照”写得像两个Session共享黑板；部分失败只给策略结果，没有可复现构造；sub-session销毁、端到端链路和部分父上下文Token验收缺失。例子：Child分支已建但Context回执UNKNOWN，如果先归档再恢复，既可能丢失权威Frame，也可能另建Child；若默认复制Parent全文，安全范围和Token成本同时失控。

候选解决方案：一次性只读Child被明确为“无Child Session的Run读取父冻结版本”；独立sub-session固定执行`Security确认 -> branch确认 -> Context assemble确认 -> FE受理`。Coordinator冻结ParentContextSliceSpec并只保存Context回执引用；ContextEngine不回调SM或FE。Child执行/组装UNKNOWN时不归档，明确未受理或Run终态后只做逻辑归档；物理GC等待retention、pin、outbox、UNKNOWN和incident解除。Partial Failure用ChildOutcomeScript、ManualClock/Gate和双屏障构造，不靠sleep。

| 复核项 | 设计证据 | 结论/剩余门槛 |
|---|---|---|
| 选择性继承 | SessionManager§4.2/4.4.8、Context§4.3/6.3、CTX-CON-1§2 | 职责和数据方向一致；可编译Schema、selector实现和授权reader仍待G3/实现 |
| 无同步循环 | SM单向调用ContextAssemblyPort；Context只返回派生回执；FE经outbox/inbox协作 | 设计一致；须用结构测试证明Context→SM/FE调用0且SM事务内Context/FE调用0 |
| Token上界 | `U_frame/T_base/U_parent`公式、完整Frame复核、next-unit与饱和夹具 | 方法可开发；估算器档案、Provider校准容差和真实usage证据未建立 |
| 创建/归档 | JoinMember正交Context/ChildSession状态及生命周期时序图 | 逻辑归档与GC边界明确；物理表、scanner与恢复测试未实现 |
| Partial Failure | A成功/B失败/C gate超时/迟到成功的确定脚本 | 策略oracle独立；需真实本地持久化和SIGKILL证据 |
| E2E | SES-E2E-01—06从Root ensure到Parent resume/Child archive | 场景闭环；当前均为待实现/未运行 |

增量没有关闭原C01—C05，也没有把候选设计提升为开发已完成。新增实现门槛为：ParentContextSliceSpec/TokenAccounting强类型Schema、版本化估算器与Provider校准档案、Child Context/Session状态迁移的穷尽测试，以及6条E2E的真实本地证据。当前结论仍是**未通过开发就绪评审**。

增量静态证据：文档架构检查通过（7层、34组件、84份受治理文档），架构依赖静态检查通过，权威PlantUML 19/19通过；本次改变的7张内嵌图另以PlantUML 1.2026.7逐张做语法检查并通过；acceptance.json解析与diff格式检查通过。未运行代码、持久化、Provider或E2E测试。

## 2026-09-08 串行调用约束与结构关系修订

本轮用户明确ContextEngine不是线程安全组件，SessionManager负责同Session当前Run及操作串行；批准按原Run/模型命令/callId完善结构关系。用户要求先从场景分析并发确认与回放鉴权，未批准独立回执机制。此处只记录该范围，不代替SessionManager修改自身约束，也不实施组装器。

| 上层/已确认约束及来源 | 本模块落点 | 结论与待办 |
|---|---|---|
| 本轮用户：同Session由SessionManager约束串行，组件非线程安全 | Context§3.3、§5.1、§7.1与TC-18；CTX-CON-1调用前提；ACR-2026-0017 | 候选契约已冻结同Session `0..1 ActiveRunBinding`；历史Run归RunRegistry，Attempt接管不在Context或Session复制lease。当前实现证据仍不足 |
| 总设计UP-CTX-002/003及L1§4：Frame投影、只读来源 | CTX-CON-1§2.1身份、配对、依赖与规范Frame映射 | 一致：不把当前组装Run覆盖原来源Run，不赋予依赖边读取权限，不写原转录 |
| CD-1 HistoryTurn/TranscriptEntry：完整轮次、建议与结果一一对应 | Context§6.2、CTX-CON-1§2.1及CTX-REL-T-01～06 | 工具结构契约已补；C02仍未整体关闭：CD-1 Child消息到KernelMessage的转换、Memory scoreRank协议及可执行Schema/适配测试仍需接口复核 |
| Run命令固定promptRef，Activity Completed复用结果（当前实现） | Context§7.2/7.2.1按重复入口、接管、丢响应、撤销拆分场景 | C03改为必要性待决：正常串行不触发合法确认竞争，建议复用Run采纳；不能直接以此删除尚在SessionManager等文档引用的旧候选回执 |
| CD-1 Memory查询每次释放复核授权；Activity回放可跳过回调 | Context§7.2.1六类场景 | C04场景/责任已具体化，操作映射与集成证据仍未关闭；复用执行事实不重发模型，重新交付正文才需当前授权边界 |
| 用户先查询/封装再必要写入；总设计§12及SessionManager§4当前仍先分支后组装 | Context§3.3明确旧时序不适用于新策略，CTX-CON-1标注待联合修订 | 已确认方向与旧候选不一致；创建意图/候选绑定协议由SessionManager后续设计同步，本轮不臆造接口 |

C01发布归属与C05公共契约失效章节未在本轮关闭。新增结构测试为测试设计，不是运行通过证据；新增前提也不能被当作上层已经实现的保证。当前整体结论仍为未通过开发就绪评审。

本增量验证：文档结构检查通过（7层、34组件、85份受治理文档），修改文件diff格式检查通过；Context组件全部内嵌PlantUML经本地`plantuml/plantuml:1.2026.7 -checkonly`语法检查通过，未执行视觉验收。未修改运行代码、未运行代码或系统集成测试。架构Skill同步增加模块适用约束；skill-creator的quick_validate因本机两个Python环境均缺PyYAML未能完成，不将其记为通过。

## 2026-09-09 算法策略与候选返回

用户要求算法可切换并删除第6节发布确认策略。Context§5类图、§6流程与算法、§9目录映射及CTX-CON-1已同步：AssemblyAlgorithm采用策略模式，默认CausalBudgetAssemblyAlgorithm独立实现选择；组合根按冻结算法ID/版本注入，公共结构/必选/预算校验不交给可替换策略自行决定。算法目录为`src/control/context-engine/algorithms/`，接口归`src/contracts/control/context-engine/`。新增CTX-ALG-T-01～04为待实现测试设计。

组装器输出改为内存AssemblyCandidate，已移除核心流程中的回执读取、Artifact发布与确认步骤，类图不再持有相应端口。这与L1§4只读来源、总设计UP-CTX-002有界投影方向一致。调用方负责保存候选，Run命令固定promptRef后视为采纳；读取与派发权限仍在对应安全边界检查。C01在核心职责层面已收敛，原外部场景/SessionManager Child绑定/旧AssemblyResult和独立回执档案仍须联合迁移；C02其余接口缺口和C05没有因此关闭，不宣称整体开发就绪。

本轮文档结构检查通过（85份受治理文档），Context内嵌PlantUML 8/8语法通过，第6节旧发布确认步骤删除检查与diff格式检查通过。仅修改设计，未生成算法运行代码，未执行代码或系统集成测试，未作图形视觉验收。


## 2026-09-09 延迟创建与完整候选契约传播

用户批准将两个缺口的处理方案写入专门场景，并要求修正Skill中职责/流程变化后漏查输入、输出及调用方契约的问题。本轮修改设计，不实施组装器，不改变整体批准状态。

根因不是只少列了两个异常场景：此前把流程改成延迟写入，却保留必填的已确认SessionAnchor；把组装器改成返回候选，却沿用只有systemPrompt/messages的旧ContextFrame。流程变化没有传播到字段的存在时刻、返回值容量及下游消费方式。正交场景走读也不足，没有组合“待创建/已存在”“内存/已保存/已采纳”“首次/恢复”。Skill现要求执行契约传播检查，并用对应失败窗口验证，不能只改流程图。

| 来源及约束 | 本轮落点 | 结论与边界 |
|---|---|---|
| 用户延迟创建决定；总设计§12原先先创建后组装 | 总设计§12、CD-1 Child协作、CTX-CON-1 §1、Context§4.1/4.3及类图 | 上层与新候选协议已同步；现有锚点、创建意图和只读来源分型，Context不创建Session |
| L1§4只允许Context查询依赖；UP-CTX-002投影职责 | CTX-CON-1 §2/3、Context§4.2.1/5/6 | 一致：只返回完整候选，外部整体保存并由Run采纳；不建立独立组装回执 |
| UP-DAT-001独立提交；Run固定InvokeModel(promptRef) | CTX-CON-1 §1/3、Context§4.4/7 | 一致（设计）：创建、保存、采纳分开确认；UNKNOWN读取当前权威，已采纳恢复原候选 |
| CD-1 L2 ModelStepRequest/AdapterRequest原来只消费旧frame | CD-1对应字段改为payload及format/adapter版本；CTX-CON-1模型适配契约 | 契约入口已同步；实际L2详细设计及Provider编码尚需联调复核，不宣称转换已完成 |
| SessionManager SES-BS-00/02、§2.1及§4协调流程仍先ensure/branch并返回contextAssemblyReceiptRef | Context§11和CTX-CON-1 §1明确新的调用顺序；本表保留冲突追踪 | 冲突未关闭：SessionManager需调整输入准备/创建/组装状态迁移、引用字段与失败清理。未修改该模块的完整协调设计 |
| CD-1 Memory.query要求当前Run资格，首次上下文可能在Run受理前准备 | CD-1冻结闭环明确联合复核项；FlowContext.initial现有实现先生成输入再受理 | 证据不足：首次准备的受控读取资格及冻结输入持久位置需RunRegistry/安全接口复核，不伪造已受理Run或提前建Session规避 |
| 当前flow-context.ts initial/prepare存AgentTurnRequest；types.ts ContextFrame和KernelAssistantMessage含旧结构/私有引用 | CTX-CON-1独立ContextPayload/ContextMessage及整体Artifact；Context§9/11迁移映射 | 代码仍不匹配新契约；本轮未改运行代码，不能以文档Schema推定编译或集成通过 |

新增CTX-SESSION-T-01～06和CTX-PAYLOAD-T-01～04覆盖延迟创建失败、赢家改绑、丢响应、父版本失效、只读隔离、序列化恢复、适配完整性和损坏拒绝；均为待实现用例。原重复TC-20～23追加段已合并为独立前缀，跨Run工具关系及接管测试继续引用。

仍未关闭：SessionManager/L2详细契约迁移、首次受理前读取资格、Memory scoreRank返回结构、Child观察到规范消息的映射、具体Provider编码/估算校准、Activity操作映射及C05公共规范来源。整体结论仍为未通过开发就绪评审，不能将两个局部修订报告为系统集成已闭合。

静态验证：文档架构检查通过（7层、34组件、85份受治理文档）；Context内嵌PlantUML 9/9语法通过，修改文件diff格式检查通过。未做图形视觉验收、代码编译或系统集成测试。Skill quick_validate因当前Python缺PyYAML未执行成功，不记为通过；已人工检查本轮新增规则、引用入口和适用范围。

本轮关键输入摘要（含未提交内容）：

| 文件 | SHA-256 |
|---|---|
| agent-kernel-design.md | e35b1862aa17caf0e3ddaae728f87e1af765ea6aff8148f52fb6710fc3f47049 |
| layers/l1-control/README.md | 167b572a9d9ee5822caffe48f98c174d98b57a591abeb10485a21d67466c7d80 |
| contracts/component-development-contracts-v1.md | f0b424d3ab07465bb3dbff3fd06eeb0da8b949451af315b05b0a9ce48984e700 |
| contracts/context-assembly-contract.md | 0e3eeadb72ba0b04a17f10456b884743d69bbdbd5b1015ecd873a1b091f14e72 |
| layers/l1-control/components/context-engine.md | e0e7fefcf31b5850c4c656ad9018bac2683c32e61dc4f1eb2a1b73bd1309f0ce |
| layers/l1-control/components/session-manager.md | 8f006c7ac57f2f8a0dd97a4928a0dbb8af3425991d3e1dfea6caef50baa2ac30 |


## 2026-09-09 Pi转换复用与备选组装

用户确认优先复用Pi转换能力，并将Pi组装实现作为备选写入设计。本轮在Context§4.2.1、§5类图、§6.1.1/6.1.2、§6.3、§9/10及CTX-CON-1修改正文，同时同步CD-1模型适配入口；没有生成运行代码或更改依赖。

| 约束或源码依据 | 设计落点 | 结论 |
|---|---|---|
| 总设计UP-DEP-001及§15：Pi在适配层，Core不导入Pi | PiModelInputAdapter及PiRecentHistorySelectorAdapter放infrastructure/adapters/pi-context；组合根注入，核心策略只依赖Port | 一致；不是将Pi Session作为Kernel新权威 |
| Pi agent-loop先transformContext再convertToLlm；默认convertToLlm过滤未知role | Context§4.2.1显式六字段投影与未知输入拒绝；预算/派发同版本，采纳后禁用再次裁剪 | 转换优先复用方向已确认；Provider投影和固定向量仍需实现前复核 |
| pi-coding-agent公开findCutPoint/estimateTokens；截断点按近期字符粗估选择 | Context§6.1.2及CTX-CON-1 historyRecords/RecentHistorySelectorPort | 可以提供连续近期历史建议，不代替Kernel必选/依赖/完整预算规则 |
| 原AssemblyAlgorithmInput只有单元引用，不含可供Pi计算的历史消息 | 增加规范historyRecords；默认可忽略，备选机械映射并返回recordRef截断点 | 输入、调用方、输出引用空间同步；Pi临时Entry编码向量尚待复核，不伪造持久Session |
| 用户原约束：纯选择、原文必选、已采纳恢复原候选 | Pi备选不调用compact，不触发模型或会话写入；算法在冻结前显式选择 | 一致；不作为失败后自动降级或恢复重选 |
| 原默认策略0.95饱和利用率 | 默认策略保留该门槛；Pi备选明确以连续后缀为目标 | 范围已区分；两种策略都必须满足结构及硬预算，备选不宣称同等预算利用率 |

新增CTX-PI-T-01～06覆盖完整转换、恢复不二次压缩、必选位于截断点前、Pi粗估与完整预算不一致、策略版本/切换及依赖边界。全部为待实现用例。

验证：文档架构检查通过；Context内嵌PlantUML 10/10语法通过，diff格式检查通过。未执行图形视觉验收、运行编译、Pi适配或系统集成测试。此前列出的SessionManager、首次读取资格、Memory排名及Child转换等阻塞项仍未关闭。

本次输入摘要（未提交工作区）：

| 文件 | SHA-256 |
|---|---|
| layers/l1-control/components/context-engine.md | 187061a5d7a2917d93e26ccc7d3fe882848773aa48043588ea046a835c1d6a50 |
| contracts/context-assembly-contract.md | 5954720c83cc30c59e91968471a382cdd07e640f52701ec2cfdef956a7dc95ce |
| contracts/component-development-contracts-v1.md | 30e153219adb014e762c5ab25fdc8b51bc720a7e72e18701b1633814d7040d9b |
| agent-kernel-design.md | e35b1862aa17caf0e3ddaae728f87e1af765ea6aff8148f52fb6710fc3f47049 |


## 2026-09-09 Pi软预算、固定映射与首次准备

用户确认前三项策略并要求更新设计；来源转换接口的初步建议不在本次确认范围。修改当前组件、CTX-CON-1、CD-1、总设计与ACR，未修改实现。

| 已确认决策 | 正文、契约与验收落点 | 结论 |
|---|---|---|
| 首版Token采用Pi估算软约束 | Context§2/6/10及CTX-CON-1 §2/4：可选按目标取舍，必选超目标保留并返回required_over_target，字节等硬容量仍失败 | 旧精确上界和Provider校准硬门槛撤回；inputTargetTokens/inheritedTargetTokens及budgetStatus替代误导性计量字段。Provider超窗是实际执行错误，不自动重发 |
| Pi输入按固定映射转换 | Context§4.2.1、CTX-CON-1 pi-context-1映射表、CD-1 AdapterRequest说明与CTX-PAYLOAD-T-05 | system独立；历史保持因果顺序；当前user依次含task原文、资料JSON、Memory JSON；内部引用不进模型，转换与估算同版。固定向量仍须实现验证，不是映射方案待决 |
| 首次来源由外部受信调用方准备，成功后创建Session | Context§4.1/5、CTX-CON-1 §1.1与RunAssemblyInput、CD-1冻结闭环、CTX-SESSION-T-07 | 区分initial准备态与existing执行态；输入意图存调用方业务操作记录，读取使用受限能力，不伪造Run claim或Session锚点；现有Memory.query不接收计划Run |
| 总设计UP-CTX-002/003、UP-DEP-001及Session单活Run约束 | 候选仍为派生值，Memory权威独立，Pi在适配层；首次准备不占用第二活跃Run，实际受理仍走SM单活入口 | 职责方向一致；SM详细协调状态机和受控来源接口Schema仍需衔接，不宣称已实现 |

本轮同步软预算失败分支、默认/Pi备选算法、结构关系用例CTX-REL-T-03、预算/首次创建用例及两条新验收；不再用“必选仅Token超标则失败”断言检查新策略。没有确认Memory rankedEntries或Child任务观察新类型，这些仍按原来源接口待办处理。

验证：文档架构检查通过（7层、34组件、85份受治理文档），Context内嵌PlantUML 10/10语法通过，差异格式检查通过。未执行视觉验收、代码编译或系统集成测试；此前实现基线失败不因本次文档修改而关闭。

本次输入摘要（未提交工作区）：

| 文件 | SHA-256 |
|---|---|
| layers/l1-control/components/context-engine.md | d50e010de2f70ef74b5c5165c62e1670ea55f291dcc8aebd91dc2e0b0554a42b |
| contracts/context-assembly-contract.md | 808655888124daea39194744e65984460f7931473b6a79b00507c480fe445772 |
| contracts/component-development-contracts-v1.md | 7f61510fd59c55e0a4a48289fbab708026930f9fb5cfe9201499784c7e4774e7 |
| agent-kernel-design.md | 2f188cb4263e540cc4f62ea07a603eb3b6c2217abbfd456c57639ce007015f5e |


## 2026-09-09 来源转换契约

用户确认来源转换方案。本轮以architecture-design-review同步CTX-CON-1 §2.2、Context CS-11/类图/验收、CD-1 MemoryView及MemoryManager调用说明；旧评审中的待定描述保留为历史，本节说明当前状态。没有修改运行代码或宣称系统集成通过。

| 上层来源/约束 | 本轮落点与结论 |
|---|---|
| 总设计UP-CTX-002/003、L1 §4只读来源及独立Memory权威 | 四类reader输出规范记录与解析正文；查询排名属于MemoryView，不修改Entry。Context只消费冻结视图，准备/保存归调用方，符合投影边界 |
| CD-1 HistoryTurn及ChildRunFinalizedEvent；总设计§12的SM协调所有权 | 执行适配层只投影已确认Child声明/结果；不决定Join、取消或超时，父事件身份和Child来源分别保留；完整轮次及requires边防止孤立观察 |
| 总设计UP-DEP-001及用户优先复用Pi | 业务来源转换与Pi编码分开；核心算法只消费规范值；Pi默认/备选共用child_task/task_observation映射，不新增模型工具身份 |
| 用户首次准备与延迟创建决定 | MemoryAssemblySource固定viewRef，已有Run由调用方先query；initial只能由Host已有受控入口准备，不伪造Run claim。组装阶段读视图，不触发Memory查询命令或创建Session |

C02的Memory排名、来源结果Schema及Child模型投影在候选协议层已补充；新增CTX-SOURCE-T-01～06和Memory TC-07均为待实现用例。仍需落实Host受控读取入口、父侧规范Child正文适配、SessionManager协调时序、Pi强类型实现及Activity操作映射；本次不宣称整体开发就绪，也未关闭其他历史评审项。

验证：全库文档架构检查通过（7层、34组件、85份受治理文档）；Context内嵌PlantUML 10/10语法通过，修改文件空白检查通过。类图人工核对了接口实现、持有引用、值组成及轮次依赖的含义；未做图形视觉验收、编译或系统集成测试。

本次相关输入摘要（含未提交工作区）：

| 文件 | SHA-256 |
|---|---|
| contracts/context-assembly-contract.md | e83012887de7642feb4090aead0d7d2ddc6080a62ac3edca84ce543a743d4a79 |
| contracts/component-development-contracts-v1.md | edfe056a89d1365921f9a63c727da71b4451cf5f180a44bdb65dde2d09d4e9fa |
| layers/l1-control/components/context-engine.md | cc3068fc2545abd1e09d3d2af0fa46c425098ef15416ffb62e2d71cb9f7c9c31 |
| layers/l1-control/components/memory-manager.md | a58ac8708e902226e4db558234e77669cf45e96df4bdab2352a44311d1525a8c |
| agent-kernel-design.md | 2f188cb4263e540cc4f62ea07a603eb3b6c2217abbfd456c57639ce007015f5e |
| layers/l1-control/README.md | 167b572a9d9ee5822caffe48f98c174d98b57a591abeb10485a21d67466c7d80 |
