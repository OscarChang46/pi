# 编译期依赖桩

本目录保存 `lawclaw-agent-kernel` 在 Pi 工作区依赖尚未生成声明产物时使用的
最小类型桩。它们只让上层内核能够独立完成严格类型检查和声明构建，不包含任何
运行时实现，也不能替代 `@earendil-works/pi-ai` 或
`@earendil-works/pi-coding-agent`。

## 文件

- `pi-ai.d.ts`：认知适配器和测试 Provider 当前使用的 Pi AI 类型表面。
- `pi-ai-providers-all.d.ts`：内置 Provider 模型目录工厂的类型表面。
- `pi-coding-agent.d.ts`：Pi CLI 扩展当前使用的注册与上下文类型表面。
- `yaml.d.ts`：配置加载器当前使用的外部 YAML 解析入口。

## 使用边界

`scripts/compile.mjs` 只在 `packages/ai/dist`、
`packages/coding-agent/dist` 或外部 YAML 包缺少所需声明文件时，让
`tsconfig.build-stub.json` 映射到这些桩。真实声明齐备时，构建直接使用
`tsconfig.build.json`，避免桩与真实 API 合并。

修改 Pi Adapter 或 CLI 集成所使用的外部类型时，应同步收窄或扩充对应类型桩，
并以 Pi 源码中的真实签名为准。禁止在这里加入返回成功的运行时代码。
