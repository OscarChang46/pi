# ACR-2026-0020：L4 受控执行架构细化

状态：IMPACT_ANALYZED / candidate；2026-09-09。用户授权基于架构文档细化 L4；本轮只修改设计文档，不代表公共 Schema、运行实现或发布批准。

问题：L4 仅有职责概要；旧依赖规格不完整；本轮期间 L3-FD-2/BND-L34 更新已同步纳入；未知副作用、输出确认和资源回收缺少可编码分工。

选择：保留 ToolProviderAdapter 和 SandboxRuntime 两组件，分别按调用/证据、环境/回收细化四个功能域。L3 冻结路由并经 Guard 检查，L1/宿主保证一次有效派发，L4 单次执行，Infrastructure 拥有进程与清理机制。执行事实、效果及清理正交；不新增权限或调度服务。

影响：L4 层与组件、L4-DD-1 候选契约、功能域导航、验证视图和文档清单。上游类型只记录所需联合修订，不静默替换。历史 kernel-dependencies 的范围声明只适用于旧轮次。

基准：codex/arch-agent-system-v3，HEAD 51b5a71f306ba59f65d890da45a822c5385b8831 加既有未提交工作树。输入摘要及上下层核对见[评审](../reviews/l4-detail-2026-09-09.md)。

开放项：B1 完整限额与安全摘要绑定；B2 L1/宿主事实保存及迟到交接；B3 真实机制能力及 supervisor 协议；B4 可信效果证明与证据保留装配。维持候选，待联合契约评审后方可实现集成。

入口：[L4 层](../../design/layers/l4-execution-runtime/README.md)。不修改运行代码、依赖、测试注册或手工 Draw.io；未提交推送。
