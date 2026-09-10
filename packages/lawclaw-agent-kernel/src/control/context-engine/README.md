# ContextEngine 实现

依据[组件设计](../../../docs/design/layers/l1-control/components/context-engine.md)，流程为输入校验、串行读取、结构整理、纯算法选择、公共复核及候选封装。

公开装配入口是`createContextAssembler`，调用`assemble(basis, signal)`返回Promise。同实例禁止并发/重入，取消后必须等原读取退出；没有Session写入、回执、内部重试或跨请求缓存。

资料和单Memory视图有具体reader；Session/Run的权威历史投影由宿主注入。FlowContext和RunFlow按每轮冻结来源创建独占ContextEngine，再统一调用两参数assemble；这不等同于SessionManager的权威查询、延迟创建、候选采纳或进程接管已经完成。
