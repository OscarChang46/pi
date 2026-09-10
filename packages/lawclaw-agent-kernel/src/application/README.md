# 应用装配

## 职责

创建并连接控制、认知、安全、工具与执行组件；提供配置化本地入口。

## 边界与非职责

不处理业务编排，不直接使用 Pi 原生类型，不提供缺失安全依赖的默认放行。

## 接口、依赖与生命周期

composition-root.ts 返回 AgentSystem；调用方以稳定 logicalKey 和 `SessionCreationIntent` 调用 `lookup/ensure`，Session ID 只从 `EnsureSessionResult.anchor` 取得。`RootSessionPreparationCoordinator` 编排 `lookup → candidate → ensure`，并在竞争失败时丢弃空历史候选、按赢家锚点重组；它不保存或采纳候选。flow-composition.ts 装配耐久Flow服务；flow-http-server.ts 负责HTTP传输与生命周期，flow-http-routes.ts 按用例处理请求，后台调度在控制层。具体Adapter仅在装配边界创建。

## 文件与子目录

- [composition-root.ts](composition-root.ts)
- [index.ts](index.ts)
- [run-kernel.ts](run-kernel.ts)
- [root-session-preparation.ts](root-session-preparation.ts)
- [tool-composition.ts](tool-composition.ts)

- [flow-composition.ts](flow-composition.ts)
- [flow-http-routes.ts](flow-http-routes.ts)
- [flow-http-server.ts](flow-http-server.ts)
- [run-flow-server.ts](run-flow-server.ts)

## 设计依据

[对应设计](../../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
