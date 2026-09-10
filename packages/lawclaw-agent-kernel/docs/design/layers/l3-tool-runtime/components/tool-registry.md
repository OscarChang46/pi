---
doc_id: L3-CMP-004
level: component
layer: L3 Tool Runtime
component: ToolRegistry
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ToolRegistry职责与功能域交互标准
parent: L3-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# ToolRegistry 组件设计

## 1. 职责、范围与外部场景

工具注册表是ToolDefinition及工具可用状态的唯一管理入口。管理员注册/启停/退役，Router读取指定版本。管理实例绑定一个可信Scope，写操作由装配串行化，查询获取完整不可变视图；物理持久化、并发发布和历史保留按层约束C02/C04，不设计存储事务。

## 2. 功能域与交互标准

| 域 | 输入生产者 → 输出消费者 | 操作及承诺 |
|---|---|---|
| RG-01 定义注册与版本 | 管理员RegisterInput → 状态域/目录ToolVersion | register：校验完整定义、唯一版本与可执行绑定后发布；初始disabled |
| RG-02 可用状态管理 | 管理员StateChange与已注册ToolVersion → Router RegistryView | setState：enabled/disabled/retired；退役不可恢复，历史仍可查询 |

组件统一定义：`ToolKey={toolId:Ref,version:Count}`（version≥1）；`ToolVersion={key:ToolKey,descriptorRef:Ref,definition:ToolDefinition}`；`RegisterInput={definition:ToolDefinition}`；`StateChange={key:ToolKey,target:enabled|disabled|retired}`；`Availability={key:ToolKey,state:enabled|disabled|retired}`；`RegistryView={revision:Count,versions:ToolVersion[],availability:Availability[]}`。Ref及ToolDefinition字段唯一绑定L3-CON-001 §1。全部必填，无null；同一view中两数组按key一一对应且键唯一、≤256；revision是适配器返回的视图标识，不作为L3内CAS协议。

RG-01输出由存储Port返回确认的descriptorRef，不伪造已发布引用；RG-02必须先get原key。ToolVersion不可变，可用状态独立变化。注册同key同定义返回原版本且保留当前启停状态；异定义VERSION_CONFLICT；注册错误不改变既有视图。启用不等于运行授权。retired允许历史解析与结果说明但不得新派发，发布新版本不退役旧版。

## 3. 协作顺序与数据规则

注册先检查Schema/描述/路由能力，再交RegistryStore.publish完整ToolVersion。启停读取原版本，套用封闭状态表，调用RegistryStore.setAvailability。查询返回deep-readonly视图，不暴露Map或Provider实例；生命周期由引用持有者管理。

状态迁移：disabled→enabled/retired，enabled→disabled/retired，retired→retired；同状态无操作，retired→enabled/disabled拒绝INVALID_STATE。无需通用状态机引擎；静态转换表穷尽检查所有3×3组合。此表不负责Security授权撤销。

## 4. 组件验收与扩展

注册readFile v1→disabled且目录不可见→启用→出现一次→发布v2不改变v1→停用v1后旧snapshot仍可解释、执行解析拒绝。固定流程由RG-01/02域内测试组合为L3-RG-IT-01，未实现。新增工具只增加定义和受信L4绑定，不修改注册算法；新增可用状态需修改组件状态标准及两个域测试。

可靠性依赖只引用C02/C04；失败返回原Error，不通过重建目录猜测发布成功。实现建议归src/tools的registry模块，不创建独立部署服务。
