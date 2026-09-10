# ACR-2026-0019：L2 Pi 核心能力封装细化

状态：IMPACT_ANALYZED / candidate。日期：2026-09-09。用户授权架构细化；本轮仅文档和图形，不代表实现或发布批准。

问题：现有L2设计只有较粗的Adapter职责，未明确实际Pi复用入口；原生agentLoop会执行工具，Pi参数修补和无界EventStream队列又不满足既有严格完整性/容量承诺。

候选选择：首版封装Pi streamSimple，复用Models/ModelRuntime、Provider协议和共享PiContextAdapter；不重写Provider解析、不直接托管原生工具循环。Runtime负责单命令结果，Parser校验规范事件，Adapter内部按输入准备/模型流消费/完整输出细化。保持L1工具权限和生命周期权威。

影响：细化L2层、Runtime和PiAdapter正文，澄清Boundary零重试，新增三个功能域和受治理索引，同步L2组件图。未更改层/组件ID、公共代码、数据库、手工Draw.io及既有未提交实现。

输入基准：分支`codex/arch-agent-system-v3`，HEAD `51b5a71f306ba59f65d890da45a822c5385b8831`，加本轮开始时已有脏工作树。源码依据不等于该HEAD提交版本；见评审的输入文件指纹。

开放项：B1公共执行信封与CTX四字段组合；B2无损工具参数证据；B3 Pi生产端有界队列；B4已有PiAdapter输入/缓存与Context候选不一致。不得将这些未闭合项转成实现默认值。

入口：[L2层设计](../../design/layers/l2-cognitive/README.md)。评审与验证：[L2 Pi封装评审](../reviews/l2-pi-wrapper-design-review.md)。无运行测试、无提交推送、无依赖安装。
