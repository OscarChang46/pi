# ACR-2026-0004：统一 UTC 时间与 IANA 时区基础设施

- 状态：BASELINED
- 级别：L2（新增公共 `TimeContext` / `TimePort` 契约，不扩大 Agent Kernel 对外职责）
- 提议人：用户
- 子系统所有者：Agent Kernel / Infrastructure
- 批准人：用户（2026-09-02 明确要求时间管理成为区分时区的统一基础设施能力和接口）
- 创建时间：2026-09-02
- 目标基线：AKB-2026-09-02-05

## 1. 目标

统一 Agent Kernel、Adapter、工具和 CLI 的时间语义：绝对时间以 UTC 存储、比较和传输；调用上下文显式携带 IANA 时区与 BCP 47 locale；系统时间和本地化投影只通过 `TimePort` 获得。

## 2. 架构决策

- `RequestContext` 新增 `TimeContext { timeZone, locale }`，来源由 Backend 或本地 Composition Root 明确提供；
- 公共契约新增 `TimePoint`、`ZonedDateTimeView` 和 `TimePort`；
- Infrastructure 提供 `SystemTimeAdapter`，封装系统时钟和运行时 IANA 时区数据库；
- Kernel 事件、Tenant 有效期和 Operation deadline 只接受规范化 ISO-8601 UTC；
- 本地时间只是投影，不作为排序、幂等或持久化的权威时间；
- 耗时测量使用进程内单调时间，不把单调值当成 UTC 或跨进程时间；
- Run 截止时间取运行预算和 Operation deadline 剩余时间的较小值；
- 夏令时偏移由 IANA 规则计算；未绑定时区或有歧义的日历输入不得由主机默认时区猜测。

## 3. 架构影响

- 总体 Draw.io：对外职责不变，无需修改；总体图已把“时钟”明确归入 Infrastructure Runtime；
- Agent Kernel 仍只消费时间语义，不拥有时区数据库、NTP、主机时间设置或业务日历规则；
- `TimePort` 是稳定下行基础设施端口，具体 `SystemTimeAdapter` 仅由 Composition Root 装配；
- PlantUML 01、02、03、05、08、10 同步 `TimeContext`、`TimePort` 与依赖方向；
- 公共契约变更要求调用方显式提供时区，属于向后不兼容的能力探针基线升级。

## 4. 安全与韧性

- 未知 IANA 时区、非法 locale、隐式本地时间或非规范化 UTC 默认拒绝；
- Kernel 和非时间 Adapter 禁止直接调用 `Date.now`、`Date.parse` 或 `new Date`；
- 任何展示时区转换都保留原始 `TimePoint`，防止把格式化结果误作权威时间；
- 测试覆盖同一瞬间跨时区投影和 America/New_York 夏令时切换；
- `TimePort.monotonicMilliseconds` 用于抗墙上时钟回拨的耗时打点，禁止持久化或跨进程比较。

## 5. 约束追踪

| 约束编号 | 落实 | 验证 |
|---|---|---|
| UP-INF-001 | 时间机制由 Infrastructure Adapter 经 Port 向上提供 | 依赖扫描与组件图 |
| UP-INF-002 | UTC TimePoint + IANA TimeContext + TimePort | UTC/时区/DST 测试 |
| UP-CTX-002 | TimeContext 随 RequestContext 跨层传播 | 契约和纵切测试 |
| UP-RES-001 | Run budget 与 Operation deadline 取较早者 | AgentLoop 源码与取消测试 |
| UP-DEP-001 | SystemTimeAdapter 只在 Composition Root/CLI 装配 | 实例化扫描 |

## 6. 验证证据

- `npm run typecheck`：通过；
- `npm test`：19/19 通过；
- `npm start`：通过；
- `npm run pi:smoke`：通过；
- `npm run check:architecture`：通过；
- PlantUML/SVG 门禁：10/10 通过；
- `npm audit --audit-level=high`：0 vulnerabilities。

## 7. 基线结论

2026-09-02：统一时间接口并入 `AKB-2026-09-02-05`。时间能力仍属于 Infrastructure，Agent Kernel 只定义和消费端口语义，总体职责边界不变。
