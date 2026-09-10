---
doc_id: L3-CMP-002
level: component
layer: L3 Tool Runtime
component: ToolCallRuntime
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: ToolCallRuntime职责与功能域交互标准
parent: L3-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# ToolCallRuntime 组件设计

## 1. 职责与使用前提

接受L1已准备身份与授权的工具请求，组织参数校验、路由、安全Guard及一次L4调用，输出规范ToolOutcome。每个实例只处理一次调用，宿主并行调用创建独立实例；不支持execute重入。cancel只通过实例AbortSignal交错，查询以原ExecutionLocator无状态代理。ToolCall是逻辑调用事实，持久保存与接管由层约束C01/C04/C06保证，不在本组件实现CAS、outbox或恢复账本。

## 2. 功能域与唯一交互标准

| 域 | 输入生产者 → 输出消费者 | 操作 |
|---|---|---|
| RT-01 调用准备与派发 | L1 ToolCallRequest → RT-02 InvocationCompletion | execute：固定路由、校验参数、Guard、单次调用；前置失败直接产生未派发结论 |
| RT-02 结果与取消处理 | RT-01 InvocationCompletion → L1 ToolOutcome | finish：核对身份/输出/效果；cancel传播信号；inspect代理原操作 |

ToolCallRequest、ExecutionPlan、ExecutionLocator、ToolOutcome和L4Reply绑定L3-CON-001及BND-L34-001。内部交换唯一标准：

```text
InvocationCompletion =
 {kind:rejected, request:ToolCallRequest, error:Error}
 | {kind:observed, request:ToolCallRequest, locator:ExecutionLocator,
    reply:L4Reply}
 | {kind:disconnected, request:ToolCallRequest, locator:ExecutionLocator,
    error:Error}
```

全部字段必填，无null；前置拒绝无locator，派发前必须形成locator并由调用方可靠性边界留存。RT-01不直接向业务返回Provider对象。RT-02只能处理同request.commandId的回执；结果不匹配或通道断开输出unknown，不能误报none。观察到的业务失败可有applied效果。

## 3. 跨域顺序和错误

实例NEW→PREPARING→IN_FLIGHT→FINISHED仅为内存控制流程，不是耐久状态机。execute先置PREPARING，检查C01输入资格，CR-02解析及完整参数Schema，Guard调用；按request.target构建plan，resourceProfileRef原样传递，只有deadline可缩短。Host按BND-L34受信Port安装并确认Admission后才派发；安装失败为前置拒绝。取消/截止发生在invoke之前则拒绝且effect=none。无await的最后本地检查后进入IN_FLIGHT并调用选定L4一次。L4返回、抛错或超时统一交RT-02；finally释放信号订阅和参数缓冲。重复execute返回INVALID_STATE，不能当作安全的跨实例去重。

IN_FLIGHT取消只发停止请求；真实结果先到就返回真实结果，取消不能改写applied。截止先到输出unknown，晚到结果交L1提供的lateFactSink（ToolOutcome→Promise<void>），宿主负责可靠接收与诊断；L3不维护重投队列。结果回调只能完成一次主Promise；迟到通道不是第二次主返回。

## 4. 外部调用与验收

对L1提供execute(context,request,signal)→Promise<ToolOutcome>；context由装配注入可信Scope、Clock、lateFactSink及执行资格Port，不接受模型JSON伪造。inspect(context,locator,queryContext)→Promise<L4Query>只查询，不推动Run；cancel(context,locator,queryContext)→Promise<L4Cancel>只传递停止请求。queryContext.deadlineAtMs为独立UTC毫秒截止，范围(now,now+2000ms]，过期不发送；不使用原execute的过期deadline。具体字段在边界契约，组件不发布accepted=durable语义。

组合L3-RT-IT-01：readFile固定参数→Guard通过→Provider一次→结果有界且command/proposal/modelCall标识完整；参数错误Guard/L4均0。L3-RT-IT-02：写入成功丢回执→unknown，L3重试0，L1保存并停止自动重发；此为替身集成设计，真实进程恢复另验C01/C06。

新增远程工具仅配置L4绑定；内部executor表按provider/sandbox穷尽，不按toolId做分派。首版同步有界调用；长任务不在L3建立轮询器，L4可返回unknown并给出locator供上层查询。状态恢复与物理存储不是RT功能域。

<a id="l3-dd-1-执行协调详细设计"></a>
旧L3-DD-1持久化算法撤出当前开发正文；逻辑事实与不得重发UNKNOWN保留为层约束。
