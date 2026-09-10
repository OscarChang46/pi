# FlowEngine 契约

本目录定义通用Flow系统状态、合法迁移、日志及有向任务图类型。状态值在`flow-engine-values.ts`统一定义，迁移规则在`flow-engine-transitions.ts`复用。

业务ReAct输入仍在上层[flow-engine.ts](../../flow-engine.ts)，不能与通用Flow系统状态混为一个协议。
