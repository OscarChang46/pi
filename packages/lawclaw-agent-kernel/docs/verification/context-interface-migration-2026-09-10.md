# Context 接口迁移与验收入口回归

本次检查范围：src、test、scripts 中的旧 ContextEngine 三参数适配接口及旧 Session 查询/创建入口。

发现并修复：PTY 验收脚本仍调用 ensureSession/lookupSession；HTTP 路由在缺少 sessionKey 时构造显式 undefined 属性。

漏检原因：开发类型检查未覆盖构建配置的 exactOptionalPropertyTypes；HTTP 测试只检查响应，未检查内部受理参数；PTY 脚本位于 scripts，不在 test/**/*.test.ts 的验收扫描范围。

门禁调整：typecheck 同时使用构建配置执行 noEmit；AK-FE-025 断言 sessionKey 必须省略或为字符串，并验证 null、数字、空串、对象和数组均拒绝且不受理、不调用模型；包 verify --checks 纳入真实 PTY 验收。PTY 运行前必须成功构建 pi-tui 和 Kernel，不能使用失败构建的部分产物。

PTY 脚本使用 ensure(context, command) 返回的 anchor.sessionId 创建 Run，执行完成时确认 Session 存在且释放活动绑定。

2026-09-10 独立运行 PTY 通过，证据目录：`.artifacts/verification/kernel-tui-pty/20260910-115955/`。3 轮、2 次工具调用，包含子任务完成、SSE 状态通知、中文结果显示、29 列退出及终端恢复。

`/validation/run` 和 `/validation/runs/:id/stream` 是独立测试服务的 HTTP 路径，不是终端命令。此链路使用 Faux 模型与现有委派替身；生产 KernelHost 协议、真实模型、文本增量流、持久受理与宿主重启不在该证据范围内。
