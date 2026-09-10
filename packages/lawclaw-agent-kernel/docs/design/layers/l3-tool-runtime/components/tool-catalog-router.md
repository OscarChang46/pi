---
doc_id: L3-CMP-001
level: component
layer: L3 Tool Runtime
component: ToolCatalogRouter
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ToolCatalogRouter职责与功能域交互标准
parent: L3-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# ToolCatalogRouter 组件设计

## 1. 职责与约束

从Registry完整视图生成模型可见目录，并把指定描述解析为固定执行路线。本组件不注册工具、不拥有可用状态、不做权限裁决。请求级只读工作集，可并行但不共享可变缓存；调用方保留snapshot及引用寿命，适用层约束C02/C04/C07。

## 2. 功能域与交互标准

| 域 | 输入 → 输出 | 调用方与顺序 |
|---|---|---|
| CR-01 可见目录投影 | CatalogRequest → CatalogView | L1提供可信scope和筛选条件；读取RegistryView后返回完整投影 |
| CR-02 固定路由解析 | ResolveRequest → ResolvedTool | Runtime提供原CatalogView及descriptorRef；只选准确版本并复核当前启停 |

`CatalogRequest={scopeRef:Ref,allowedResources:Ref[],requiredTags:string[]}`；两数组去重，分别≤256和≤32，空requiredTags不额外筛选，空allowedResources无工具。`CatalogView={catalogRef:Ref,registryRevision:Count,scopeRef:Ref,items:PublicTool[]}`；PublicTool绑定L3-CON-001 §1，items按toolId再version升序、≤256且UTF-8序列化≤1MiB。

`ResolveRequest={catalog:CatalogView,descriptorRef:Ref}`；`ResolvedTool={catalogRef:Ref,tool:ToolVersion,route:RouteBinding}`，ToolVersion来自Registry标准，RouteBinding绑定L3-CON-001。全部非空、必填；只有目录中准确descriptorRef可解析。公开CatalogView不携带内部route；返回ResolvedTool时从Registry/Route Port读固定版本，不能从模型填入的地址取值。catalogRef由宿主SnapshotPort发布确认；发布前只是私有候选，不可交L1作为可恢复引用。

## 3. 跨域与跨组件规则

CR-01读取一个RegistryView，过滤enabled及资源/标签满足的条目，白名单投影后一次发布。CR-02先验证scope/catalog完整性及成员，再读原ToolVersion和当前Availability，非enabled返回ROUTE_UNAVAILABLE；绑定缺失拒绝，不回退latest。声明停用后不得新解析；解析后至Guard之间停用不承诺瞬间撤回，安全阻断由C03执行资格检查保证。

工具同名多版本必须以descriptorRef区分，PublicTool公开id/version；若L2协议只能按名称调用，L1适配必须建立冻结别名映射，不能丢版本让L3猜。Schema和描述是数据，不得被当作新增授权。

## 4. 验收和扩展

组件组合例L3-CR-IT-01：read v1和write v1启用、Scope只含read资源，投影只有read；新建read v2不改变旧catalog；原read v1禁用后解析原目录拒绝，L4调用0。新增标签过滤规则先更新CatalogRequest与组件筛选顺序，再改投影域；新增Provider无需修改目录过滤。持久快照/GC为C04依赖，本文不定义pin表或恢复扫描。

<a id="l3-dd-1-内部结构与算法"></a>
旧L3-DD-1正文已由本版取代；原注册职责迁至ToolRegistry，目录与路由功能保留。
