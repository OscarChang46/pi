# 验证框架首期

本框架验证现有实现，不批准候选架构，不补建未实现产品模块。UT 为单元测试，DT 为组件白盒测试，Contract 为接口验收，Integration 为子系统集成，System 为现有入口验收。全部自动执行。

## 清单与证据

[acceptance.json](acceptance.json) 是当前执行映射，system-sfmea.md 继续拥有既有 FM/ST 风险定义。AK 用例和 REQ 验收项不冒充既有 ST 用例已经落地。风险字段说明当前防护目标，未来能力单独登记。

清单包含 schemaVersion、capabilities 和 requirements。能力状态为 implemented、partial、planned；partial 必须拆分为已实现和计划中要求。已实现要求包含标题、风险、所需层级和 `{id, level, file}` 用例映射；每个所需层级都要有实际用例。计划中要求 cases 必须为空。

报告独立记录实现状态及 passed、failed、not_covered、environment_missing。未来能力不计入当前通过数；未选中或未执行用例不计为通过。报告包含验收映射、结果、耗时、门禁和阻断原因，不记录原始测试输出、断言正文和凭据。用稳定 ID 复现失败，必要时在隔离环境中直接运行对应 Node 用例查看详细断言。

## 执行与隔离

`npm test` 执行全部当前用例；`npm run verify` 在测试之后执行 typecheck、check:boundaries、check:comments、check:docs，合并退出状态。设计治理检查 check:architecture 和联网审计 audit:dependencies 保留独立入口，不把候选设计审批状态混同于现有代码验收。

执行器使用环境白名单、临时 Pi 配置目录、项目固定测试配置和离线预加载器，不继承个人模型密钥、代理、配置覆盖或 NODE_OPTIONS。fetch/TCP 误调用被拒绝，tsx 所需本地 IPC 保留。这是可信测试的误联网防护，不是第三方代码沙箱，也不证明任意子进程不能联网。

进程设置时间和输出上限。POSIX 平台终止进程组并清理遗留子进程；Windows 仅终止直接进程，不宣称进程树隔离。首期 CI 使用 Linux，本地验证支持 macOS。

## 框架自身门禁

框架回归覆盖整体与分层集合一致、ID 精确筛选、故意失败、skip、未执行、重复 ID、失效映射、空扫描、错误筛选、未来能力不计通过、失败后清理、凭据隔离及网络拒绝。源码门禁另用跨职责依赖、环、缺失目录、空扫描、语法错误和合法样本验证。

测试发现使用 TypeScript AST，只允许具名、顶层、静态 test 声明；动态、嵌套或别名注册明确拒绝，使登记与运行结果可以机械核对。

## 后续接入

1. 实现一个真实能力或可独立验收的子集。
2. 将对应要求改为 implemented，保留未完成部分的 planned 状态。
3. 增加 UT/DT、当前契约和真实集成，填写风险、粒度、文件与稳定 ID。
4. 全量 verify 通过后纳入发布门禁。

调度、持久化 Memory、Journal/Attempt 恢复、一次性 Permit、第三方 Package、生产隔离和运维后端目前只登记要求。容器故障注入、SQLite 恢复、大规模随机调度和长期压力平台随模块实现逐步接入。
