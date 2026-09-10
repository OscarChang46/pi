# 工程检查与启动脚本

## 职责

提供类型外的架构、注释、文档和 CLI 检查，以及图形生成工具。

## 边界与非职责

只读检查不批准候选设计；render/prepare 脚本会生成文件，不能当成只读检查运行。

## 架构检查的通过范围

`check-document-architecture.sh`检查元数据、文档导航、本地链接及部分图形边界规则；`check-architecture-governance.sh`检查治理产物及约定标记。这些脚本通过不表示上层定义与模块设计已无冲突。

模块架构评审还必须沿有效总体设计、所属层设计、公共契约和已确认变更，核对职责、状态所有权、依赖方向、公共能力复用、数据与接口、并发、取消恢复及安全约束。对照模块正文、类图、算法和流程记录下表，以正常及适用的异常执行轨迹判断实际行为。

| 上层约束及文件位置 | 模块设计位置与行为 | 结论 | 场景影响与处理 |
|---|---|---|---|
| 标明输入版本和决策状态 | 给出可复核的章节或步骤 | 一致／冲突／上层未定义／证据不足 | 修订方向、责任方及关闭证据 |

结果写入对应变更的评审记录。上层未定义不直接判为冲突；涉及跨模块承诺时须补齐决定。未关闭冲突、关键证据不足或未评审的模块不得计为语义通过；相关设计改变后重审受影响项。报告分别说明自动结构检查与上下层语义评审的范围和结论，禁止将脚本成功作为整体架构通过的依据。

## 接口、依赖与生命周期

check-source-boundaries.mjs 校验源码依赖；check-public-contract-comments.mjs 校验公开注释；check-framework-docs.mjs 校验目录与链接；pi-cli-smoke.mjs 只检查离线 CLI 加载。compile.mjs 调用仓库统一的 TypeScript 编译器；Pi 依赖声明缺失时只在声明构建中使用 type-stubs，运行时仍要求真实依赖。

## 文件与子目录

- [verify.mjs](verify.mjs)：统一入口、层级与 ID 筛选。
- [verification.mjs](verification.mjs)：发现、映射、隔离执行、门禁及报告。
- [verification-reporter.mjs](verification-reporter.mjs)：仅输出标识和结果类别。
- [verification-offline.mjs](verification-offline.mjs)：可信测试误联网防护。
- [compile.mjs](compile.mjs)：选择真实依赖声明或编译期桩并运行类型检查、声明构建。
- [type-stubs](type-stubs/README.md)：外部 Pi 声明产物缺失时使用的最小编译期边界，不含运行时实现。

- [check-architecture-conformance.sh](check-architecture-conformance.sh)
- [check-architecture-governance.sh](check-architecture-governance.sh)
- [check-diagrams.sh](check-diagrams.sh)
- [check-document-architecture.rb](check-document-architecture.rb)
- [check-document-architecture.sh](check-document-architecture.sh)
- [check-framework-docs.mjs](check-framework-docs.mjs)
- [check-public-contract-comments.mjs](check-public-contract-comments.mjs)
- [check-runtime-boundaries.sh](check-runtime-boundaries.sh)
- [check-flow-state-constants.mjs](check-flow-state-constants.mjs)：扫描Flow源码中的裸状态判断、类型、表键和SQL；已接入运行时边界检查。可传入临时源码目录验证检查规则。
- [check-source-boundaries.mjs](check-source-boundaries.mjs)
- [diagram-runtime.sh](diagram-runtime.sh)
- [pi-cli-smoke.mjs](pi-cli-smoke.mjs)
- [prepare-drawio-plantuml.sh](prepare-drawio-plantuml.sh)
- [render-diagrams.sh](render-diagrams.sh)
- [run-pi-cli.sh](run-pi-cli.sh)
- [verify-milestone-one.sh](verify-milestone-one.sh)
- [verify-rendered-svg.sh](verify-rendered-svg.sh)

- [deploy-flow-local.mjs](deploy-flow-local.mjs)：本机Docker部署，复用已有Pi模型配置。
- [test-flow-live.mjs](test-flow-live.mjs)：真实模型和本地服务基础用例。
- [test-flow-recovery-live.mjs](test-flow-recovery-live.mjs)：专用容器SIGKILL与恢复验证。
- [flow-local-client.mjs](flow-local-client.mjs)：读取本地令牌访问受理、查询、诊断和取消接口。

- [flow-engine-admin.ts](flow-engine-admin.ts)：受信本机inspect/recover/terminate/reconcile维护命令；恢复前停止原宿主。

部署及测试操作见[本地运行说明](../deploy/flow-local/README.md)。

## 设计依据

[对应设计](../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
