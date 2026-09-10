---
doc_id: TUI-VER-001
level: verification
layer: Client Interface
component: KernelTUI
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "Kernel TUI 设计验证记录"
parent: CLI-CMP-001
interfaces: [TUI-CON-001]
diagrams: []
supersedes: []
---

# Kernel TUI 设计验证记录

最新进度（2026-09-10）：新增模型临时观察与正式HTTP/SSE客户端。统一验收器选中17项局部用例通过，原定10项产品E2E仍未实现/未运行；正式Host接入存在Session权威冲突，见本页末节。此前日期段落仅代表当时执行事实。

本页累计记录设计、局部代码及运行证据；各阶段分开。最新结果见末尾“编译与真实PTY局部链路”。规范入口：[组件](../design/clients/components/kernel-tui/README.md)；语义评审：[自审](../governance/reviews/kernel-tui-design-review.md)。

## 验证范围

检查新增客户端、六个SR、公共契约、图形、部署及治理导航。测试ID使用TUI前缀，不覆盖System SFMEA的FM/ST。SR内为用例唯一来源；本页只记录执行事实。

## 运行验收方案（未执行）

使用可注入Clock/Id/Client/Launcher、FakeTerminal、确定性模型替身、真实独立Host和临时存储。协议测试检验回执与公开事件；集成用屏障控制受理/取消/输出顺序；tmux 80×24/40×16检查提交、追问、流式、取消、退出接回。客户端重启与Host重启分别测试。真实模型仅另行授权运行并记录模型/配置/镜像版本，不能用旧报告覆盖。

代码验收未来执行仓库规定的npm run check；新增测试必须单独运行。此次纯文档不运行构建、npm test或真实模型。

## 初始纯设计阶段静态证据

2026-09-09执行结果：

| 检查 | 结果 | 边界 |
|---|---|---|
| check-document-architecture.sh | 通过：7个内部层、34个内部组件、106份受治理文档 | 客户端作为独立document_set登记，不计为内部层；检查元数据、parent、路径、活动链接及既有禁止依赖模式 |
| git diff --check | 通过 | 工作区已跟踪差异的空白检查，不是运行验证 |
| PlantUML 1.2026.7 SVG渲染 | 7/7通过 | structure类图与六个功能域流程图，仅渲染本轮新图 |
| PNG视觉检查 | 7/7已重新查看；03最终修订后再次查看 | 中文显示、节点和连线标签可读、无明显裁切；长流程需在文档中滚动查看 |
| 上下层语义自审 | 已记录 | 参见评审矩阵；不代表用户批准或所有Kernel组件已就绪 |
| TUI测试 | 33个候选用例，0个运行 | 六SR内记录；没有新增测试源码、无tmux或真实模型执行 |

渲染时Docker直接挂载系统字体目录被拒绝，改用临时目录内的字体副本后成功；类图初次语法错误已修复并重渲染。未修改手工Draw.io或既有图源。PNG仅作临时视觉验证，交付图为puml与SVG。

文档覆盖：六功能域及公共契约已形成。规格完整性：六域在单连接、单前台、单未决写等声明约束内可开发；公共契约明确输入输出及保证方。Host准备持久化、公开Run投影映射、SM/Run集成属于服务依赖，不扩大为TUI内部职责；联合运行仍待这些依赖交付。评审：candidate、自审完成、待联合确认。代码实现：本轮无。运行验证：未执行。不能据文档和图形通过宣称首期端到端可用。

## 六项修订后的首批代码映射

设计修订已登记，10条跨域E2E仍未实现。以下是局部实现用例，沿用仓库AK编号；候选SR编号不作为运行器ID。宿主、HTTP/SSE、完整应用装配未交付，不能声明一期完成。

