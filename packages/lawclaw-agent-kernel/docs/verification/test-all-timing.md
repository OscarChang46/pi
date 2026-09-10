---
doc_id: VER-TIMING-001
level: verification
layer: cross-layer
component: Verification
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: "全量测试执行、耗时统计口径与报告使用说明"
parent: VER-INDEX-001
interfaces: []
diagrams: []
supersedes: []
---

# 全量测试与耗时统计

## 使用方法

在 `packages/lawclaw-agent-kernel` 目录执行：

```bash
npm run test:all
```

该命令递归扫描并一次运行 `test` 目录中的全部 `*.test.ts`，按目录统计 UT、DT、Contract、Integration 和 System 用例。测试保持单并发，便于复现并避免共享资源竞争。它反映物理测试全集，即使正在开发的用例尚未登记稳定验收 ID 也会执行。

## 时间口径

- 墙钟时间：从开始扫描测试文件到测试结果解析完成的端到端单调时钟耗时，包含测试发现、进程启动、用例执行和结果解析，不包含最终报告文件写入。
- 用例累计耗时：Node 测试运行器报告的各用例 `durationMs` 之和。
- 框架及进程开销：墙钟时间减去用例累计耗时；小于零时按零记录。
- 分层统计：每层的用例数、通过数、失败数、累计耗时、平均耗时和最慢用例。
- 最慢用例：全量用例按耗时降序排列的前十项。

报告生成在 `.artifacts/test-all`：

- `timing-report.json`：供 CI、趋势分析或性能基线工具读取的 schema version 1 数据。
- `timing-report.md`：供人工审查的汇总。
- `test-report.json`：每个实际执行用例的名称、文件、层级、结果和耗时。

命令的退出状态与物理全量测试结果一致。测试目录异常、任一用例失败或跳过、执行超时、输出超限或环境缺失都会返回非零状态。`npm test` 仍负责稳定 ID 与验收清单映射门禁；本命令不绕过或替代该治理检查。耗时用于发现慢用例和趋势变化，不应直接替代功能正确性门禁。
