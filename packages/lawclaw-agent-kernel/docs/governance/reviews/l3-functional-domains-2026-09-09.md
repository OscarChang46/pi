# L3组件与功能域详细设计复核（2026-09-09）

关联ACR-2026-0015本次修订；用户明确要求“持久化和一致性作为约束，按组件再划分功能域”。这项授权覆盖本轮设计简化，不代表删除安全检查、授权代码修改或取消ToolCall逻辑事实边界。当前HEAD为51b5a71f306ba59f65d890da45a822c5385b8831，分支codex/arch-agent-system-v3；工作区有大量其他未提交修改，本轮不重置或提交。

## 1. 设计与迁移映射

当前规范入口：[L3层](../../design/layers/l3-tool-runtime/README.md)。原5份正文已逐字保存在[非规范历史快照](../archive/l3-before-functional-domains-2026-09-09/README.md)，新组件正文替换旧正文，不把新方案附加在仍有效的CAS/outbox算法后面。

| 原设计 | 当前归属 | 处理 |
|---|---|---|
| Catalog publish、版本校验 | ToolRegistry RG-01 | 明确注册表；新增输出Schema、完整定义与不可变版本 |
| 原目录启停未完整定义 | ToolRegistry RG-02 | disabled/enabled/retired，退役不可复活，历史仍可解释 |
| Catalog可见性及resolve | ToolCatalogRouter CR-01/02 | 保留独立功能；域间字段由组件统一 |
| ToolCall accept/start/result生命周期 | ToolCallRuntime RT-01/02 | 一次调用控制流程和规范结果；耐久受理/启动去重改为C01/C04外部条件 |
| Guard消费、启动检查 | ToolExecutionGuard GD-01 | 保留实际执行检查，不复制Security消费账本 |
| CAS、outbox、pin表、reconciliation表、重启扫描 | 层约束C01—C07及依赖所有者 | 不再是L3功能域或本轮实现任务；未知不得重发仍有效 |
| 旧18例和新增10例可靠性用例 | 历史快照、本轮域用例及外部约束验收 | 不继承旧“已覆盖”计数；安全/业务规则在域内重写，持久化/接管由依赖方验证 |

功能域目录为`components/<component>/functional-domains/<domain>/sr-NN-*.md`。四个索引导航，七个域只向上引用组件标准，组件不反向依赖域；manifest登记为functional-domain，不把它们计算成新增C4组件。

## 2. 上下层语义与契约传播

| 来源及约束（当前候选，除注明用户决定外） | 本次行为落点 | 结论/处理 |
|---|---|---|
| 用户本轮决定：可靠性写为约束 | L3层§4；各组件使用前提，域内无耐久状态机 | 一致，已落实设计深度调整 |
| 总设计UP-TOOL-001/§10/14：L1→L3→L4及最终Guard | 层图、RT-01、GD-01及BND-L13/34 | 一致，不开放L2直接工具入口 |
| 总设计§5/13：ToolCall独立生命周期/事实和不重放UNKNOWN | 层§1/4、Runtime职责、ToolOutcome | 一致（逻辑边界）；具体耐久实现移作外部依赖，不声称存储已实现 |
| Security consume/authorizeStart和安全审计语义 | GD-01调用公共安全Port，不缓存、不自签 | 一致；执行资格/epoch桥接为C01/C03集成依赖，证据不足以宣称接通 |
| FE公共Activity执行与恢复 | L3-FD-2由L1适配保存结果/处理unknown；L3不建恢复器 | 一致；不把Session Fork/Join职责移入L3或FE |
| 工具注册与目录权威 | 新ToolRegistry拥有定义/启停，Router只投影/解析 | 上层未定义注册表细节，本次根据用户明确要求补齐，不新增部署服务 |
| 原CD-1的dispatch→耐久ExecutionReceipt | L3-FD-2 execute→ToolOutcome，L1保存后发布 | 旧档案不适用；当前契约显式替代，不能直接复用旧调用方 |
| L4旧ExecutionPlan字段不足/存在另一同名版本 | BND-L34统一plan/reply/query/cancel；L4依赖标注旧类型不适用 | 语义传播已更新；JSONL线协议与受信装配仍待L4联调 |
| 输入与输出Schema | RG-01注册同时验证；CR-01公开描述；RT-01参数校验、RT-02结果校验 | 一致，补齐此前仅输入Schema的缺口 |

具体调用走读：管理员注册read v1（disabled）→启用→CR-01产生catalogRef→L1保存目录及模型call关联、准备授权/资源→RT-01准确路由与参数→GD-01确认许可→L4一次执行→RT-02返回ToolOutcome→L1保存后采纳。任一前置失败L4=0；已发出丢回执输出unknown，不制造未执行证据。新增Provider只改变注册定义与L4绑定，不修改Runtime中央派发。

输入传播未闭合项：当前L1旧DispatchTool调用方须显式填充ToolCallRequest的catalog/proposalId/modelCallId/limits/当前执行资格并消费ToolOutcome；Security现有Binding与新ToolDefinition双Schema字段的摘要映射需联合确认。不能丢弃新增字段继续沿用旧裸工具名引用，也不能由开发者以默认claim补齐。此为集成设计门槛，不影响本次功能域规格的候选交付。

## 3. 五视角与验收边界

架构：四组件七域，组件统一交互，单一Guard域避免按类名拆分。安全：Scope/引用/真实参数/许可检查保留，失效关闭。数据：域内工作集字段、null、基数和销毁均明确；持久化未在本轮实现。测试：每域场景分支映射UT/DT/Contract/Integration，方法与夹具使用替身，状态均未实现未运行。运维：限额与取消归一化明确，失联接管/结果保存为C01—C07保证方验收。

不宣称线程安全、物理恰好一次、持久结果保证或生产可用。JSONL传输帧、完整可编译Schema及上述L1/Security适配仍是正式开发接入前的联合工作。本轮未修改源码、配置、数据库或运行测试。

## 4. 验证记录

- 全量`check-document-architecture.sh`通过：7层、35组件、129份受治理文档；七功能域未当作独立C4组件。`git diff --check`通过。
- 本轮19份层/组件/域/接口文档本地链接与引用方向检查通过：域仅向上引用所属组件，组件不反向引用域；图中14段PlantUML使用1.2026.7渲染成功并逐张查看完整PNG。更新层图同样渲染并查看后生成SVG；共检查15张图，无裁切或标签重叠。
- 输入与本轮主体文档摘要保存在[l3-functional-domains-inputs-2026-09-09.json](l3-functional-domains-inputs-2026-09-09.json)，评审只绑定这些版本；后续相关文档变动需重新核对。
- 上下层职责及输入/输出传播走读范围见§2；外部前提尚无运行证据，未宣称集成就绪。未修改运行代码、未执行UT/DT/Integration或build/check代码任务，未提交推送。