| 实现ID | 设计场景 | 验证范围 |
|---|---|---|
| AK-TUI-001 | TUI-03F | 查询在途收到最后通知后仍补查终态 |
| AK-TUI-002 | TUI-03G | revision变化关闭旧订阅并在新cut订阅 |
| AK-TUI-003 | TUI-03B | 缺口重取且旧响应不能覆盖新前台 |
| AK-TUI-004 | TUI-03J | 服务持续返回落后cut时有限停止 |
| AK-TUI-005 | TUI-06F | 真实Pi Editor先清空时保护原文且迟到accepted不清新草稿 |
| AK-TUI-006 | TUI-06H | 29列只拒绝普通对话，取消和退出保持可解析 |
| AK-TUI-007 | TUI-06A | 真实Pi bracketed paste不产生提交 |
| AK-TUI-008 | TUI-06I | 中文码点分页，失败保留当前页，旧版本不拼接 |
| AK-TUI-009 | TUI-06J | 返回后迟到正文不能恢复已关闭页 |
| AK-TUI-010 | TUI-04G | 真实文件仅有bookmark也能恢复且拒绝错误scope |


### 本轮执行事实与剩余实现

- 六项设计修正及10条整链验收已落档。SR-01/03/06图源与SVG重渲染，并逐张查看PNG，文字连线可读。
- 直接运行：`node --import tsx --test test/ut/kernel-tui-run-observation.test.ts test/integration/kernel-tui-terminal-interaction.test.ts test/integration/kernel-tui-content-page.test.ts test/integration/kernel-tui-session-navigation.test.ts`，10/10通过，包含真实Pi Editor与真实本地书签文件；其余为端口替身。
- `tsgo --noEmit --pretty false`通过。`npm run check`在工作区隔离副本执行通过（复制当时工作区源码，共享已安装node_modules）；其自动格式化只作用于副本，未回写其他未提交文件。不是对当前正在并行修改的整个工作区作永久通过承诺。
- 统一验收器指定AK-TUI-001—010，首次被未登记AK-CTX-110阻断；后续运行被未登记AK-CTX-201阻断，均为0项执行，不能记为TUI统一门禁通过。该并行修改未由本轮更改。
- 尚未实现TUI应用入口、HTTP/SSE适配、Launcher、完整提交恢复和宿主会话链路。现有AgentSystem/RunRegistry仍为内存入口；SQLite Run存储存在但不是已接通的公开会话服务，模型handler未公开文本流。没有运行tmux、新Kernel整链或真实模型；不宣称一期可用。
- 中文公共契约注释检查：本轮TUI文件缺项已修复；全包仍报告Context的source-reader.ts和validation.ts缺少中文TSDoc，未改动其他正在开发的文件。
- 最终复核：10项TUI测试再次通过；隔离副本再次执行完整npm run check通过；文档架构检查和git diff --check通过。后续整链开发仍需完成上述装配与服务能力，不以本次局部实现替代。

## 编译与真实PTY局部链路

2026-09-09，用户要求编译并验证已实现的真实局部链路。编号TUI-LOCAL-001，不等同于TUI-E2E-01—10完整宿主验收。

首次包构建发现EditorAdapter.dispose将可选回调赋undefined，不符合构建配置exactOptionalPropertyTypes。已改为delete回调属性，重新执行包构建成功。此前noEmit通过不能替代此构建证据。

实际运行链路：系统PTY → 编译后的pi-tui ProcessTerminal/Editor → 编译后的EditorAdapter/parseTuiInput → 真实本机HTTP/SSE → 编译后的AgentSystem/RunFlow → 已配置Faux Pi Adapter及真实只读工具 → 编译后的RunObservation → 终端结果。独立服务进程只提供`/validation`验收端点，不是生产KernelHost，不实现TUI-CON-001完整协议。

