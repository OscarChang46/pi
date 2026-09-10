# Kernel设计SFMEA与跨组件验收矩阵

版本CD-1 R1，2026-09-07。本页定义测试规格，未执行实现测试。组件局部六例是契约验收，不应给“正常输入”机械套失效评分。

S按实际后果定1—10；O/D缺运行证据，不捏造数值或RPN。全部下列风险均为强制实现验收项，无需RPN阈值决定是否测试。文档评审检查措施与判定是否完整；风险关闭必须等实现测试。Owner为对应组件实施负责人，架构/安全/数据/测试/运维角色独立复核。

| 风险 | 原因与失效模式 | 局部及系统后果 | S及理由 | 预防/检测/恢复 | 验收 | Owner |
|---|---|---|---|---|---|---|
| K-FM-01 | 入口未校验可信Scope，把Ref当授权 | 串Session/跨Scope泄漏 | 10，未授权数据访问 | 入口及每次资源读取核验，拒绝审计；禁止缓存回退 | K-TC-01 | Gateway/Session |
| K-FM-02 | 同键异载荷或提交响应丢失后生成新身份 | 重复Run/写入/工具 | 10，不可逆重复动作 | 回执优先、摘要唯一、迟提交屏障；未知只查 | K-TC-02 | RunRegistry |
| K-FM-03 | 旧claim或CAS失败决策仍派发 | 覆盖新状态与双执行 | 10，数据分叉 | T2条件写与执行边界复核；接管增加fence | K-TC-03 | RunRegistry/Scheduler |
| K-FM-04 | Attempt与command混用，L2自己推进下一轮 | 正常流程中断或无授权调用 | 9，失去唯一推进权 | Core唯一决策；L2每command一次，事件T1确认 | K-TC-04 | AgentRuntime |
| K-FM-05 | 裸工具结果/跨Run转录进入Session，检索/估算器动态换版 | 错误上下文或不可重放 | 9，内容因果错配 | 完整HistoryTurn验证、sourceSpec冻结与降级回执 | K-TC-05 | Session/Context/Memory |
| K-FM-06 | 非工具动作借工具Permit，Ask被当Allow | 越权Child或Memory读写 | 10，授权旁路 | SecurityAction封闭联合/摘要；非工具Ask明确拒绝 | K-TC-06 | PDP/Scope/Memory |
| K-FM-07 | 过期、已撤销或旧owner的grant仍启动 | 撤销不生效/双执行 | 10，安全失效 | 当前授权安装点、consume+authorizeStart、STARTED身份CAS | K-TC-07 | Permit/Guard |
| K-FM-08 | 审计outbox耐久当Journal已确认 | 无法追溯受保护动作 | 10，授权证据缺失 | 依赖AuditReceipt；超时查同ID，未确认不STARTED | K-TC-08 | PEP/Guard |
| K-FM-09 | Child受理丢响应/父取消后重新创建 | 孤儿Run或重复预算 | 9，结构化生命周期破坏 | admitChild父栅栏/稳定ID/预留凭证；拒绝前失效屏障 | K-TC-09 | Scope/RunRegistry |
| K-FM-10 | 子预算池重复扣/返还或上限误当全树 | 容量放大与不可预测费用 | 9，预算安全界限失效 | Root自身与Child池分列；Scope CAS、预留不退、后代同池 | K-TC-10 | Scope |
| K-FM-11 | Parent终态冒充物理清理结束 | 遗留Child继续新业务 | 9，取消保证失效 | 祖先栅栏、耐久Cleanup、30秒incident及持续扫描 | K-TC-11 | Scheduler/Scope |
| K-FM-12 | UNKNOWN自动重执行或核对重投修改终态 | 重复副作用/终态重开 | 10，物理数据损坏 | 同命令可信证据、核对收据/通知唯一、终态分表 | K-TC-12 | ToolCall/RunRegistry |
| K-FM-13 | 扫描吞吐不足、双队列等待或满载丢wake | 无新流量时永久停滞/死锁 | 8，服务不可用 | 16批/轮、持久runnable、tryAcquire不排队 | K-TC-13 | Scheduler/Resource |
| K-FM-14 | 日志敏感字段或告警缺可写信号 | 泄漏或故障不可见 | 9，敏感数据及诊断丢失 | 封闭TelemetrySignal、脱敏诊断、drop可读 | K-TC-14 | 全部Kernel组件 |
| K-FM-15 | Pin在旧事务迟提交前释放 | 已提交引用悬空 | 9，事实不可恢复 | 对外要求事务附着/失效屏障证明；Kernel不提前unpin | K-TC-15 | Session/Memory/Run |
| K-FM-16 | Registry/目录更新替换运行中的冻结目标 | 恢复执行不同工具/Agent | 9，授权目标变化 | 版本精确解析，缺失拒绝，不换同名目标 | K-TC-16 | Registry/Router/Catalog |

## 精确输入与判定

