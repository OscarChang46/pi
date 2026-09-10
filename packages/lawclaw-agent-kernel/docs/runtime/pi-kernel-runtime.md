# Pi Kernel 运行说明

2026-09-08核对。runtime只保存运行入口、配置和实际装配说明；组件职责、算法和候选方案从[总设计](../design/agent-kernel-design.md)进入所属层，不在本目录维护第二份设计。

## 选择运行入口

| 使用场景 | 入口 | 状态边界 |
|---|---|---|
| 单次本地Kernel任务 | 包目录执行`npm start` | 使用[进程内组合根](../../src/application/composition-root.ts)，任务完成后输出结果；Run注册目录为内存实现 |
| Pi开发CLI | 包目录执行`npm run pi` | 使用[Pi启动脚本](../../scripts/run-pi-cli.sh)，不是持久Flow服务入口 |
| 本地持久Flow服务 | 按[Flow部署运行说明](../../deploy/flow-local/README.md)启动及维护 | 使用[Flow组合根](../../src/application/flow-composition.ts)，已有SQLite业务存储及独立系统Journal |

两条Kernel装配路径的具体差异见[当前装配映射](framework-boundaries.md)。本地服务已存在不等于候选Gateway、Session、Memory、权限及子任务协议全部完成；实际测试范围以对应验证记录为准。

## 配置

默认配置为[agent-kernel.yaml](../../config/agent-kernel.yaml)，提示词为[prompts.zh-CN.yaml](../../config/prompts.zh-CN.yaml)。运行配置由[配置模块](../../src/config/runtime-settings.ts)加载，模型适配由组合根注入。Flow服务的模型、数据目录、认证和维护参数沿用部署说明，不复制另一套易漂移的命令。

运行真实模型可能产生外部调用；本文档清理没有启动服务、模型、工具或修改运行数据。

## 检查与证据

命令定义唯一来源为[package.json](../../package.json)。`npm run typecheck`检查类型，`npm run check:boundaries`检查源码边界，`npm run check:docs`检查工程文档；测试选择与报告从[Verification](../verification/README.md)进入。文档结构检查成功不表示上下层语义评审或运行验收通过。

2026-09-06/07的10份旧草稿及两份旧运行说明已移至[历史归档](../governance/archive/runtime-before-cleanup-2026-09-08/README.md)。归档保留独有场景和未决提案，旧组件名称、旧调用链及当时的实现判断不再指导当前开发。
