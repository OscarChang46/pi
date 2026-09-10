# RunRegistry（L1-CMP-006）

设计依据：[RunRegistry](../../../docs/design/layers/l1-control/components/run-registry.md)。

- [run-registry.ts](run-registry.ts)：现有进程内注册入口。
- [agent-run.ts](agent-run.ts)：现有AgentRun对象及生命周期。
- [Run存储契约](../../contracts/control/run-registry/run-storage.ts)：耐久受理、查询、事件及命令提交接口。
- [SQLite适配](../../infrastructure/state-storage/adapters/run-registry/sqlite-run-repository.ts)：基础设施实现，不放入FE。

目录归类不等于实现统一：进程内RunRegistry与耐久AgentRunStore仍是两条现存调用路径，尚未收敛为设计中的唯一入口；本次不通过移动文件掩盖该差异。业务状态转换策略由调用方注入，归属未确认前不迁入本组件。
