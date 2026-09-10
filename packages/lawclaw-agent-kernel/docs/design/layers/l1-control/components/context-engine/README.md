---
doc_id: CTX-FD-INDEX
level: functional-domain
layer: L1 Control & Orchestration Runtime
component: ContextEngine
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ContextEngine 功能域设计索引的域内场景、实现细化、局部SFMEA和测试设计
parent: L1-CMP-009
interfaces: []
diagrams: []
supersedes: []
---

# ContextEngine 功能域设计索引

原[组件设计](../context-engine.md)保持唯一组件入口；其§3.4定义域间交互标准，§3.5定义跨域数据结构及字段约束，§4.0维护场景缺口，§10维护跨域验收。此目录细化五个内部功能域，不新增C4组件或独立服务。

## 目录与单向引用

功能域设计文件沿用SessionManager的`sr-<两位序号>-<英文主题>.md`命名，各自保留在功能域分类目录内；组件入口仍为README.md。序号对应现有FD-01～05，本次仅统一文件命名，既有doc_id、测试编号与规范归属保持稳定。

本索引只导航，功能域文档只向上引用原组件设计，不彼此引用来约定接口；原组件不反向引用本目录。字段Schema仍从组件设计绑定的CTX-CON-1进入，域文档不复制另一套类型。目录分类与代码组件归属是两回事，不能按文档目录擅自搬迁Pi适配器到核心层。

| 功能域目录 | 目标 | 原组件章节 / 跨域接口 |
|---|---|---|
| [source-ingestion](functional-domains/source-ingestion/sr-01-source-ingestion.md) | 冻结来源读取与规范转换 | §4.1/4.2.2/6.1；IX-01/02/07 |
| [structural-organization](functional-domains/structural-organization/sr-02-structural-organization.md) | 历史整理、去重及依赖结构 | §5.2/6.2；IX-02/03/07 |
| [selection-budget](functional-domains/selection-budget/sr-03-selection-budget.md) | 必选与两种可切换选择算法 | §6.1/6.1.1/6.1.2；IX-03/04/05/07 |
| [payload-packaging](functional-domains/payload-packaging/sr-04-payload-packaging.md) | 完整载荷、统一计量及冻结追踪 | §4.2.1/6.3；IX-04/05/06/07 |
| [assembly-orchestration](functional-domains/assembly-orchestration/sr-05-assembly-orchestration.md) | 请求阶段、错误及取消清理 | §3.3/4.4/6/7；IX-01～07 |

每个域同时包含职责边界、场景及分支、结构/算法、字段级内部数据结构、局部SFMEA、UT/DT/集成测试，不将风险和用例拆到无归属的平铺目录。各域§3.1分别定义读取缓冲、身份/配对/图索引、选择及后缀工作集、渲染位置与候选映射、请求阶段联合；说明输入→内部→输出、空值、集合、引用、可变性及生命周期。功能域只拥有局部设计细节；旧组件里的公共规则、既有测试ID及跨域流程继续权威，本轮没有删除其功能或把它降成索引。

## 跨域走读与上层一致性

| 约束来源（由组件设计引用） | 域内落点与结论 |
|---|---|
| 总设计UP-CTX-002/003：投影与Memory权威独立 | FD-01只读冻结视图，FD-04只返回候选；职责一致 |
| UP-DEP-001：Pi只在适配层 | FD-03通过纯截断Port，FD-04通过模型映射能力；组件§9目录不变 |
| 组件§3.3：不重入、Session单活由外部保证 | FD-05不新增锁/排队/lease，其他域无共享可变状态；职责一致，运行保证尚未验证 |
| 组件§3.4：交互唯一标准 | 五域只按IX接口传值，不私增跨域字段；首版简化规则已同步组件和CTX-CON-1，外部宿主接入单独跟踪 |
| 组件§4.0：九组场景缺口 | 首版场景已确定；当前组件实现与旧宿主迁移分别验收 |

主流程：FD-05接收冻结输入→FD-01完整读取→FD-02结构整理→FD-03试选并调用FD-04纯估算→FD-04最终复核/冻结→FD-05返回。异常：FD-01摘要错误时FD-02/03/04执行数0；FD-03错误Selection被FD-04拒绝；任一失败不触发Session/Artifact写入。扩展：新增合法资料reader只扩展FD-01及组件绑定契约，不给其他域增加业务资料分支。

