# 组件详细设计与五角色评审

状态：五个独立subagent完成初审与修订复核，23项Kernel内部设计达到待开发状态；当前未关闭P0/P1/P2均为0。日期：2026-09-07。

37来自38个组件文档扣除已有FlowEngine，并非37个独立模块。本轮按必要性收敛为16个独立设计单元、3个随所属组件交付的内部职责、4个契约门面。运维、基础设施、L4具体执行器共14项不属于本轮详细设计，仅在对应目录保留Kernel调用所需保证。

## 阅读入口

- [必要性与范围](scope.md)：逐项分类和组件文档入口。
- [CD-1契约](../../contracts/component-development-contracts-v1.md)：字段、操作、权限、事务、恢复和配置；R1明确关键协作的唯一行为。
- [SFMEA与验收矩阵](acceptance-matrix.md)：16项跨组件风险和16项故障验收规格。
- [基础设施依赖](../../layers/infrastructure-plane/kernel-dependencies.md)、[运维依赖](../../layers/operations-plane/kernel-dependencies.md)、[L4依赖](../../layers/l4-execution-runtime/kernel-dependencies.md)：消费方要求，不展开外部实现。

## 五角色问题闭环

报告保留初审及复核过程，以每份报告末尾最终结论为当前状态。初审共16项P1、7项P2；安全复核新增续期P1、数据复核新增旧签名P2也已关闭，没有P0。

| 角色 | 关闭的问题 | 最终状态与记录 |
|---|---|---|
| 架构 | AR-01～06：模型命令身份、Parent终态与清理、非工具授权、资源即时获取、Child预算、上层职责文字 | 6项关闭，[架构报告](architecture-review.md) |
| 安全 | SEC-R1～R4及R2a：动作绑定、当前授权与同epoch续期、Permit版本、执行者绑定 | 全部关闭，[安全报告](security-review.md) |
| 数据 | DATA-01～06及DATA-R1-01：Child受理、预算预留、上下文冻结、Pin事务、Session转录、耐久依赖与签名 | 全部关闭，[数据报告](data-review.md) |
| 测试 | 扫描覆盖速率、SFMEA依据、UNKNOWN精确预期、固定Faux性能负载 | 4项关闭，[测试报告](test-review.md) |
| 运维 | OPS-R1～R3：信号与快照一致性、审计耐久回执、受控诊断与证据分类 | 3项关闭，[运维报告](operations-review.md) |

## 就绪含义与验证边界

本次完成职责、契约、状态迁移、CAS/幂等/恢复、安全失败关闭、容量和可执行验收条件，开发者无需自行选择上述关键行为。五角色结论是候选设计内容就绪，不代表总体架构所有者批准、代码实现或外部依赖已满足；ACR-2026-0011仅记为REVIEWED，现有活动基线不变。

文档专项检查通过：Markdown结构、表格、本地文件链接、23个契约锚点及9个合成PDP向量摘要，结果见[检查记录](document-checks.json)。`git diff --check`通过。9个向量仅验证设计数据，16项验收尚未实现或运行，未执行容量或故障恢复测试。

全库`check-document-architecture.sh`仍失败：既有`contracts/README.md`缺少YAML front matter；已核对HEAD中同样缺失。本次没有将专项检查表述为全库门禁通过，也没有修改现有FlowEngine、Draw.io或运行代码。
