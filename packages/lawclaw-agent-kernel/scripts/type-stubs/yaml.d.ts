/**
 * `yaml` 的编译期最小类型桩。
 * 真实外部依赖声明可用时，构建脚本不会加载本文件。
 */

/** 将 YAML 文本解析为边界外的未知值；调用方负责完整校验。 */
export function parse(source: string): unknown;
