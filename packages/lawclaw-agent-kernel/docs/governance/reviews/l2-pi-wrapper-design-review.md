# L2 Pi封装设计评审（2026-09-09）

范围：L2层、四个既有组件及PiAdapter三个功能域。设计入口：[L2](../../design/layers/l2-cognitive/README.md)。本报告是本轮单代理语义走读，不是独立多角色批准。

## 结论

Pi单轮流、模型目录/认证、Provider协议与共享上下文转换的复用路径已明确。候选设计仍有B1/B2/B3开发阻塞，不能宣称整层可直接开发；现有实现也尚未符合CTX输入约束。无运行代码变更，不执行运行测试，不提交。

## 上下层语义追踪

| 上层约束及来源/状态 | 下层落点与实际行为 | 结论 | 场景与处理 |
|---|---|---|---|
| 总设计§15 Pi位于Adapter下、允许复用核心能力；候选 | L2§8.2、PiAdapter私有模型客户端，复用streamSimple及Provider解码 | 一致 | S01/S02；无第二套SSE/Provider |
| 总设计UP-TOOL-001、§14工具经L1，BND-L12单命令 | Runtime状态表、PiAdapter完整输出；工具候选返回L1 | 一致 | S02；原生shouldStopAfterTurn在工具后，不能作为阻止执行入口 |
| 总设计§7、ACR-0012 FE是通用框架 | L2§8.3；ReAct业务宿主提交新InvokeModel | 一致 | 不把ReAct策略或工具循环塞回FE/L2 |
| CTX-CON-1§3.1及§6.4四字段、同版映射；既有增量设计 | PiAdapter输入域共享PiContextAdapter | 一致（设计） | S01/S03/S06；实现差异单列B4 |
| CTX四字段与CD-1 ModelStepRequest/AdapterRequest | ModelStepRequest缺明确sessionId来源；AdapterRequest重复payload字段但非四字段；invoke与executeTurn尚未统一 | 冲突（候选契约间） | B1；不是授权改变上层，待按CTX同步CD-1与调用者 |
| 总设计§13事件耐久后确认、旧代次拒绝、未知不重试 | Runtime reporting/unknown恢复轨迹 | 一致（设计） | S05；只重传原eventId，不重跑Pi |
| 总设计UP-RES-001/CD-1硬容量 | 流域指出原生EventStream无界queue | 证据不足 | B3；外层缓冲不证明生产端或RSS有界 |
| CD-1 Parser重复键/完整参数拒绝 | PiAdapter raw证据+严格扫描，再Kernel校验 | 证据不足 | B2；当前Pi参数可能修补，需Provider能力证明 |
| 总设计UP-DEP-001/002、BND-MOD私有出口 | ModelRuntime/Models只在适配/可信装配，Egress控制网络 | 一致（设计） | 当前工厂直接绑定runtime.streamSimple未证明出口强制，纳入实现验收 |
| SessionManager单活Run、Context不重入 | 每命令独立工作集，无Session缓存和新的排他管理器 | 一致（设计） | S03/S06；L1提交点仍拒绝迟到执行 |

本轮不改变已确定的高层复用机制；上述B1是既有候选签名传播未完成，B2/B3是库能力和实现证明缺口。没有以“首版简单”豁免，也没有另建Provider或上下文实现。

## 开发阻塞与实现差异

| ID | 具体出处/轨迹 | 遵循上层的处理及责任 | 状态 |
|---|---|---|---|
| B1 | CD-1 L2-CMP-001/003缺sessionId的确定传递，候选invoke与当前executeTurn不同；Parser chunk仅payloadRef且Artifact交付尚需绑定 | 契约维护者把CTX四字段作为唯一模型输入，执行元数据另置运行信封；明确sessionId从已核验候选绑定取得，同步L1生产者、Runtime及Adapter签名、错误集和结果提交 | 开发阻塞；本轮不在域文档另造公共协议 |
| B2 | Pi parseStreamingJson使用repair/partial解析；最终对象无法证明无重复键。toolcall_delta原文完整性取决于Provider | Pi适配维护者逐Provider跑raw向量；不足时通过Pi公开扩展点补无损参数证据。首版不合档案者禁用工具能力，不自行实现Provider | 工具路径阻塞；扩展点签名未定 |
| B3 | Pi EventStream.push向无界queue追加，未对生产者反压；大量空事件也绕过字节计数 | Pi流维护者在生产端增加可配置事件数/字节上限或受控有界sink，配合网络帧上限和下游中继；需证明Abort释放。不能只在外层加队列 | 容量实现阻塞；接口和高水位尚未定 |
| B4 | 当前PiAgentAdapter.executeTurn读取request.frame/request.tools，并从nativeMessages/messageStore恢复；PiContextAdapter尚用context-projection占位模型，与契约要求的冻结档案不符 | 按既有CTX迁移统一输入转换；绑定真实档案并共用于估算和发送；未来实现需完整读取调用链。保留现有运行代码，本轮不移除功能 | 实现差异，未修代码 |

