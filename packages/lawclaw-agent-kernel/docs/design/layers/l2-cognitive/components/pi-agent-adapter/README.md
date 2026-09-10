---
doc_id: PI-FD-INDEX
level: functional-domain-index
layer: L2 Cognitive Runtime
component: PiAgentAdapter
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: PiAdapter 功能域导航和覆盖状态
parent: L2-CMP-004
interfaces: [AgentAdapterPort]
diagrams: []
supersedes: []
---

# PiAdapter 功能域索引

跨域结构、调用顺序与规则由[组件设计](../pi-agent-adapter.md)拥有，公共输入由CTX-CON-1拥有。这里仅导航；功能域不互相定义协议，不新增组件或服务。

| 域 | 场景 | 内容 | 状态 |
|---|---|---|---|
| [输入准备](functional-domains/input-preparation/README.md) | L2-S01/S02/S03/S06 | 冻结绑定、共享Pi转换、完整载荷及发送前检查 | 候选；依赖公共信封同步B1 |
| [模型流消费](functional-domains/model-stream/README.md) | L2-S01/S04/S06 | Pi单轮调用、事件消费、取消和容量 | 候选；Pi无损证据/原生队列B2/B3阻塞 |
| [完整输出](functional-domains/turn-output/README.md) | L2-S02/S03/S05 | 严格工具参数、终态、usage和交付 | 候选；依赖B1/B2及L1提交接入 |

原组件CD-1第3/4节对应输入准备；第4/5/7节对应流消费；第4/6/8节对应完整输出。原组件继续拥有跨域规则和既有TC编号，各域新增L2-PI测试设计补充具体复用风险，不冒充已实现用例。
