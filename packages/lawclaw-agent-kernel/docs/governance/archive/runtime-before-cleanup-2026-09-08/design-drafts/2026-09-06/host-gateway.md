> 历史归档，2026-09-08从docs/runtime移出。正文保留当时讨论，不代表当前实现、有效设计或批准；后继来源与迁移原因见[归档索引](../../README.md)。

# Host、协议入口与服务生命周期草稿

状态：**DRAFT，待用户评审**。日期：2026-09-06。

本文是现行设计的非规范性细化提案，不替代权威文档、不冻结 DTO、不授予代码实施或部署授权。Host 是 Kernel 外部可信装配边界，不能因当前位于同一仓库而成为内核领域模块。

## 1. 当前事实与问题

- [本地执行入口](../../../../../../src/application/run-kernel.ts)运行一次任务后退出，没有监听接口或常驻服务生命周期。
- [AgentSystem](../../../../../../src/control/agent-system.ts)的 `run` 等待任务完成；Session、Run 和事件仍在内存中。
- [装配入口](../../../../../../src/application/composition-root.ts)生成本地测试身份上下文，不是认证服务。
- [现行 Gateway 设计](../../../../../design/layers/l1-control/components/agent-system-gateway.md)要求持久受理后返回，而不是等待模型结果。

例如用户提交任务后客户端断开，当前一次性入口没有可重新查询的服务端任务。目标是先返回可靠的受理回执，随后查询或订阅任务；断线不隐式取消任务。

## 2. 职责与所有权

| 组件 | 拥有 | 不拥有 |
|---|---|---|
| KernelHost | 启动配置、连接认证、信封编译、作用域 Adapter 装配、进程生命周期 | Run 状态、业务流程或模型循环 |
| Transport Adapter | 连接、帧、读写超时、连接背压 | 命令重试策略或领域状态 |
| ProtocolFacade | 版本协商、协议校验、机械映射 | 鉴权政策、Repository、Scheduler 算法 |
| AgentSystemGateway | 无状态用例协调 | 原始 Token、业务身份解释、执行器构造 |
| RunRegistry / SessionManager | 各自的持久权威状态 | 连接是否存在 |

主路径：`Host → Transport → Facade → Gateway → Command/Query Port`。Facade 的健康和关闭操作走专用端口，不通过持有内部聚合对象实现。

## 3. 首版部署建议

遵循[Local-first 档案](../../../../../design/deployment/local-first-profile.md)：一个 Host 进程、本地 SQLite、进程内认知执行；进程内 Gateway 是基本绑定，Desktop 接入采用 stdio JSONL。Loopback HTTP/SSE 作为同一协议的可选适配，不默认开放公网或局域网。

首版先支持一个显式可信本地主机作用域。远程服务由外部 Backend 完成身份认证并编译执行信封；不把测试 `createRequestContext` 包装成生产认证。

候选生命周期：配置验证 → 打开存储与迁移检查 → 装配端口 → 恢复权威状态 → 启动调度 → 标记 ready → 接收请求。任何必需安全或存储依赖缺失均启动失败，不回退内存模式。

## 4. 候选操作表

操作名称用于讨论语义，正式签名由 [BND-EXT-001](../../../../../design/contracts/bnd-ext-001.md)及后续契约评审拥有。

| 操作 / 调用方 | 输入语义 | 输出语义 | 失败与边界 |
|---|---|---|---|
| initialize / 本地客户端 | 协议版本、能力需求、可信连接 | 协商能力和上限 | 未知主版本或不可信连接在 Gateway 前拒绝 |
| startRun / 业务调用方 | 执行意图、稳定命令标识、信封引用、Agent/Session 引用 | 已持久受理的 Run 引用与初始版本 | 同键异载荷冲突；未提交不返回成功 |
| getRun / 客户端 | 有权访问的 Run 引用 | 脱敏权威快照 | 不返回内部 AgentRun 可变实例 |
| cancelRun / 客户端 | Run 引用、稳定取消命令 | 取消请求受理事实 | 不等于进程已停或副作用已回滚 |
| readRunEvents / 客户端 | Run 引用、已确认游标、批量上限 | 持久事件批次与下一游标 | 游标被清理时显式要求重新同步 |
| subscribeRunEvents / 客户端 | 同上及订阅窗口 | 可补拉的有序通知 | 慢客户端可断开并补拉，不拖住执行器 |
| readiness / 本地管理端 | 无业务载荷 | 必需依赖与恢复是否就绪 | 不泄漏路径、Secret 或内部服务地址 |
| drain / Host 管理端 | 有界关闭期限 | 停止受理状态及未收敛项 | 不伪造所有任务已取消 |