| 测试 | 前置与注入顺序 | 必须观测的唯一预期 |
|---|---|---|
| K-TC-01 | 两个Scope各合法Session/Run；用A可信Scope提交B的引用 | 受保护正文读取0、新Run/模型/工具0；外部NOT_FOUND/ACCESS_DENIED按入口规则，内部安全拒绝1 |
| K-TC-02 | T2提交后丢响应；另测absent后旧写者先完成/先失效两分支 | 屏障前新派发0；已提交用原command；确认未提交才重算；相同请求一个受理 |
| K-TC-03 | 两worker读版本7；分别提交；再过期claim并接管 | 仅一个T2到8；旧决策派发0；旧fence提交/新启动均拒绝 |
| K-TC-04 | 同Attempt A：InvokeModel C1→tools→结果→InvokeModel C2→answer；再投C1 | A不变，C1/C2不同，各Provider调用1次；重复C1不发；L2工具调用0 |
| K-TC-05 | 完整两工具轮次；裸结果/逆序/跨Run分别负测；冻结sourceSpec后换最新Memory/索引/估算器 | 合法轮次按顺序保留；非法append0；同sourceSpec/已存AssemblyReceipt promptDigest不变；撤销则拒绝读取而非复用旧帧 |
| K-TC-06 | child.create、memory.read、memory.write各allow/ask/deny，逐一变一个payload字段 | allow按稳定command生效最多1次；ask返回ACTION_APPROVAL_REQUIRED、无新外部审批等待；deny与ask正文/写/Child0；payload变化原Permit无效 |
| K-TC-07 | consume后到期；安装新epoch在authorizeStart前/后；旧grant给新owner | 到期/先失效无grant；grant先的动作仅按在途事实；旧owner grant不能给新ownerSTARTED |
| K-TC-08 | 审计意图已写，Journal未确认；append成功丢ACK后重投 | 未拿AuditReceipt前STARTED/Provider0；同auditEventId最终Journal1条，确认后最多一次启动 |
| K-TC-09 | reserved、session_ready、admit提交后三窗口kill；取消与admit双屏障 | 取消先则Child0，受理先则同childId1；重启无新ID、Scope预留1；rejected通知匹配原父等待 |
| K-TC-10 | Root自身16轮，Child池16轮，Parent已用1；Child申请16/15；并发另一Child15 | 16违反父剩余拒绝；15可预留，池剩1；另一15拒绝；Root自身额度仍独立；全树最大32明确展示；重复Join不退额 |
| K-TC-11 | Parent Cancelled先提交，Child外部执行忽略cancel；假钟推进30秒，再重启 | Parent仍Cancelled，祖先栅栏后新业务0；Cleanup=incident且原Child/命令可查，资源仅释放已确认部分；不宣称物理终止 |
| K-TC-12 | 工具STARTED响应未知→Scope内可信success证据；分别在Run挂起/已终态；丢通知ACK | 外部执行计数不增加；核对记录1；非终态Ready且tool转录1/原Proposal移除；终态version不变、无推进事件；矛盾证据冲突 |
| K-TC-13 | 4096活动Run丢全部提示、无新流量；1槽Parent等Child，另Root资源不足 | 最后项5秒内发现；扫描不重叠；不足者tryAcquire等待项0且释放claim，runnable保留；Parent释放槽后Child可运行 |
| K-TC-14 | 发queue/capacity/scanLag信号；恶意Prompt/Token字段；遥测不可用 | 各封闭信号有明确值/限额和采样时间；无动态标签；泄漏0；业务可继续且drop可查；安全审计单独失败关闭 |
| K-TC-15 | pin成功后领域提交挂起，query absent，再让旧提交/失效屏障分别先执行 | 旧提交可生效时unpin0；已提交Artifact可读；确认未提交者可释放；未知保持pin与关联记录 |
| K-TC-16 | Run冻结Agent/目录@7，发布@8，恢复旧Run；再撤销旧路由能力 | 恢复仍指向7；能力失效明确拒绝，不选同名8，Provider0 |

每例对应K-FM同尾号。实现阶段以屏障而非sleep注入，每分支使用独立期望值，并断言禁止行为为0。组件局部TC补充分支不替代以上跨组件测试。所有输入使用合成数据，计划测试与已执行报告分开。

[九个PDP合成向量](security-vectors.json)只冻结非工具动作的策略输入与PDP/消费方拒绝预期，摘要已静态复算；它们不是Run/claim/Permit/外部执行的端到端测试结果。K-TC-06/07必须实现对应全链路断言。K-TC-07还要求epoch7可信续期只增加授权记录version，不改变policy epoch；改scope或复活revoked的续期必须拒绝。

## 性能基准的确定方法

纯规则最大合法输入10,000次，无I/O测CPU P99。异步Kernel端到端先用固定Faux模型20ms、Faux工具20ms、每Run两轮一工具、4并发、SQLite测试目录、1MiB最大Context，测5分钟稳定完成率C；后续30分钟按0.8C个Run/秒开放到达，记录机器/OS/Node、C、实际到达/完成/拒绝率、P99及资源高水位。队列/容量上限仍按绝对值验收，不能通过降低C回避硬上限测试。该基准是本地Kernel性能规格，不对真实Provider时延作承诺。
