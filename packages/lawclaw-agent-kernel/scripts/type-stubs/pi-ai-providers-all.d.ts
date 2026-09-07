/**
 * `@earendil-works/pi-ai/providers/all` 的编译期最小类型桩。
 * 真实依赖声明可用时，构建脚本不会加载本文件。
 */

import type { MutableModels } from "@earendil-works/pi-ai";

/** 创建包含 Pi 内置 Provider 的模型目录。 */
export function builtinModels(): MutableModels;
