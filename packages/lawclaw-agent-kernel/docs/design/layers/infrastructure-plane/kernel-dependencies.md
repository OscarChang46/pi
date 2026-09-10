# Kernel对本目录的依赖要求

## R1补充：Kernel必须获得的事务与授权保证

Artifact Pin请求须带`{ownerKind:run|session|memory,ownerId:Ref,operationId:Ref,transactionId:Ref,payloadDigest:Digest,artifactId:Ref}`，返回`{pinId:Ref,state:pending|attached|releasing}`。Kernel领域事务必须原子附着pinId（可由同库机制参加该事务），或使用能证明旧写者已失效的事务屏障后才确认未附着。恢复方可按ownerKind/operationId查询原提交；一次absent不允许unpin。Kernel必须持久保存pin与操作身份的关联，进程重启仍能列举pending pin，不允许把归属只存在调用栈。

所需机制查询：`queryOperation({ownerKind,ownerId,operationId})->committed|absent|unknown|gone`；`invalidateOperation({ownerKind,ownerId,operationId})->{fence:Count}`；`confirmAbsentAfterBarrier({operationId,fence})->{absent:Bool}`。失效后旧事务不能再附着，随后屏障序列化此前所有写入。已附着不释放、未确定保留、确认未提交可回收。这些是消费方必须依赖的保证，具体数据库/GC算法由本目录另行实现。

Artifact published必须保证内容和名称索引均耐久可恢复；仅对文件内容fsync不能证明目录项断电耐久。外部Adapter必须说明支持的故障档案，不支持断电恢复时不得宣称该能力；Kernel在发布结果未知时不提交该引用。实际文件同步、备份恢复测试不在本轮范围。

Host授权依赖：外部授权源失联或策略不可确认时必须调用Kernel安全失效入口；外部撤销只有本地失效回执确认后才视为此Kernel已生效。技术AuthorizationState有效期≤30秒，过期失败关闭。Host重建不得从过期缓存安装旧epoch。这里不设计身份/RBAC系统，Kernel只校验可信安装的技术状态与当前epoch。


本轮范围说明：这是Kernel内部详细设计所需的输入输出与保证，不是本目录组件详细设计、外部产品选型或实现任务。既有概要保留；外部所有者实现前须提供满足这些契约的Adapter。Kernel测试用Faux依赖验证正确使用边界，不用替身证明外部服务已实现。

所有调用传播可信Scope、稳定commandId与Deadline；依赖不可验证时Kernel停止新受保护动作。下面是调用方需求规格，版本CD-1，未发布为公共Schema。

## 调用方必需保证

State必须提供原子CAS+收据+outbox、scope隔离、结果未知查询与旧写者失效屏障；Artifact必须有不可变内容、授权读取及防悬空引用的保留pin。Kernel不能仅凭query absent假定旧提交不会稍后生效。

容量依赖需统一预算：首版请求10GiB总持久额度含DB/WAL/Artifact/审计/普通日志与临时落盘、1GiB清理/已知结果保留；80%告警、90%停止新Run与新业务派发；物理可用<1GiB同保护。open incident/非终态不删，终态后至少30天保留相关幂等与执行事实。具体数据库、GC、备份/迁移实现由本目录后续设计负责。

Clock提供UTC/单调时间与可信健康；回拨/无法验证时Kernel拒新claim/Permit/派发。Secret只能在Scoped执行Adapter内借用，不能进入Kernel DTO。模型出口需关闭隐藏重试，Provider协议和DNS/TLS机制不在本轮。

<a id="state-storage"></a>

### INF-CMP-001 state-storage

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：StorageRecord={scopeKey:Ref,aggregateId:Ref,version:Count,payload:Json}; IdempotencyRecord={scopeKey:Ref,commandId:Ref,digest:Digest,resultRef:Ref}; SqliteManifest={schemaVersion:Count,hostEpoch:Ref}。

