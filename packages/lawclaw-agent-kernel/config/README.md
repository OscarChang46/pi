# 运行配置

## 职责

agent-kernel.yaml 管理模型、预算、工具、身份投影、时区和 CLI 参数；prompts.zh-CN.yaml 管理提示词正文。

## 边界与非职责

不保存密钥或业务权限规则，不能开启架构禁止能力。

## 接口、依赖与生命周期

经 src/config 校验后由 application 注入。相对路径基于主 YAML 所在目录，LAWCLAW_CONFIG_FILE 可以覆盖主配置路径。

## 文件与子目录

- [agent-kernel.yaml](agent-kernel.yaml)
- [prompts.zh-CN.yaml](prompts.zh-CN.yaml)

## 设计依据

[对应设计](../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
