# LawClaw TUI 客户端开发切片

设计入口：[Kernel TUI](../../../docs/design/clients/components/kernel-tui/README.md)。LawClaw使用pi-tui，不复用Pi执行循环。

当前代码覆盖局部客户端规则和正式HTTP/SSE传输适配，并非可启动的完整TUI：

| 单元 | 职责 | 当前证据 |
|---|---|---|
| observation.ts / live-text.ts | 单Run快照补查、订阅换代、临时文本与旧响应隔离 | AK-TUI-001—004，端口替身 |
| editor-adapter.ts | Pi提交先清空时保护草稿 | AK-TUI-005/007，真实Pi Editor |
| terminal-input.ts | 首期命令解析，窄屏只拦普通对话 | AK-TUI-006，仅解析，未证明取消请求端到端 |
| content-page.ts | 单页正文读取，失败保留及版本隔离 | AK-TUI-008/009，端口替身 |
| resume-records.ts | 读取指定实例，pending优先或仅书签，权限与scope校验 | AK-TUI-010，真实本地文件，未证明任务接回 |
| kernel-client.ts | TUI-CON-001初始化、命令、查询、流读取与ACK；不重发写 | AK-TUI-013—017，真实回环HTTP与受控服务；不是完整Host |

观察基础类型位于`src/contracts/kernel-tui.ts`；首期命令/会话/Run公开类型及严格解码位于`src/contracts/kernel-client.ts`和`kernel-client-codec.ts`。客户端核对身份、协议、帧大小、UTF-8、重复JSON键及深度；二/三期能力未进入代码路径。

未交付：TuiApplication/PiTuiViews装配、Launcher、完整pending写入/清理、对话用例和Session采纳、真实KernelHost接入。不得以FakeClient模拟这些未实现能力后登记TUI-E2E通过；设计中的10条整链验收仍为planned。2026-09-10发现当前持久Flow的Session派生版本与既定SM权威模型冲突，见设计评审记录；正式接入不能隐藏此差异。

已补充TUI-LOCAL-001真实局部验收：两包npm run build后执行`python3 scripts/verify-kernel-tui-pty.py`（包目录）。使用系统PTY、真实HTTP/SSE、当前AgentSystem/RunFlow和确定性Faux模型，读取已编译dist产物；验证中文提交、Kernel结果、状态通知、29列退出和终端恢复。`scripts/kernel-tui-local-chain.mjs`是验收夹具，不是生产Host；不证明连续会话、文本增量流或持久恢复。详情见[验证记录](../../../docs/verification/kernel-tui-design-validation.md)。