| 检查 | 实际结果 |
|---|---|
| packages/tui：npm run build | 通过，生成当前Pi TUI运行产物 |
| packages/lawclaw-agent-kernel：npm run build | 修复上述构建错误后通过，运行使用dist/*.js，无tsx运行时替代 |
| Python系统PTY驱动 | 通过；本机没有tmux，使用PTY并执行实际TIOCSWINSZ/SIGWINCH |
| 中文输入 | 服务收到“请检查工作区并给出中文结果”，仅一次提交 |
| 当前Kernel执行 | Run为COMPLETED，3轮、2次工具调用；事件包含ToolCompleted/ChildRunCompleted；Session活动绑定释放 |
| 真实SSE与显示 | 收到运行变更通知，RunObservation查到最终快照，PTY原始输出包含结果文案 |
| 29列退出 | /quit仍经命令解析；进程退出0；stdin.isRaw=false；独立服务仍存活 |
| EditorAdapter回归 | AK-TUI-005—007，3/3通过 |

成功证据目录：`.artifacts/verification/kernel-tui-pty/20260909-163312/`，包括report.json、service.jsonl、terminal.jsonl及terminal.raw。对应Run为922959b7-6bfb-4a6b-9d7b-99752815abe0。第一次PTY尝试把/quit和Enter同包发送，退出等待超时；驱动改为等待编辑回调屏障后发送Enter，并持续排空PTY，再次通过。没有通过固定sleep猜测Kernel完成。

复现（仓库根）：

```bash
npm run build --workspace=@earendil-works/pi-tui
npm run build --workspace=lawclaw-agent-kernel
python3 packages/lawclaw-agent-kernel/scripts/verify-kernel-tui-pty.py
```

模型为确定性Faux，委派结果沿用现有FakeDelegationProvider；未调用真实付费模型。Kernel结果中的固定文案不是流式验收证据。本次验证SSE状态通知，**未验证模型文本增量、生产宿主协议、持久受理、会话历史采纳/追问、取消竞争、宿主重启恢复**。这些仍须按组件§7真实整链验收交付。验收脚本不是产品入口，不将其直接调用当前Kernel的测试装配引入TUI客户端源码。

## 2026-09-10：第一阶段协议及模型观察开发进度

本次实现：公开客户端DTO、严格解码器、KernelHttpClient、持久模型执行器的非耐久观察出口；未实现产品TUI/Host装配。没有新增产品截图、没有运行真实模型；新增网络测试的服务端是受控HTTP响应夹具，不冒称KernelHost。

| 用例 | 实际断言与范围 |
|---|---|
| AK-TUI-011 | 真实SQLite/ReAct Kernel在模型完成屏障前发布原始文本；中文/emoji偏移0、2；完成后重新drive不调用模型 |
| AK-TUI-012 | 模型流抛错仍关闭临时观察，未提交正文不作为成功输出 |
| AK-TUI-013 | 真实HTTP受理后断socket；一次写入，查询原command得到同一Run；传输requestId变化 |
| AK-TUI-014 | 真实SSE start与32条通知；ACK后关闭流报告失联 |
| AK-TUI-015 | 明确409拒绝与错误commandId回执分别作为边界错误和协议错误 |
| AK-TUI-016 | 重复JSON键（含Unicode转义同名）、深度及字节上限拒绝；不同对象同名键合法 |
| AK-TUI-017 | 验收守卫允许字面回环HTTP，但阻断外网、localhost域名和重定向 |

执行结果：

- 包`npm run build`通过；全部源码公开中文注释检查通过。
- 统一验收器指定AK-TUI-001—017：6个测试文件、17项通过、0失败、0跳过。报告：`.artifacts/verification/tui-stage1-20260910-final/report.json`；报告startedAt为2026-09-10T05:34:56.614Z，各项durationMs及源码摘要随报告保存。
- 相关回归：`flow-runtime.test.ts`和`verification-runner.test.ts`，2个文件、14项通过、0失败、0跳过，总耗时6391.98ms。
- 根`npm run check`在工作区隔离副本`/tmp/lawclaw-stage1-check.npaLjP`通过；自动格式化只作用于副本，不覆盖他人正在修改的文件。源码副本不含.git/node_modules/dist/.artifacts，复用安装好的根依赖。不是全Kernel测试通过声明。
- 失败记录：首次统一验收执行16项，其中AK-TUI-013/014/015被`VERIFICATION_NETWORK_DISABLED`阻断；报告保留于`.artifacts/verification/tui-stage1-20260910/`。为真实本机链路验收将守卫收敛为允许字面回环，新增017验证外网仍被阻断，然后重跑成功。没有关闭网络守卫或跳过这些测试。

全局未完成：E2E-01—10均未执行，Launcher、产品应用装配、Host准备/原命令存储、Session持久受理/采纳、产品取消、断线/重启恢复及真实终端视觉验收仍未交付。当前持久Flow使用RunStore派生Session版本，与既定SM模型存在新发现的上下层冲突；修订提案见[评审记录](../governance/reviews/kernel-tui-design-review.md)。此处不将“发现依赖冲突”视为第一阶段完成，也不缩小10条验收范围。
