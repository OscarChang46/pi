# 本地基础设施实现

## 职责

提供 UTC/IANA 时间适配、不可变内存授权快照和确定性子调用替身。

## 边界与非职责

不实现耐久状态、真实子 Run 调度或业务授权计算。

## 接口、依赖与生命周期

SystemTimeAdapter 是唯一读取系统时钟的实现；FakeDelegationProvider 只用于 Faux 场景，CLI 真正委派另有适配器。

## 文件与子目录

- [fake-delegation-provider.ts](fake-delegation-provider.ts)
- [in-memory-permission-snapshots.ts](in-memory-permission-snapshots.ts)
- [index.ts](index.ts)
- [system-time-adapter.ts](system-time-adapter.ts)

## 设计依据

[对应设计](../../../docs/design/layers/infrastructure-plane/README.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
