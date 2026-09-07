# 分层自动化测试

## 职责

使用现有 node:test 与 tsx，验证当前能力及验收门禁。UT 验证规则；DT 验证单组件协作；Contract 验证当前 Port/Adapter；Integration 验证多组件；System 验证当前公开入口。所有层级自动执行。

## 边界与非职责

不调用付费模型或真实外部业务服务。

## 接口、依赖与生命周期

从本包运行 `npm test` 执行全部当前用例，`npm run verify` 额外执行类型、源码边界、注释和文档检查。

可分别执行 `npm run test:ut`、`test:dt`、`test:contract`、`test:integration`、`test:system`。`npm run test:list` 列出用例，`npm test -- --id AK-TOOL-006` 精确复现。

报告默认在 `.artifacts/verification/report.json` 和 `report.md`，通过 `--report-dir` 指定独立目录。筛选运行不证明全系统通过。直接调用 Node 测试不包含映射门禁和环境隔离。

## 文件与子目录

- [UT](ut/README.md)：规则、边界与状态决策。
- [DT](dt/README.md)：真实组件与受控依赖。
- [Contract](contract/README.md)：当前接口符合性。
- [Integration](integration/README.md)：真实内核协作。
- [System](system/README.md)：Faux 纵切与内部扩展启动。
- [Support](support/README.md)：时钟、屏障、脚本模型、临时目录和断言。

## 登记与扩展

顶层使用具名 `test` 和静态名称 `test("[AK-AREA-001] 中文验收行为", ...)`，在 [acceptance.json](../docs/verification/acceptance.json) 登记要求、风险、层级和文件。用例 ID 保持稳定；使用表驱动断言覆盖数据组合，不动态或嵌套注册，不使用 only 或占位 skip。

使用 TestClock 推进授权有效期、deferred 控制取消位置。实际 AbortSignal.timeout 用测试级 mock 返回受控信号；推进 TestClock 不等于推进系统定时器。临时目录创建后立即登记 context.after，清理不能依赖断言成功。

当前 Grant 无一次性消费，只读 Sandbox 无 OS 隔离，Fake 委派不证明调度与恢复，内部扩展冒烟不证明第三方 Package 安全。完整说明见 [验证框架](../docs/verification/framework.md)。

## 设计依据

[对应设计](../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
