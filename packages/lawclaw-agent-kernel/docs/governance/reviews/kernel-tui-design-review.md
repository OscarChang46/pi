# Kernel TUI 设计自审与依赖

日期2026-09-09；输入为当前工作区（含已有未提交候选修改），非仅HEAD。自审不是用户批准。入口：[组件](../../design/clients/components/kernel-tui/README.md)。

## 上下层语义追踪

| 约束及来源 | 本轮落点 | 结论 | 影响/处理 |
|---|---|---|---|
| 总设计§6/14：外部通过Gateway | TUI-CON§3，结构图 | 一致 | Client不得直调Runtime/数据库 |
| 用户纠正：LawClaw依赖pi-tui | 组件§2，SR-06 | 一致 | 视图使用库；请求从Controller发起 |
| 总设计§11、CTX-CON-1§1：先候选后创建 | SR-02，Host准备流程 | 一致 | 原Gateway先create口径替换为Host准备后调用低层start |
| Gateway旧首版必须Session，与首次输入 | 低层start保留已确认anchor前提 | 一致 | 新增Host意图用例，不让Facade组装Context |
| Session单活：SM拥有绑定 | SR-02提交/历史同步 | 一致 | UI禁用只是体验；服务原子约束仍必需 |
| Facade无状态与无Repository依赖 | TUI-CON§3 | 一致 | 准备操作存储归Host业务适配，不塞Facade |
| 总设计§13：持久事件及UI非权威 | SR-03，TUI-CON§4 | 一致 | durable与临时delta分开；重启快照重建 |
| Security审批决定与执行资格分离 | SR-05 | 一致 | 批准不是工具成功，服务复核权限 |
| 部署唯一装配边界 | TUI部署 | 一致 | Kernel内部Host装配，客户端装配自己的库 |

## 开发依赖与开放项

| ID | 未实现/未闭合依赖 | 责任与验收门槛 |
|---|---|---|
| DEP-01 | Host准备操作耐久存储及跨Session/Run回执恢复 | Host适配与SM/RunRegistry；首建失败零Session，created=false重组装，未知只查原操作 |
| DEP-02 | Session历史采纳、单活持久链 | SM/RunRegistry；Run终态不能提前开放旧anchor追问 |
| DEP-03 | 一致公开快照、持久事件与临时流映射 | Gateway/事件查询Adapter；cut与分页一致，GONE可恢复 |
| DEP-04 | Launcher唯一就绪、私有凭据、连接协商 | HostLauncher/Transport；并发启动唯一、跨用户拒绝 |
| DEP-05 | 异步审批公开投影与决定接口 | ApprovalBridge/Host；过期/竞态/撤权测试 |

当前文档定义客户端可实现边界及服务所需承诺；DEP-01的物理表、SM持久化集成和内部业务状态到公开RunView的完整映射尚须所属组件设计/实现闭合，不能由UI开发者猜测。本轮范围已收敛为TUI及依赖契约就绪：各SR按单连接、单前台、单未决写约束可独立开发；Host内部未实现不要求TUI接管。首期联合运行仍不判定就绪。与本轮无关的内部候选冲突不擅自批准。

## 五视角与具体轨迹

- 架构：LawClaw→pi-tui库依赖；Controller→Client→Host端点→Facade/Gateway请求。无Pi原生执行环。
- 数据：首次new→pending→Host preparing→Context候选→ensure→Gateway受理→accepted；created=false重读，保存/受理未知查询原事实。
- 安全：终端正文只渲染；审批调用需要独立权限；启动器不信任工作区脚本。
- 测试：SR逐场景固定输入、注入点与独立期望；运行测试尚未实现。
- 运维：有界连接/缓存/重连；退出不取消；宿主失联不触发UI重放。

异常走读：Run已创建但回执丢失→TUI pending未知→重启initialize→getCommand原ID→同Run快照→tail；创建次数应为1。扩展走读：新增工具公开进度复用变更通知→getRun→摘要渲染，无客户端重放逻辑；改契约字段与对应视图夹具即可。

结论：组件/功能域覆盖完成候选；公共接口为候选；五视角自审已记录；内核依赖待闭合；无运行实现与运行验收。不把文档检查等同于设计整体批准。

## 约束优先修订与开发就绪判断

用户已确认以场景约束简化开发。旧ClientEffect执行器、后台会话LRU、客户端乱序缓存和TUI内宿主锁设计不再适用，正文及图同步替换。依赖范围为TUI所消费的契约，不扩大到服务组件内部设计。

| 功能域 | 必要机制 | 省略的机制 | 设计结论/依赖测试 |
|---|---|---|---|
| 01连接 | 单连接代次、有限重连 | OS锁、进程接管、随机抖动 | 约束内可开发；Launcher替身唯一性/超时不杀 |
| 02对话 | 单pending、原命令查询、草稿revision | Host准备状态复制、命令队列 | 约束内可开发；受理未知/本地写失败 |
| 03观察 | 快照替换、连续cursor、当前文本 | 乱序重排、UI事件溯源 | 约束内可开发；gap重建/旧流/分页 |
| 04导航 | 当前页与generation | 多会话缓存、草稿数据库 | 约束内可开发；旧响应丢弃/草稿确认 |
| 05审批 | 查询与明确决定 | 策略编辑、自动补偿 | 三期按契约可开发；过期/竞态 |
| 06终端 | Editor薄适配、局部刷新timer | 通用effects/窗口/插件框架 | 约束内可开发；提交清空/原文/键位 |

