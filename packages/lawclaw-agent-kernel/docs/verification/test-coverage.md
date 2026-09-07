# 测试覆盖率统计

## 统计范围

覆盖率工程复用当前验收清单，只运行已登记的 UT、DT、Contract、Integration 和 System 测试。统计范围由 `coverage.config.json` 声明，默认包含 `src/**/*.ts`，未被任何用例加载的源文件也按零覆盖计入。生成以下结果：

- 终端汇总：行、分支、函数和语句覆盖率。
- `coverage-summary.json`：供 CI 或其他工具读取的机器可读汇总。
- `lcov.info`：供覆盖率平台导入。
- `index.html`：可逐文件查看未覆盖行和分支的 HTML 报告。
- `gate-report.json`：供 CI/CD 判断测试结果和覆盖率门槛的稳定协议。

默认报告目录为 `.artifacts/coverage`，该目录不纳入版本控制。

## 使用方法

在 `packages/lawclaw-agent-kernel` 目录执行：

```bash
npm run test:coverage
```

本地报告模式只要求测试成功，不因门槛不足退出失败。PR 流水线使用门禁模式：

```bash
npm run test:coverage:gate
```

门禁读取 `coverage.config.json` 中的 `gate.lines` 和 `gate.branches`。初始门槛按当前实测结果下取整为行 69%、分支 81%，用于阻止基线回退；提高门槛需要结合新增用例和当前报告评审。任一测试失败或任一覆盖率指标不足时，命令返回非零状态。

覆盖率工具自身的配置与门禁规则测试：

```bash
npm run test:coverage:tooling
```

## 组件边界

| 组件 | 当前实现 | 职责 | 扩展约点 |
|---|---|---|---|
| CoverageConfig | `coverage.config.json`、`coverage-config.mjs` | 严格校验源码范围、报告器、输出目录和门槛 | 增加新的版本化字段；未知字段默认拒绝 |
| TestScopeResolver | `coverage.mjs` 调用现有验收清单 | 将已登记用例解析为确定的测试文件集合 | 后续可增加变更文件到用例的映射，不改变门禁协议 |
| CoverageExecutor | `coverage.mjs` | 在隔离环境运行覆盖率引擎并生成标准报告 | 可替换引擎或增加报告器，调用方命令不变 |
| GateEvaluator | `coverage-gate.mjs` | 将测试退出状态、实测指标和门槛计算为门禁结论 | 可增加分包、增量覆盖率或例外策略 |
| CI Adapter | 流水线配置，当前未创建 | 调用 `test:coverage:gate`，发布报告并使用退出码阻断 PR | 适配 GitHub Actions、GitLab CI 或 Jenkins |

配置、执行器与门禁评估分离。流水线不解析终端文本，只依赖进程退出码和版本化的 `gate-report.json`。

## 门禁数据契约

`gate-report.json` 当前为 schema version 1，包含：

- `mode`：`report` 或 `gate`。
- `success`：测试执行和当前模式门槛的联合结论。
- `execution`：覆盖率命令的状态和退出码，包含测试执行及报告生成结果。
- `thresholdsPassed`：行、分支门槛是否全部通过。
- `metrics`：行和分支的总数、覆盖数及百分比。
- `checks`：每项指标的实测值、最低值和结论。

新增字段可以保持同一 schema 版本；删除字段、改变语义或类型必须提升 `schemaVersion`。CI 应先检查版本，再读取 `success`。

## PR 主流程与失败流程

1. CI 安装锁定依赖，调用 `npm run test:coverage:gate`。
2. TestScopeResolver 校验验收清单并解析测试集合；映射失效时失败关闭。
3. CoverageExecutor 在隔离环境运行全部登记用例，生成源码级报告。
4. GateEvaluator 同时检查测试退出状态、行覆盖率和分支覆盖率。
5. 通过时 CI 上传 HTML、JSON 和 LCOV；失败时上传已经生成的诊断产物并阻断 PR。

配置格式错误、报告目录越界、报告目录经过符号链接、测试失败、三分钟总执行超时、输出超限、汇总缺失或门槛不足均返回非零状态。覆盖率反映代码执行情况，不能替代验收清单中的需求、风险和有效断言检查。

## 后续扩展实例

增加“改动代码覆盖率”时，在 GateEvaluator 前新增一个读取基础分支和 PR diff 的 `DiffCoverageCalculator`，把结果作为 `metrics.changedLines` 写入下一版配置和门禁报告。TestScopeResolver、CoverageExecutor、本地报告命令及现有全量行/分支指标保持不变。该能力依赖 CI 提供完整基础分支，不在当前实现范围内。
