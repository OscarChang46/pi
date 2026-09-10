# Pi 上下文适配

`PiContextAdapter`实现完整载荷到Pi Context的纯映射、Pi字符粗估及近期历史截断建议，复用真实`convertToLlm`、`estimateTokens`与`findCutPoint`。此处不调用模型、不创建Pi Session、不压缩或持久化上下文。

映射字段和版本以[CTX-CON-1](../../../../docs/design/contracts/context-assembly-contract.md)为准，Trace不进入模型。核心仅通过端口使用此能力，目录边界由AK-CTX-301验证。
