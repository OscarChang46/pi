# 工程检查与启动脚本

## 职责

提供类型外的架构、注释、文档和 CLI 检查，以及图形生成工具。

## 边界与非职责

只读检查不批准候选设计；render/prepare 脚本会生成文件，不能当成只读检查运行。

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
- [check-source-boundaries.mjs](check-source-boundaries.mjs)
- [diagram-runtime.sh](diagram-runtime.sh)
- [pi-cli-smoke.mjs](pi-cli-smoke.mjs)
- [prepare-drawio-plantuml.sh](prepare-drawio-plantuml.sh)
- [render-diagrams.sh](render-diagrams.sh)
- [run-pi-cli.sh](run-pi-cli.sh)
- [verify-milestone-one.sh](verify-milestone-one.sh)
- [verify-rendered-svg.sh](verify-rendered-svg.sh)

## 设计依据

[对应设计](../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
