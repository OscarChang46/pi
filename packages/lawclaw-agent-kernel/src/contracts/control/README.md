# 控制层契约

按所属组件分类存放公共状态、输入输出和端口定义：

- [ContextEngine](context-engine/README.md)：上下文来源、选择与候选。
- [FlowEngine](flow-engine/README.md)：系统运行、日志、Activity和任务图。
- [RunRegistry](run-registry/README.md)：业务Run持久化端口。
- [SessionManager](session-manager/README.md)：Session当前Run绑定。

契约不依赖组件实现，也不使一个组件拥有其他组件的权威状态。