操作：transaction({transactionId:Ref,scope:TrustedScope},repositoryOperation)->CommitReceipt；repositoryOperation是进程内封闭业务方法，不可序列化回调或外部SQL；queryCommit({transactionId:Ref})->committed|absent|gone；barrier({invalidatedClaim:ExecutionClaim})->{barrierVersion:Count}。



<a id="artifact-storage"></a>

### INF-CMP-002 artifact-storage

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：ArtifactRecord={artifact:Artifact,mediaType:Ref,scopeKey:Ref,state:staging|published|deleting,pins:Count,createdAtMs:Millis}; PinRequest={ownerKind:run|session|memory,ownerId:Ref,operationId:Ref,transactionId:Ref,payloadDigest:Digest,artifactId:Ref}; Pin=PinRequest+{pinId:Ref,state:pending|attached|releasing}。

操作：put({content:BoundedStream,maxBytes:Count,mediaType:Ref})->Artifact; read({artifact:Artifact,maxBytes:Count})->BoundedStream; pin(PinRequest)->Pin; unpin({pinId:Ref,absenceProofRef:Ref|null})->{released:Bool}，pending必须提供失效/屏障后的未提交证明，attached只接受领域解除引用凭证；collect({cursor:Ref|null,limit:Count})->{nextCursor:Ref|null,deleted:Count}。



<a id="process-container"></a>

### INF-CMP-004 process-container

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：ProcessRecord={environmentRef:Ref,commandId:Ref,hostEpoch:Ref,pid:Count|null,creationNonce:Ref,state:creating|running|terminating|reclaimed|reclaim_pending}; 实际路径/容器ID仅私有。

操作：spawn({plan:ExecutionPlan,argv:Text[],profile:sidecar|sandbox})->{environmentRef:Ref}; terminate({environmentRef:Ref})->{state:ProcessState}; inspect({environmentRef:Ref})->ProcessRecord。



<a id="transport"></a>

### INF-CMP-005 transport

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：Frame={version:Version,requestId:Ref,kind:request|response|event|ack,payload:Json}; Window={nextSeq:Count,lastAck:Count,inFlight:Count}。

操作：send({frame:Frame})->{written:Bool}; receive()->AsyncStream<Frame>; close({deadlineAtMs:Millis})->{closed:Bool}；written仅写入通道，不等于命令已受理。



<a id="model-egress"></a>

### INF-CMP-006 model-egress

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：EndpointBinding={bindingRef:Ref,originRef:Ref,tlsPolicyRef:Ref,secretHandle:Ref}; EgressRequest={commandId:Ref,bindingRef:Ref,body:BoundedStream,deadlineAtMs:Millis,maxResponseBytes:Count}。

操作：send(EgressRequest)->{status:Count,body:BoundedStream,requestRef:Ref|null}; abort({commandId:Ref})->{requested:Bool}；仅Pi私有模型协作者调用。



<a id="secret-resolver"></a>

### INF-CMP-007 secret-resolver

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：SecretLeaseMetadata={leaseRef:Ref,handleRef:Ref,purpose:model|tool|sandbox,expiresAtMs:Millis,state:active|revoked|closed}; secret bytes仅私有受限buffer，不属于可序列化DTO。

操作：withSecret({handleRef:Ref,purpose:SecretPurpose,deadlineAtMs:Millis},consumer)->ConsumerResult；consumer为可信进程内Adapter回调，不暴露为JSON方法；revoke({leaseRef:Ref})->{revoked:Bool}。



<a id="clock-time"></a>

### INF-CMP-008 clock-time

性质：Kernel调用方依赖要求；外部实现不在本轮设计范围。

数据：TimeSample={utcMs:Millis,monotonicMs:Count,hostEpoch:Ref,health:healthy|untrusted}; 持久Deadline只存UTC；单调值不跨hostEpoch比较。

操作：sample()->TimeSample; parseUtc({isoUtc:Text})->{utcMs:Millis}; remaining({deadlineAtMs:Millis,sample:TimeSample})->{millis:Count}。
