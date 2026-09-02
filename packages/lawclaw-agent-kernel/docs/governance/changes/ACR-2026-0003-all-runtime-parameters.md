# ACR-2026-0003：全部可调运行参数配置化

- 状态：BASELINED
- 级别：L1（内部装配与运行参数；不改变对外职责）
- 提议人：用户
- 子系统所有者：Agent Kernel
- 批准人：用户（2026-09-02 明确要求所有参数使用配置文件）
- 创建时间：2026-09-02
- 目标基线：AKB-2026-09-02-04

## 1. 目标

消除 Kernel 能力探针、工具 Adapter、Pi Adapter、Pi CLI 和子 Agent 中散落的可调参数，将模型、Prompt、预算、超时、容量、文件扫描、会话目录、能力探针身份和确定性场景统一纳入严格 YAML。

## 2. 参数与不变量边界

可配置项包括：Context 估算参数、工具目录容量、Run 上限、工具政策、只读扫描上限、委派配额、Pi 私有消息容量/重试、CLI Session/离线模式/子进程上限、能力探针RequestContext/目标/上下文和 Faux 场景。

不可配置项包括：错误码、事件类型、消息角色、工具稳定名称、配置 Schema 主版本、首版最大委派深度、禁止 Shell/写入/自动资源发现，以及配置文件自身的 Bootstrap 大小上限。这些是契约或安全不变量，不能通过配置关闭。

## 3. 架构影响

- 配置仍由 `src/config`、Composition Root 和 CLI 入口读取；
- Kernel 构造器只接收已经验证的普通值，不依赖 YAML；
- Adapter 接收配置化容量和超时，不反向定义领域政策；
- 总体 Draw.io：对外职责不变，无需修改；
- PlantUML：组件、Port 和依赖方向不变，无需修改。

## 4. 安全与韧性

- 未知、缺失、重复或类型错误字段默认拒绝；
- 所有数值有正数约束和不可突破的绝对安全上限；
- 能力探针预算不得超过 `kernel.runLimits`；
- `maxDepth` 首版必须为 1；
- Prompt、正文和 Secret 不出现在配置错误详情中；
- 配置重启生效，不实现热更新。

## 5. 约束追踪

| 约束编号 | 落实 | 验证 |
|---|---|---|
| UP-AGT-005 | Run 预算由配置注入且有硬上限 | 预算解析和纵切测试 |
| UP-CTX-003 | Context 估算参数配置化，Frame 语义不变 | Context 测试 |
| UP-TOOL-001 | 工具政策和扫描容量配置化，默认拒绝不变 | 工具负向测试 |
| UP-DEL-001 | 委派配额配置化，深度仍固定为 1 | 递归拒绝测试 |
| UP-SEC-001 | 参数有绝对安全上限，禁止能力不可配置开启 | 超上限配置测试、源码门禁 |
| UP-DEP-001 | Kernel 不导入 YAML 或配置加载器 | 依赖扫描 |

## 6. 验证证据

- `npm run typecheck`：通过；
- `npm test`：13/13 通过；
- `npm start`：通过；
- `npm run pi -- --version`：0.84.4；
- `npm run pi:smoke`：通过；
- `npm run check:architecture`：通过；
- `npm audit --audit-level=high`：0 vulnerabilities；
- PlantUML/SVG 门禁：10/10 通过。

## 7. 基线结论

2026-09-02：全部可调运行参数完成配置化；契约和安全不变量保持锁定，变更并入 `AKB-2026-09-02-04`。
