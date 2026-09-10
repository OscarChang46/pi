---
doc_id: CLI-DES-001
level: client
layer: Client Interface
component: KernelTUI
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "客户端组件设计"
parent: SYS-DES-001
interfaces: [TUI-CON-001]
diagrams: []
supersedes: []
---

# 客户端组件设计

客户端位于 Kernel 内部 L1—L4 及横切平面之外，是管控面的使用者。复用库和请求链必须分别绘制，不把界面组件放到请求链起点。

- [Kernel TUI](components/kernel-tui/README.md)：独立 LawClaw 应用使用 pi-tui；按组件内功能域 SR 展开。
- [总设计](../agent-kernel-design.md)、[外部契约](../contracts/bnd-ext-001.md)。

文档是候选规格，不代表组件或内核前置能力已实现。客户端区不增加第八个 Kernel 内部层。