## 源码核对范围

读取当前PiAgentAdapter、pi-adapter-factory、AgentRuntime、共享PiContextAdapter全文；核对Pi agent-loop执行顺序、types事件联合、json-parse、event-stream及Models/ModelRuntime请求入口。node_modules两个Pi包均链接到本repo workspace，版本行为以本地源码为准。未核对所有Provider SDK、未运行真实出口，因此不声称全Provider支持raw证据、零重试或取消。

## 验收设计与证据

新增L2-PI-01..20共20个具名测试设计，覆盖输入、工具输出、单轮调用、取消、错误脱敏、恢复和结构约束；未登记为可执行测试，未实现/未运行。沿用原L2-CMP测试设计，不将历史执行结果算作本轮证据。容量M5因B3未定只列测量需求，不给虚假通过阈值。

主成功走读：已采纳payload→共享映射→Pi一次请求→合法stop→规范完整结果→L1采纳。异常走读：raw参数截断→整轮拒绝→工具派发0；ACK丢失→原结果查询/重传→模型调用仍1。扩展走读：新Pi Provider只改受信绑定及能力向量，不修改Runtime循环规则。

文档覆盖已细化，公共规格仍受B1/B2/B3阻塞；评审状态candidate；运行实现、运行测试和发布均不属于本轮完成项。

### 输入指纹（SHA-256）

路径相对仓库根，记录本轮读取的工作树版本，避免把脏工作树误称HEAD提交内容。

| 文件 | SHA-256 |
|---|---|
| packages/lawclaw-agent-kernel/docs/design/agent-kernel-design.md | 5e96fc66a143e098e13335bccbd428963a5be235b2275b02652d55a37a177843 |
| packages/lawclaw-agent-kernel/docs/design/contracts/context-assembly-contract.md | 2647d2e5ba57ad968064cf844be073c924b40a59be7c7d7cfcb08f0d694778f8 |
| packages/lawclaw-agent-kernel/docs/design/contracts/component-development-contracts-v1.md | d5894e5875128c34625044afbcbf1bfd0fa6a521eb53f8d4d723068338c24aaf |
| packages/agent/src/agent-loop.ts | 1e16404a231912fbd7643d8317b15ec4cc6245ed8cedc37582a31d430a1cc6ac |
| packages/ai/src/utils/json-parse.ts | 828440b19a64773f696ced9461166913ddaddd8479697fbde32d3f298872b153 |
| packages/ai/src/utils/event-stream.ts | 55ddd6e6e4299f377fc3f8876ea9d8073f0051d569f1629f8817ec78e28d64e6 |

### 静态与图形检查

- `bash packages/lawclaw-agent-kernel/scripts/check-document-architecture.sh`：通过，7层、34组件、110份受治理文档；包含元数据、父级、导航及活动Markdown本地链接。不是上下层语义自动证明。
- `git diff --check`：通过。
- PlantUML `1.2026.7`：本轮涉及正文中的7个内嵌图与1个L2组件图均成功生成SVG；L2正式SVG已按源码重新生成。使用同一theme及中文字体。
- 图形视觉检查单独记录：L2组件图检查全图；内嵌图目前完成语法渲染，未逐张视觉验收，不宣称全部视觉通过。
- 全量旧渲染脚本固定20张并删除全部输出，本轮未运行；只刷新本轮L2图，保留其他既有图和手工画布。
- 无运行代码修改，未运行运行测试、构建或全仓代码检查；上述20个新增用例仅为设计。
