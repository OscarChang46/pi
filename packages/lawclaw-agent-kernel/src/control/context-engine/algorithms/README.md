# 组装选择策略

`causal-budget/v1`按必选闭包、近期历史、Memory及资料排序选择；`pi-recent-history/v1`通过注入端口取得Pi后缀建议，再补齐依赖。备选必须显式指定，错误不自动切换。

共享规则在`selection-policy.ts`，算法只返回单元引用和决策，不读取来源或替换正文。Token是Pi粗估软目标，必选超目标保留并标记；结构与字节限制仍为硬约束。完整协议见[CTX-CON-1](../../../../docs/design/contracts/context-assembly-contract.md)。