事件游标不能与 Attempt 的模型事件序号混用：外部按 Run Journal 顺序读取，内部事件另带 Attempt 引用。统一游标定义留给存储与契约评审。

## 5. 受理、重复请求与故障

1. Host 校验调用来源，编译最小技术信封；信封引用不能由外部任意伪造。
2. Facade 校验协议、帧大小及请求 Deadline，Gateway 解析已发布 Agent 和技术 Session 引用。
3. RunCommandPort 在自己的事务中验证命令幂等性、冻结路由并提交 Run 与对应事件。
4. 返回持久回执并通知 Scheduler。通知失败不撤销已受理 Run；恢复扫描会重新发现它。
5. 客户端不确定是否提交成功时用相同命令键查询/重试，不能生成新键盲目重提。

Session 创建与 Run 受理不是跨聚合大事务。建议显式先创建 Session，再提交 Run；若后续加入便利入口，部分成功必须可查询，闲置 Session 由独立生命周期策略处理。

请求 Deadline 限制受理用例等待，Run 执行 Deadline 是另外的冻结约束；HTTP 连接超时不等于执行 Deadline。主机退出后从持久状态恢复，不能从内存连接缓存重建任务。

## 6. 关闭、资源与安全

- drain 先撤销 ready 并拒绝新任务，保留必要查询与显式取消通道；随后请求执行任务在安全边界挂起或取消。
- 超过宽限期仍未确认结束的 ToolCall 记录未知状态；重启后先查询，不重放未知副作用。
- 每连接帧大小、未确认请求数、事件窗口、总连接数均有配置上限。首稿不宣称未经测量的吞吐能力。
- JSONL stdout 只承载协议；日志写脱敏 stderr 或文件。业务 Prompt 和 Token 不进入日志标签。
- Loopback 也校验本机随机凭据、来源与请求大小；公网部署需单独 Backend 接入评审。

## 7. 验收场景

- 持久受理成功但回执丢失：相同键只关联同一个 Run；异载荷返回冲突。
- 通知 Scheduler 丢失：Run 仍可被扫描调度；不重复创建 Attempt。
- 连接断开再连：Run 未被隐式取消，事件可补拉并去重。
- 数据库或必需安全依赖不可用：ready=false，不受理新任务。
- drain 与提交并发：每个请求具有明确的受理或拒绝结果，无不可查任务。
- 越权 Run 引用、未知协议版本、超大帧被入口拒绝；Facade 无 Provider/Repository 依赖。

## 8. 待评审决策

| 编号 | 建议默认 | 替代与取舍 |
|---|---|---|
| HOST-01 | 首版进程内 + stdio，HTTP 可选 | 首版优先 Loopback HTTP/SSE，便于网页调试但增加连接安全与运维面 |
| HOST-02 | 先创建 Session，再异步受理 Run | 一步便利入口减少调用次数，但需显式部分成功语义 |
| HOST-03 | 先做单可信本地主机作用域 | 同时做远程多用户接入会引入 Backend 身份、限流与隔离适配工作 |
| HOST-04 | drain 优先在安全边界挂起，期限后报告未收敛项 | 全部取消较简单，但不能保证工具副作用回滚 |

## 9. 后续实施切片

先评审外部命令语义及信封边界；待存储/Journal 与 Scheduler 可用后实现 Gateway 持久受理；随后补 stdio 协议与关闭流程；最后按实际使用场景加入 HTTP/SSE。单纯套 HTTP 壳不能视为完成这一设计。
