# ContextEngine 契约

[CTX-CON-1](../../../../docs/design/contracts/context-assembly-contract.md)定义输入、来源身份、跨域数据及候选字段；此目录是对应源码定义。

- `assembly-basis.ts`：冻结来源、独立Child应有清单及容量限制。
- `assembly-messages.ts`、`source-reader.ts`：规范消息、依赖及受限异步读能力。
- `assembly-algorithm.ts`：同步纯选择及估算端口。
- `assembly-candidate.ts`：六字段载荷、Trace及粗估计量。
- `context-error.ts`：明确失败，禁止补空成功。
- `context-schema.ts`、`candidate-codec.ts`：来源与候选共用的封闭Schema、完整Artifact编解码及引用验证；恢复不重新选择。

`assembly-contract.ts`仅显式导出类型。作用域能力不由JSON自签，候选不包含可执行函数或持久化回执。
