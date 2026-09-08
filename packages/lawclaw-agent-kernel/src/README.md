# 源码职责导航

## 职责

通过 application 装配七个职责边界；入口 index.ts 仅暴露主机调用所需 API。

## 边界与非职责

不实现业务编排、认证或 Pi 核心。

## 接口、依赖与生命周期

从 index.ts 进入；跨职责依赖只能到 contracts，具体装配只在 application、CLI 扩展和 Pi 私有工厂。

## 文件与子目录

- [application](application/README.md)
- [cognitive](cognitive/README.md)
- [config](config/README.md)
- [contracts](contracts/README.md)
- [control](control/README.md)
- [execution](execution/README.md)
- [index.ts](index.ts)
- [infrastructure](infrastructure/README.md)
- [observability](observability/README.md)
- [pi-cli](pi-cli/README.md)
- [security](security/README.md)
- [tools](tools/README.md)

## 设计依据

[对应设计](../docs/design/agent-kernel-design.md)。本目录记录当前实现事实，完整候选协议仍待后续评审；当前重构不改变设计审批状态。