所有域均有输入、局部状态、用例顺序、异常出口、保证方和测试落点。服务尚未实现、用户尚未联合批准、运行未验证分别保持，不把“约束内可开发”写成已实现。未知命令始终NOT_FOUND这一低频场景明确停留待核对，不增通用封闭命令协议；此为受支持限制，不让开发者擅自新建请求。

## 六项问题用户确认后的修订

2026-09-09：用户同意六项最小修改，并授权先更新设计再实施代码。SR-03明确查询完成后补查与revision换代重订阅；SR-02/04明确仅书签恢复；组件§7新增真实整链验收；SR-06明确窄屏控制命令和单页正文操作。此前“局部可开发”不代表整链已经接通。当前设计修订已落档；实现及运行证据仍须分别记录。

## 2026-09-10：正式宿主接入前的 Session 权威冲突

本轮任务是完成第一阶段；该冲突涉及正在演进的持久 Kernel 链路，不能通过客户端适配隐藏。模型临时观察和正式 HTTP 客户端可独立开发，已新增代码与局部集成测试；尚未将此链路对外声明为完整宿主。

| 既定来源 | 当前源码行为 | 结论与影响 |
|---|---|---|
| SR-SESSION-01 §4/6：SM 独占写 Session；append 原子推进已采纳历史版本/head；TUI-CON-001 §1/2：anchor 仅表示已确认历史 | `SqliteRunRepository.sessionSnapshot()` 扫描全部已受理 Run，以 `runs.length + 1` 和每个 Run 当前 transcriptHeadRef 构造 anchor | 冲突：受理新 Run 和执行中转录变化都可改变所谓 Session 历史锚点；不是 SM 显式采纳确认 |
| SR-SESSION-02 §5/7：先耐久占槽、Run 受理，终态后完成 Session finalization 再释放 | `SqliteRunRepository.admit()` 在 Run 表事务内检查其他 Run 是否终态；没有 SM 的 RESERVED/UNKNOWN/RELEASING 持久绑定 | 冲突：现有 SQL 单活检查不能直接替代已确认的组件职责与恢复协议 |
| TUI-CON-001 §3：候选→ensure→绑定/保存→Facade/Gateway→SessionRunCommandPort→RunRegistry | `FlowContext.initial()` 从 sessionKey 派生 sessionId，使用 RunStore 的历史投影；现有 Flow HTTP 直接 store.admit | 缺少已批准的统一入口；直接包装路由会把当前差异固化进产品协议 |

具体轨迹：R1 完成后 Session 查询按一个 Run 得到 version=2；R2 刚 admit、模型尚未输出时，同一查询已得到 version=3，head 也包含 R2 的当前转录引用。版本变化由受理及 Run 转录驱动，而不是 Session 对最终历史的条件采纳。该行为可供现有内部 Flow 关联使用，但不能不经决策冒充 TUI 的 SessionAnchorView。

建议遵循既定上层设计修订下层，修改范围明确如下：

1. `control/session-manager` 与其 Infrastructure Repository 持久维护 Root logical binding、Session anchor、单活 binding 和幂等回执。Session 版本只在确认的 Session 变更时推进，TUI 所用历史锚点必须固定到已采纳正文。
2. Host 持久化原输入/命令与准备位置；继续复用 `RootSessionPreparationCoordinator` 的先候选后 ensure 次序。未知结果查询原回执，不创建替代 Session/Run。
3. `FlowContext` 经 Session 查询端口读取冻结历史；保留现有 ContextEngine、候选编解码与 Artifact 能力。RunStore 只提供权威 Run 转录，不再独立决定 Session 采纳与生命周期。
4. Run 受理由 Session 占槽后派发；最终转录先在 RunRegistry 确认，再由 Session 幂等采纳并释放。跨库保留独立确认点，不增跨库事务。
5. 保留现有 Flow 连续历史用例的用户行为，将调用映射迁到上述公共机制；补受理不推进历史、终态未采纳不开放续轮、ACK 丢失、重启及迟到释放测试，再接正式 Host。

2026-09-10 用户明确决定：“保持既定设计，修改一下持久链路的时候的session受理代码”。本项决策已闭合为修订下层，不改变上层所有权，也不改变三阶段或原定 10 条 E2E。历史版本与绑定状态版本分别推进；这不是分布式两阶段提交。

本轮落实 `DurableSessionManager`、独立 `sessions.sqlite`、候选成功后的显式 ensure、受理 outbox、原受理查询与终态采纳恢复。Flow HTTP 和子 Run 的既有受理调用改经 SM；装配的 RunRepository 校验 SM 耐久绑定，删除 RunStore 的 Session 历史推算接口。`RootSessionPreparationCoordinator` 继续作为唯一首次准备编排，其共享类型下移 contracts，控制层通过 Port 调用。

范围与缺口：本地同步 RunRepository 才能给出明确未提交证明；远程受理不能复用此证明。当前独立数据库重开及双连接用例不等于 SIGKILL/跨进程验收。完整 Child branch/join、历史指定版本查询、通用事件 inbox/outbox 和正式 TUI Host 仍未交付。证据见 [持久受理验证](../../verification/session-durable-admission-2026-09-10.md)。
