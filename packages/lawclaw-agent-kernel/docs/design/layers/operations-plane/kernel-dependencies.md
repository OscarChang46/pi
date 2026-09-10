# Kernel对本目录的依赖要求

## R1补充：可写信号、审计回执与诊断

Kernel写入接口为`emit(TelemetrySignal)->{accepted:Bool}`，TelemetrySignal封闭联合：

| kind | 完整字段 |
|---|---|
| operation | {component:ComponentCode,phase:PhaseCode,result:ResultCode,code:ErrorCode\|null,durationMs:Count,count:Count} |
| gauge | {component:ComponentCode,name:queue_depth\|active_runs\|resource_used\|durable_bytes\|scan_lag_ms\|open_incidents,value:Count,limit:Count\|null,sampledAtMs:Millis,dimension:scheduler\|runtime\|scope\|store\|tool\|kernel} |
| counter | {component:ComponentCode,name:conflict\|commit\|telemetry_drop\|permission_bypass\|effect_unknown,delta:Count,sampledAtMs:Millis} |

结构为`{kind,payload:对应类型}`；name/dimension均封闭，runId/toolName/任意标签禁止。queue_depth与resource_used必须limit>0；scan_lag_ms limit=5000；open_incidents limit=null；durable_bytes limit由启动容量档案提供。Scheduler每轮扫描和队列变动发gauge，RunRegistry每提交/冲突/incident发counter及gauge，PEP旁路拒绝发counter。采样至少每秒一次，通知失败仅drop，安全阻断另走审计。

告警消费方可据queue value/limit计算>80%、据scan_lag_ms比较5000，并据commit/conflict计数计算5分钟比率；不需要解析普通日志或新增动态标签。MetricPoint为输入的快照映射：gauge保留payload全部字段（含limit/sampledAtMs/dimension），counter将delta按component/name累加为value并保留最近sampledAtMs；operation不进入counters/gauges。operation旧TelemetryRecord仅是operation.payload别名。Exporter实现不在本轮。

emit队列满时，telemetry_drop旁路递增本地有界饱和计数，由snapshot直接读取，不再向同一满队列emit。scan_lag_ms由独立于扫描完成的每秒采样计算为当前时间减最近一次完整扫描完成时间；尚未完成扫描则从启动时间计算，扫描停滞期间仍持续增长。

安全依赖增加`queryReceipt({auditEventId:Ref})->{kind:found,receipt:AuditReceipt}|{kind:absent}|{kind:unknown}|{kind:gone}`。append同ID同内容返回相同receipt，同ID异内容冲突。Kernel审计outbox不是成功门槛；必须取得Journal的AuditReceipt，或同本地事务已写Journal的等价确认，才能开放依赖动作。append丢响应只能查/重投同事件，不能推断已审计。日志/Exporter健康不能代替此回执。

诊断Artifact要求固定`DiagnosticBundle={schemaVersion:1,configVersion:Ref,contractVersion:Ref,capturedAtMs:Millis,healthCodes:HealthCode[],records:DiagnosticRecord[]}`，`DiagnosticRecord={component:ComponentCode,commandRef:Ref|null,phase:PhaseCode,errorCode:ErrorCode|null,evidence:available|gone|unavailable|unknown,receiptRef:Ref|null,incidentRef:Ref|null}`。available必须有可查询受控收据；gone表示超过保留期；unavailable表示依赖失败；unknown表示缺少可证实事实。最多256条且1MiB，按Scope过滤，相关Ref仅受控诊断，不进入公开health/metrics。不得附正文、参数、digest、Permit或物理路径；无证据不能标available或完成。具体诊断平台、Artifact存储和通知渠道不在本轮设计。

本轮范围说明：这是Kernel内部详细设计所需的输入输出与保证，不是本目录组件详细设计、外部产品选型或实现任务。既有概要保留；外部所有者实现前须提供满足这些契约的Adapter。Kernel测试用Faux依赖验证正确使用边界，不用替身证明外部服务已实现。

所有调用传播可信Scope、稳定commandId与Deadline；依赖不可验证时Kernel停止新受保护动作。下面是调用方需求规格，版本CD-1，未发布为公共Schema。

## 调用方必需保证

普通遥测emit非阻塞、可见丢弃、有界；安全审计append耐久、按ID幂等，失败阻止新受保护动作。Kernel输出白名单phase/result/code/计数/耗时和受控相关Ref，禁止正文/参数/digest/Secret/Permit。Kernel需要读取审计耐久回执和只读健康，不依赖外部Exporter可用性。

普通内存遥测请求上限1024条/1MiB/60秒，诊断7天，安全事实至少终态后30天且open incident延长；具体Exporter、告警路由、日志轮转与存储实现不在本轮。运维角色本轮评审Kernel是否产出必要信号与正确处理审计失败，不评外部平台建设。

<a id="telemetry-pipeline"></a>

### OPS-CMP-001 telemetry-pipeline

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：TelemetryRecord={component:ComponentCode,phase:PhaseCode,result:ResultCode,code:ErrorCode|null,durationMs:Count,count:Count}; PipelineState=running|degraded|draining|stopped。

操作：emit(TelemetrySignal)->{accepted:Bool}; snapshot()->MetricSnapshot; drain({deadlineAtMs:Millis})->{dropped:Count}；emit同步非阻塞，Exporter在独立消费者。



<a id="logging-tracing-metrics"></a>

### OPS-CMP-002 logging-tracing-metrics

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：MetricSnapshot={capturedAtMs:Millis,counters:MetricPoint[],gauges:MetricPoint[]}; SpanRecord={spanRef:Ref,parentRef:Ref|null,phase:PhaseCode,startMs:Millis,durationMs:Count,result:ResultCode}。

操作：writeBatch({records:TelemetrySignal[]})->{written:Count,dropped:Count}; snapshot()->MetricSnapshot；仅由TelemetryPipeline调用，业务层不直接写文件。



<a id="health-diagnostics"></a>

### OPS-CMP-003 health-diagnostics

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：HealthSnapshot={observedAtMs:Millis,liveness:Bool,readiness:Bool,degraded:Bool,reasons:HealthCode[]}; Probe={component:ComponentCode,state:healthy|unavailable|unknown,observedAtMs:Millis}; DiagnosticRequest={scopeRef:Ref,runRef:Ref|null}。

操作：health()->HealthSnapshot; diagnose(DiagnosticRequest)->{artifact:Artifact,expiresAtMs:Millis}; liveness只判断探针事件循环可响应；readiness是准入条件，不能替代执行时授权检查。



<a id="security-audit"></a>

### OPS-CMP-004 security-audit

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：AuditEvent={auditEventId:Ref,scopeRef:Ref,subjectRef:Ref,actionRef:Ref,policyEpoch:Count,kind:decision|approval|consume|start|deny|secret|isolation|resolution,result:allow|deny|unknown,occurredAtMs:Millis,causationId:Ref}; AuditReceipt={auditEventId:Ref,sequence:Count}。

操作：append(AuditEvent)->AuditReceipt; read({afterSequence:Count,limit:Count})->AuditPage；内部appendIntent与领域事务outbox结合，不允许外部更新既有event。
