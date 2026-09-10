---
doc_id: L3-CON-001
level: contract
layer: L3 Tool Runtime
component: null
status: candidate
baseline: AKB-2026-09-03-09
authoritative_for: L3-FD-2边界字段与适用约束
parent: L3-DES-001
interfaces: []
diagrams: []
supersedes: []
---

# L3-FD-2：工具功能调用档案

2026-09-09候选。替代旧L3-DD-1的L3内部持久化设计和CD-1工具专用dispatch/receipt用法；CD-1公共标量、Error、Artifact和Security类型继续复用。当前源码接口未迁移。本契约不重新定义Permit/claim，也不要求L3建设数据库。组件正文拥有域间交互标准，本文拥有跨组件交换字段。

## 1. 共同字段

Ref/Digest/Count/Millis/Artifact/Error及SecurityBinding/ExecutionClaim引用CD-1及Security当前契约。所有结构字段必填，只有明确`|null`允许null；未知字段拒绝；Ref非空，Count非负安全整数，时间UTC毫秒。下面结构为可编码规格，L3整体尚未发布Schema；L3→L4公共字段采用BND-L34已基线Schema。参数/Schema内容采用现行有界JSON约定，不能透传any。

```text
ToolDefinition = {
 toolId:Ref, version:Count, displayName:string, descriptionRef:Artifact,
 inputSchemaRef:Artifact, outputSchemaRef:Artifact, tags:string[],
 risk:read|write|restricted, routeRef:Ref, resourceScopeRef:Ref
}
RouteBinding = {
 routeRef:Ref, version:Count, kind:provider|sandbox, adapterBindingRef:Ref,
 resourceScopeRef:Ref, querySupported:boolean, cancelSupported:boolean
}
PublicTool = {
 descriptorRef:Ref, toolId:Ref, version:Count, displayName:string,
 descriptionRef:Artifact, inputSchemaRef:Artifact, outputSchemaRef:Artifact,
 risk:read|write|restricted
}
```

tool/version及route/version≥1；displayName合法Unicode、1—128字符；tags≤32、每项1—64字符且不重复。注册表每Scope≤256版本，单描述/Schema≤64KiB；Snapshot≤1MiB。Schema由受控解析器预验证，不允许远程$ref拉取。descriptorRef是不可变完整定义引用，由注册发布端确认，定义含路由和资源；不能用裸工具名代替。PublicTool不含地址、Secret或内部route，输出Schema是业务结果校验合同。

## 2. L1→L3输入和输出

```text
ToolCallRequest = {
 commandId:Ref, runId:Ref, proposalId:Ref, modelCallId:Ref,
 catalog:CatalogView, descriptorRef:Ref, argumentsRef:Artifact,
 permitRef:Ref, binding:SecurityBinding, claim:ExecutionClaim,
 executorRef:Ref, deadlineAtMs:Millis, limits:ExecutionLimits, target:ToolTargetV1
}
ExecutionLocator = {commandId:Ref, operationKey:Ref, routeRef:Ref}
ToolOutcome = {
 commandId:Ref, proposalId:Ref, modelCallId:Ref,
 status:success|failed|cancelled|unknown, effect:none|applied|unknown,
 resultRef:Artifact|null, error:Error|null, locator:ExecutionLocator|null
}
```

CatalogView由Router组件定义；ExecutionLimits复用L4现有字段（cpuMillis、memoryBytes、pids、diskBytes、outputBytes、network、mountsRef），由L1从可信资源上限准备，不能由模型提供。所有数值上限由装配档案确认，deadline不得晚于Run/Permit允许范围，outputBytes≤256KiB。缺合法资源档案禁止派发。ToolTargetV1由L1在PDP决策前准备，精确字段和摘要由[BND-L34规范](bnd-l34-001.md)§4及Schema拥有；request.proposalId/descriptorRef/argumentsRef必须逐项等于target.proposal，limits等于target.limits，deadline不得晚于target.deadlineAtMs，target.scopeRef等于可信context.scope。Runtime解析的route须等于target.route，resourceProfileRef从target原样写入plan。Guard复核完整目标后，Host安装planDigest对应Admission才派发。

commandId由L1稳定生成，operationKey=commandId，模型call ID用于转录关联，不用于执行去重。effect=unknown强制status=unknown；success必须resultRef非null、error=null；failed/cancelled/unknown必须error非null。前置拒绝locator=null、effect=none；发出后locator必须保留，cancelled须明确未生效和停止证据，否则unknown。结果引用仍需访问权限。

execute返回计算/执行观察结果，不是耐久受理回执。L1在FE Activity可靠性边界内调用，负责保存ToolOutcome后发布事件/转录、处理保存失败与重启；L3不写Run/Session。inspect只返回L4Query；对无locator的前置拒绝不提供外部查询。L3→L4类型唯一见BND-L34-001。公共类型转换必须保留proposalId/modelCallId，不能只保存文本。

## 3. 保证边界与版本

层设计C01—C07为本档案适用前提。原CD-1工具持久记录、STARTED CAS、UNKNOWN核对表是外部可靠性要求的历史候选实现，不再作为L3功能域的内部实现标准；总设计ToolCall独立事实边界、Security消费及UNKNOWN不得重发仍有效。旧持久回执调用方不能直接接入新Promise接口，需要显式L1适配，不提供隐式兼容。

恢复输入身份、接管隔离、事实保存、引用保留由宿主/存储Port提供；没有证明这些依赖就不能把本档案声明为可靠系统。首版不在L3做重试，execute/查询/取消是不同操作，超时不能被异常处理器变成新execute。资源实际限制与JSONL执行端口需L4联调；具体产品和数据库策略不在本设计内。

升级先停止旧调用入口并保留未决事实，装配新Registry及调用适配；旧未决动作只能查询原执行，不作为新输入重发。未知档案版本拒绝，回滚不删除已经发生的效果或重置Permit。本轮只调整设计，不迁移运行数据。
