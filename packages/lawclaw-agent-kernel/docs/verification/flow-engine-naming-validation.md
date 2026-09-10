---
doc_id: VER-FE-NAMING-20260908
level: verification
layer: Cross-cutting
component: FlowEngine
status: implementing
baseline: AKB-2026-09-03-09
authoritative_for: FlowEngine命名统一的本机验证范围与限制
parent: VER-INDEX-001
interfaces: [FlowJournal, FlowExecutionContext]
diagrams: []
supersedes: []
---

# FlowEngine 代码与设计命名统一验证

日期：2026-09-08。对象为当前未提交工作区；不是远端提交或已部署镜像的验收。当前设计入口见[FlowEngine](../design/layers/l1-control/components/flow-engine/README.md)。

## 当前名称

| 范围 | 当前来源 |
| --- | --- |
| 类型 | `FlowRunState`、`FlowRunAction`，定义于 `src/contracts/control/flow-engine/flow-engine-contract.ts` |
| 常量 | `FLOW_RUN_STATE`、`FLOW_RUN_ACTION`，定义于同目录 `flow-engine-values.ts` |
| 状态迁移 | 同目录 `flow-engine-transitions.ts` 的 `resolveFlowRunTransition` |
| 集成测试 | [flow-engine.test.ts](../../test/integration/flow-engine.test.ts) |
| 维护入口 | [flow-engine-admin.ts](../../scripts/flow-engine-admin.ts)；部署产物为 `flow-engine-admin.mjs` |
| 部署测试产物 | `flow-engine-test.mjs`，生成脚本和 Dockerfile 使用相同名称 |

旧公开标识不保留别名。调用方需更新导入；非法迁移错误改为 `FLOW_RUN_INVALID_TRANSITION`。状态、动作、事件的持久化取值未变，v1 数据库文件、表名和身份摘要编码不变。

## 本机验证结果

- 根目录 `npm run check` 通过。
- 文档架构检查通过：7层、34组件、84份受治理文档；当前文档链接及清单有效。
- 统一验收入口选中AK-FS-001/012/013全部通过，报告位于包目录 `.artifacts/flow-engine-naming/report.json`。原无编号的旧日志回放测试补登记为AK-FS-013。
- 42 项定向回归通过，包括四态矩阵、旧协议身份与Completed回放、SQLite竞争和追加保护、真实子进程SIGKILL、HTTP及业务桥接。
- `check-runtime-boundaries.sh`、公开契约注释检查通过。状态门禁新增旧类型、常量和迁移函数名称检测，AK-FS-012验证五种旧标识被拒绝。
- 从 SR-03 原文抽取 TypeScript 示例，仅替换包导入为本机源码路径后执行：返回Terminate/result=3；同flowRunId重放不新增日志。示例已改用真实接口字段flowRunId。
- 维护入口、集成测试及崩溃worker使用部署所用的esbuild参数成功打包；未运行部署生成器、改写模型配置或重建容器。

包目录复现回归：

```sh
node --import tsx --test test/contract/flow-engine.test.ts test/contract/flow-state-constants.test.ts test/ut/flow-engine.test.ts test/integration/flow-engine.test.ts test/integration/flow-runtime.test.ts test/integration/flow-http.test.ts test/integration/flow-storage.test.ts test/integration/flow-artifacts.test.ts
```

## 真实性与边界

SR-01公开签名与指令对齐当前FlowEngine和FlowJournal；SR-02的reconcile仅支持Yield，未知结果不重发；SR-03只覆盖单flowRun节点图，示例通过实际执行验证。跨flowRun调度仍为独立扩展，不因改名变为已实现。

本次未重新部署Docker、调用DeepSeek或执行生产环境验收。[2026-09-07验证](flow-system-validation.md)中的旧脚本名、命令、镜像摘要是历史执行事实，不作当前版本证据。历史编号和目录迁移表中的旧名称用于追溯；当前源码对外名称以本页及组件设计为准。ReAct业务职责归属等既有开放项未由本次命名统一关闭。
