---
doc_id: VER-FLOW-SYSTEM
level: verification
layer: Cross-cutting
component: FlowEngine
status: implementing
baseline: AKB-2026-09-03-09
authoritative_for: VER-FLOW-SYSTEM
parent: VER-INDEX-001
interfaces: []
diagrams: []
supersedes: []
---

# FlowEngine系统框架验证

历史版本说明：本页保留2026-09-07实际执行的命令、旧文件名与镜像摘要。2026-09-08命名统一后的入口与本机结果见[当前验证](flow-engine-naming-validation.md)；重新部署请使用[现行部署说明](../../deploy/flow-local/README.md)，不能用本页旧镜像证明新代码已部署。

日期：2026-09-07。对应ACR-2026-0012与SR-FE-SYS-01～03；这是本机SQLite与Docker实现记录，非生产验收声明。

## 实现与场景映射

| 场景 / 风险 | 用例 | 独立验收依据 |
| --- | --- | --- |
| S1四态生命周期、非法边 | AK-FS-001 | 20种组合、7条合法边，终态无出边 |
| S2主动挂起、Completed回放 | AK-FS-002 | 关闭并重开SQLite，原调用计数仍为1 |
| S4首次调用、S5重复与竞争 | AK-FS-003 | 两个连接争同一Started，外部实现只执行一次；租户隔离 |
| S3代次恢复、日志不可覆盖 | AK-FS-004 | UPDATE/DELETE、INSERT OR REPLACE主键/Activity替换及旧代次Completed均被拒绝 |
| S6外部成功后崩溃 | AK-FS-005 | 子进程真实SIGKILL；合成账本计数1；未知回放零调用；对账后返回原结果 |
| S7多节点有向环 | AK-FS-006 | A/B回环三次退出；各访问Activity序号不同；重放零新增调用 |
| S9出口不达和次数限制 | AK-FS-007 | 静态无出口拒绝；动态条件不成立达到次数上限终止 |
| S8自环及定义漂移 | AK-FS-008 | 自环退出、非法路由不写检查点、图版本漂移拒绝 |
| 捕获异常后继续的绕过 | AK-FS-009 | 未知结果或Yield被业务捕获后仍不能新增调用或成功终止 |
| 提交确认丢失、取消回调 | AK-FS-010 | Started已提交但确认丢失时零外部调用；取消后陈旧结果不提交 |
| 系统与业务两次提交间故障 | AK-FS-011 | 系统Completed已提交、业务结果写失败，恢复消费系统结果，模型只调用一次 |

## 本机检查

在packages/lawclaw-agent-kernel目录执行指定测试（不启动全量模型用例）：

```sh
node --import ./scripts/verification-offline.mjs --import tsx --test test/ut/flow-engine.test.ts test/contract/flow-engine.test.ts test/integration/flow-system.test.ts test/integration/flow-runtime.test.ts test/integration/flow-http.test.ts test/integration/flow-storage.test.ts test/integration/flow-artifacts.test.ts
node scripts/verify.mjs --id AK-FS-012 --report-dir .artifacts/flow-state-constants
node scripts/compile.mjs --typecheck
bash scripts/check-runtime-boundaries.sh
node scripts/check-public-contract-comments.mjs
node scripts/check-framework-docs.mjs
```

仓库根目录另执行npm run check。用例登记在acceptance.json。AK-FS用例涵盖纯状态矩阵和SQLite集成，统一登记integration以保持实际执行隔离；不以编号替代端到端证据。

## Docker真实环境复测

部署与认证读取方法见[操作说明](../../deploy/flow-local/README.md)。当前模型选择DeepSeek / deepseek-v4-flash。仓库根目录：

```sh
node --import tsx packages/lawclaw-agent-kernel/scripts/deploy-flow-local.mjs --up
docker exec -e FLOW_CRASH_WORKER_BUNDLE=/app/flow-crash-worker.mjs lawclaw-flow-local-flow-1 node --test /app/flow-system-test.mjs
node packages/lawclaw-agent-kernel/scripts/test-flow-live.mjs
node packages/lawclaw-agent-kernel/scripts/test-flow-recovery-live.mjs
```

镜像包含系统测试和崩溃worker；测试仅写独立临时数据库与合成账本。真实模型测试覆盖回答、只读工具、父子任务、到期、取消，并校验system终态及Activity事件；报告保存.artifacts/flow-local/live-report.json。恢复测试会杀死专用容器，先显式recover再启动，报告保存recovery-report.json。

