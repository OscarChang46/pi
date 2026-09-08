# 配置加载

## 职责

严格解析 YAML、校验预算和 Prompt ID，按配置文件目录解析相对路径。

## 边界与非职责

不执行领域行为，不保存凭据，不允许核心直接读取配置。

## 接口、依赖与生命周期

入口 loadRuntimeSettings；配置与 Prompt Catalog 有读取大小上限，未知字段和缺失提示词失败。配置重启生效。

## 文件与子目录

- [index.ts](index.ts)
- [runtime-settings.ts](runtime-settings.ts)

## 设计依据

[对应设计](../../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
