# EXT-FE-001：通用跨 FlowRun 关联（不含 Session sub-session 协调）

- 状态：延期；原 Session Fork/Join 候选设计已被 SessionManager 当前设计取代。
- 所属组件：仅未来“不涉及 Session 树的通用 Flow 关联”才可重新评审是否归 FlowEngine。不是当前实现承诺或交付门槛。
- 启动条件：出现明确的多个独立flowRun并发执行、等待汇合与跨执行恢复场景，并完成范围评审。
- 当前 FE 范围：单 FlowRun 四态、Activity 拦截与回放、内部有向环和恢复。Session 父子血缘及 sub-session Fork/Join/Reduce/唤醒协调归 [SessionManager](../../design/layers/l1-control/components/session-manager/sr-03-subsession-fork-join.md)。
- 不提前建设：协调器、计划存储、占位API、后台恢复循环；不删除已有Agent业务委派。

## 候选材料

| 材料 | 原位置 | 适用状态 |
| --- | --- | --- |
| [候选设计、流程图、数据与测试设计](proposal.md) | SR-FE-SYS-04 | 历史草案；顺序子集，不是完整并行协议 |
| [方案比较、迁移及风险](alternatives.md) | ADR-0012 | 历史备选；未批准、未实现 |

材料中将 Session 相关 Fork/Join 归 FE 的叙述已失效，不得作为开发依据。当前开发粒度契约、Barrier 和测试矩阵只见 SessionManager 设计。

## 未来边界与待决项

如未来出现完全不涉及 Session 与 Parent Summary 的通用 Flow 关联，必须单独立项并证明不会与 SessionManager `JoinBarrier` 形成双重权威。不得用本扩展绕过 `SessionForkJoinPort`。

重新评审时须明确：多激活身份与成员集合、Join条件和结果去重、父取消与子受理竞争、持久化提交边界、等待唤醒丢失与崩溃恢复、循环和容量限制。现有单flowRun测试不能作为该扩展的完成证据。

返回[扩展索引](../README.md)。
