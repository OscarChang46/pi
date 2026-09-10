---
doc_id: L4-VER-001
level: verification
layer: l4-execution-runtime
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "SFMEA、系统场景与验证证据"
parent: SYS-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# L4 Execution Runtime 验证视图

权威定义见 [System SFMEA](system-sfmea.md)。本层主责风险：`FM-SBX-001..002`；协同承担 `FM-TOL-002..003`、`FM-RES-001` 与 `FM-INF-002`。

主责测试：`ST-SBX-001..006`、`ST-RES-002`、`ST-INF-008`。必须证明 SandboxRequest 不超过 Permit、帧/输出/进程/挂载/出口有界、stdout 协议纯净、失败不回退宿主执行以及执行结束后所有资源和 Secret Lease 被回收。

## L4-DD-1 场景与验收设计

2026-09-09 候选增量；[层设计](../design/layers/l4-execution-runtime/README.md)拥有场景，[详细契约](../design/contracts/l4-execution-runtime-detail.md)拥有新增字段。本节所有 L4-T 用例均为**设计完成、未实现、未运行**，不登记为现有 acceptance.json 的已实现用例。

共同夹具：可信 scope=A；commandId=operationKey=c17；冻结 route=r3、adapterBinding=p1；当前可信时间 1000ms、Deadline 61000ms；参数 Artifact 为合法 UTF-8 JSON `{"path":"a.txt"}`（16 字节）；输出限额 262144 字节。Fake 时钟和动作计数器可注入；Artifact 使用独立预置内容与摘要，不由被测映射器生成期望。Sandbox 夹具另提供明确的限额、只读输入挂载和禁网档案；B1 未冻结前为候选输入，不伪装现有接口。

| ID / 场景 | 前置、输入和故障顺序 | 独立期望与禁止行为 | 层级与拟落点 |
|---|---|---|---|
| L4-T01 / S01/S02 | 固定只读 Provider 返回 2 字节 `ok`；或受信远端返回匹配 c17/r3 的有效成功凭据 | 发送一次；Artifact 实际内容为 `ok`；L3 收到原 command/route 证据；无 Provider 私有凭证 | UT/Contract；test/contract/l4-provider.test.ts |
| L4-T02 / S01/S05 | 远端计数器增加后丢响应；inspect 先 unknown 后返回原有效凭据 | effect 初始 unknown；后续按原 c17/r3 核对；远端计数始终 1，不切 r4 | DT/Integration；test/integration/l4-provider-recovery.test.ts |
| L4-T03 / S01/S08 | 发送前 mapping CAS 回执丢失；并发再次 execute 同键；再以不同参数摘要重用 c17 | 同键恢复只查；不确定 CAS 胜者不发送；不同载荷冲突；新增物理调用最多一次 | DT/Contract；test/dt/l4-dispatch.test.ts |
| L4-T04 / S04/S05 | 分别在发送前取消、远端受理后取消、成功证据到达同时取消；Fake 故意忽略 abort | 前者 effect=none、发送 0；在途无停止证据为 unknown；可信成功保留，不写 cancelled 覆盖 | DT/Integration；test/integration/l4-cancel.test.ts |
| L4-T05 / S03/S08 | 申请硬 CPU/内存限制但档案不支持；另注入容量=0 或过期 Deadline | workload 启动 0；不调用宿主 Shell；无隐式新队列或限额默认值 | UT/Contract；test/contract/l4-sandbox-profile.test.ts |
| L4-T06 / S03/S04 | 创建环境后、最后一项限制回执前设屏障；分别取消和让限额设置失败 | 屏障前后 workload 启动均 0；已有环境进入清理；Secret 撤销尝试不遗漏 | DT/Integration；test/integration/l4-sandbox-start.test.ts |
| L4-T07 / S07+S04 | 输入流注入半帧 EOF、错误 operationKey、重复/矛盾终帧、UTF-8 跨块、控制帧伪造；输出 262144 与 262145 字节 | 合法边界可完整返回；超额停止且不返回截断成功；伪帧不改变状态；Artifact/业务流总额不绕限 | UT/DT/Contract；test/contract/l4-stream.test.ts |
| L4-T08 / S08 | c17 固定 r3 后发布 r4，r3 下线；另 scope=B 查询 c17 | 不调用 r4；拒绝或原路由 unknown；B 不能获知 A 的 receipt/输出 | DT/Contract；test/contract/l4-binding.test.ts |
| L4-T09 / S01/S07 | 认证错误/限流/协议异常包含秘密哨兵和物理路径；持久化与遥测同时观察 | 稳定公共 Error、execute retryable=false；日志/事件/Artifact 不出现秘密；不凭状态码推断 none | UT/Integration；test/integration/l4-error-isolation.test.ts |
| L4-T10 / S06 | 已发布 `ok` 后卸载失败；同时 Secret 撤销成功；恢复后再清理两次 | 执行成功证据保留；cleanup=pending；未回收容量不释放；后续只清理，不再 execute；最终全资源为空 | DT/Integration；test/integration/l4-cleanup.test.ts |
| L4-T11 / S03/S05/S06 | 真进程在环境创建后、handle 返回前终止宿主；重启机制清理器；再注入启动后宿主退出 | 按 scope/c17 标签发现孤儿；无第二环境/第二 workload；未知效果不变 none；最终执行组/挂载/Lease 全回收 | System/故障注入；test/system/l4-sandbox-restart.test.ts |
| L4-T12 / S03/S06/S07 | 真实沙箱尝试越界文件、symlink 竞态、禁止出口、fork 超额、内存/CPU/磁盘超额及输出洪泛 | 内核/机制拒绝越界；执行组按档案有界终止；无宿主 fallback；测量 usage 无数据为 null；无泄漏资源 | System/隔离验收；test/system/l4-sandbox-isolation.test.ts |
| L4-T13 / S05/S06 | Artifact 发布后 L1/宿主提交失败，推进 GC 时钟；存在 unknown/cleanup pending；容量耗尽 | 结果与证据仍可读；pin 未交接不能删；拒绝新工作；不得删未知记录腾空间 | Integration；test/integration/l4-evidence-retention.test.ts |
| L4-T14 / S03/S08 | 新机制注册重复绑定、缺处理器、缺清理能力；受信只读 Provider 被错误声明成强制隔离 | 装配失败；依赖图无 L4→PDP/RunRepository、无厂商字符串中央分派 | DT/结构评审；test/dt/l4-composition.test.ts |

System/故障注入必须在明确隔离的测试环境执行，不把故障流量指向开发宿主或真实业务 Provider。按原 ST-SBX、ST-INF、ST-RES 风险归并验收，不以本表编号冒充旧 ST 已实现。DT 含义沿用 framework.md 的组件白盒测试。

## 设计闭合与证据门槛

- S01..S08 均已有组件算法、契约落点及测试设计；S01+S05、S03+S04+S06、S07+S04 组合分别由 T02、T06/T10/T11、T07 覆盖设计。
- B1 尚待完整资源档案与安全绑定冻结；B2 为 L1/宿主保存与迟到交接；B3/B4 尚待机制/Provider 具体能力和证据存储装配。这些分支属于“场景已列、接口或集成未闭合”，不算实现覆盖。
- 真实验收必须记录用例数、通过/失败/未执行、环境档案、耗时和报告路径；本轮无运行测试数据。
- 结构检查包括唯一权威、单向域引用、Port 依赖和真实扩展实例；自动链接/语法检查不代替安全与故障语义评审。