## 测试与交付状态

域内用例采用CTX-FDnn-UT/DT/IT编号，仅为设计追踪，不冒充acceptance.json已登记用例。落地时映射项目要求的AK-*执行ID，并保留设计ID对应关系。沿项目test/README.md：UT验证规则，DT验证单组件协作，Contract验证Port/Adapter，Integration验证多组件，System验证公开入口；域内IT是边界协作细化，必须注明替身，落地时按实际集成范围归档，不能把同组件内协作冒称多组件系统集成。系统、真实存储及进程恢复仍以组件§10及其Session接管测试引用为标准。

局部SFMEA使用本域专属CTX-FDnn-FM编号，不改写System SFMEA的FM/ST定义。严重度用具体影响说明；无统计证据不赋O/D/RPN。每个风险关联本域用例与场景，局部实现映射AK-CTX-101～114、201～203、301、401，未映射设计向量保持未验收；Session/Run权威历史投影和现有宿主迁移不由这些测试替代。

## 当前实现与验证（2026-09-09）

本轮按组件首版“简化方案、约束和风险”同步五域场景、数据、算法与用例，新增独立组装器及两种策略。公开入口为createContextAssembler；具体代码在`src/control/context-engine/`，Pi依赖仅在专用基础设施适配目录。新增19个执行用例已全部通过：UT 3、DT 1、集成14、公开入口系统测试1。

整包`npm run build`和`npm run check`通过；后者的类型、边界、公开注释、目录文档检查及145个当前用例全部通过。单独`npm run test:all`：38个测试文件、145个用例、通过145、失败0，墙钟22.983秒，含58个集成及4个系统用例。报告分别为包根`.artifacts/verification/report.md`和`.artifacts/test-all/timing-report.md`。这些计数包含其他模块已有用例，不全部归于Context。

全库设计文档检查通过：7层、34组件、106份受治理文档。27段PlantUML已提取，本次语法重验因本机缺Java运行时未执行，未做本轮视觉验收；下方历史图语法结果不替代本轮。

剩余接入依赖：FlowContext和RunFlow已经通过ContextEngineFactory使用新的两参数ContextEnginePort；SessionManager尚无本契约要求的持久ensure、冻结历史查询和Child Coordinator。Session/Run历史投影目前由调用方注入，独立组件测试没有替代生产权威来源。真实延迟创建、保存/采纳、进程接管和已采纳模型派发尚未接入，不能据此宣布整个候选设计或SessionManager集成完成。没有新增Context回执、准备持久表或伪造Session版本。

## 历史文档验证记录（不代表当前实现结果）

2026-09-09命名调整：五份域文档按SessionManager的`sr-NN-topic.md`格式重命名，逐文件字节比较确认正文未变，索引链接检查通过。重跑全库check-document-architecture通过：7个层、34个组件、106份受治理文档；以下为此前数据结构修订的历史记录，其缺图阻塞已不再出现在本次检查中。本次未重新执行图形或运行测试。

2026-09-09修订：在已有五域设计中补齐§3.1字段级数据结构，并在组件§3.5统一内部交换包，修正必选声明展开归属和recordRef/unitRef表述。共15个域内场景、15项局部失效模式和44条测试设计追踪；新增5条数据不变量用例关联原失效模式。这些数量仅说明文档范围，不表示行为覆盖通过。人工走读了域间输入完整性、选择与渲染职责、错误传播及SCG-01～09归属，未关闭待决业务行为。

本次目录内本地链接和“新域→原组件、原组件无反向引用”检查通过；原组件及新域内嵌PlantUML 27/27语法通过；架构skill的quick_validate通过。未做图形视觉验收，未修改运行代码或执行UT/DT/系统测试。

全库check-document-architecture本次未通过：Kernel TUI的`sr-04-session-navigation.md`引用`../../../diagrams/rendered/clients/kernel-tui/sr-04.svg`失效。此为本次实际遇到的首个阻塞，不能推断后续无其他错误；不在本轮修改范围。新六份文档已纳入document-manifest的独立集合，不因外部链接问题绕过元数据检查。上一轮SessionManager缺页记录不作为本轮检查结果。