## 完整性与边界

四份旧设计原文保存在governance/archive/flow-before-system-v1；迁移清单中的4个SHA-256已逐一核对。活动规范删除ResourceManager、RuntimePool、ExecutionCapacity，保留历史决策原文，不把旧组件评审当作本协议的评审。权威类图/流程图在SR文档和PlantUML；手工Draw.io历史画布未覆盖。

系统日志只保证唯一首次派发资格、已提交结果回放及未知关闭。Started与外部服务、Completed之间没有跨系统原子事务。普通业务代码须固定版本并使用稳定Activity key；不透明拦截任意网络调用、不自动证明不同key调用顺序的确定性。通用对账已实现，ReAct未知业务状态消费后的自动继续、在线Schema迁移、生产隔离、长期容量测试及告警后端尚未交付。

## 框架重构执行结果（状态常量收敛前）

- 本机Node v24.19.0：指定40个Flow用例全部通过（AK-FE 29项、AK-FS 11项）；最后错误分类整理及REPLACE保护补充后，受影响的16项再次通过。统一验收入口精确选择AK-FS-001～011通过，报告位于包目录.artifacts/flow-system/report.json。
- 根npm run check、包类型检查、公开契约注释、源码依赖/运行时边界、目录README检查通过；根检查没有剩余格式或类型问题。
- 文档治理检查通过：7层、35个活动组件、78份受治理文档。新增SR已登记清单；资源组件计数减少3，历史ID不复用。19张SVG的XML、中文字体、内嵌PlantUML源一致性检查通过；本次8张变更图重新渲染，目视核对L1关系、启动与恢复时序图。
- Docker Node v25.6.0：镜像内10项通用系统测试通过，含真实SIGKILL和合成外部账本；HTTP业务桥接另由本机AK-FS-011和真实模型场景验证。
- 最终镜像使用DeepSeek / deepseek-v4-flash，真实回答、读文件、父子任务、到期、取消5组通过；重复受理未增加命令。回答/工具/子任务均经过新系统日志，报告记录system与Started/Completed事件。
- 同一最终镜像的2组容器SIGKILL恢复通过：已完成Run的结果与命令不变；在途模型Run显式recover后保持Yield/model_unknown，模型命令仍只有1个。维护对账事件另行保留。精简证据及镜像内编译文件摘要见[flow-system-evidence.json](flow-system-evidence.json)。

最终镜像ID：sha256:0a411aeef2b47e921613354b088e016385d9dc9ce95e8676f649537a564c88fb。系统SQLite在该Node版本仍输出官方ExperimentalWarning，测试无失败；不把这条运行时提示称为编译错误。

## 状态常量收敛验证（2026-09-07）

系统四态、生命周期动作、日志事件、图路由统一引用flow-system-values.ts；ReAct位置、挂起子状态、命令状态、副作用与工单状态引用react-flow-values.ts。类型从常量取值推导，表键使用计算属性，运行查询SQL参数绑定同一常量。原有存储值、JSON及摘要输入不变，未进行数据库迁移。

本机指定40项Flow回归加AK-FS-012共41项通过，含独立设计向量、四态矩阵、SQLite竞争、真实子进程SIGKILL、未知结果关闭、图循环、HTTP和授权链。AK-FS-012覆盖9种违规源码与合法常量示例，并通过统一验收入口，报告为.artifacts/flow-state-constants/report.json。最终根npm run check、包类型检查、源码/运行时边界、公开注释与目录文档检查通过。防回退检查已接入check-runtime-boundaries.sh。

本次常量收敛只做本机验证，未重新构建或部署Docker，也未重新调用DeepSeek；上节镜像摘要和真实模型结果对应收敛前的版本。

## 开发规范复核

新增系统核心按生命周期、Activity和图执行分开，SQL事务独立且不包围网络调用。状态迁移只由共享表定义；局部条件负责输入、历史及代次校验。原ReAct规则迁移后保留业务校验优先级，未用缩写或三元链替代状态机。

人工AST审查触发项：装配入口59行、驱动装配52行，内容为依赖连接和所有权清理；业务驱动step为有序事件/维护/截止分派，保留短路语义。迁移的ReAct Guard（108行）与Schema变体声明（最长114行）仍是独立业务校验，不是本次新系统状态算法，未声称全仓超长函数全部消除。规范JSON编码复用原实现，13个局部分支用于值类型与边界拒绝。没有量化重复率、生产吞吐或长期压力报告。
