/**
 * 运行上层内核的类型检查或声明构建。
 *
 * 当 Pi 工作区包尚未生成声明文件时，声明构建改用编译期类型桩。类型桩只描述
 * 本包实际使用的边界，不会写入运行时替代实现；生成代码仍依赖真实 Pi 包。
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const packageRoot = path.resolve(import.meta.dirname, "..");
const repositoryRoot = path.resolve(packageRoot, "../..");
const compilerPath = path.join(
  repositoryRoot,
  "node_modules/@typescript/native-preview/bin/tsgo.js",
);

const mode = process.argv[2];
if (mode !== "--build" && mode !== "--typecheck") {
  console.error("用法：node scripts/compile.mjs --build|--typecheck");
  process.exit(2);
}

const [nodeMajor = "0", nodeMinor = "0"] = process.versions.node.split(".");
const hasSupportedNode =
	Number(nodeMajor) > 22 || (Number(nodeMajor) === 22 && Number(nodeMinor) >= 19);
if (!hasSupportedNode) {
  console.error(
    `lawclaw-agent-kernel 需要 Node.js >= 22.19.0，当前版本为 ${process.versions.node}。`,
  );
  process.exit(1);
}

if (!existsSync(compilerPath)) {
  console.error(
    `缺少 TypeScript 编译器：${compilerPath}。请先在仓库根目录安装依赖。`,
  );
  process.exit(1);
}

const dependencyDeclarations = [
	path.join(repositoryRoot, "packages/ai/dist/index.d.ts"),
	path.join(repositoryRoot, "packages/ai/dist/providers/all.d.ts"),
	path.join(repositoryRoot, "packages/coding-agent/dist/index.d.ts"),
];
const yamlDeclarations = [
	path.join(repositoryRoot, "node_modules/yaml/dist/index.d.ts"),
	path.join(packageRoot, "node_modules/yaml/dist/index.d.ts"),
];
const hasDependencyDeclarations =
	dependencyDeclarations.every(existsSync) && yamlDeclarations.some(existsSync);

let configName = "tsconfig.json";
if (mode === "--build") {
  configName = hasDependencyDeclarations
    ? "tsconfig.build.json"
    : "tsconfig.build-stub.json";

	if (!hasDependencyDeclarations) {
		console.error(
			"内部或外部依赖声明尚未就绪；本次只使用编译期类型桩检查并生成上层内核声明。",
		);
	}
}

const result = spawnSync(
  process.execPath,
  [compilerPath, "-p", path.join(packageRoot, configName)],
  {
    cwd: packageRoot,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`无法启动 TypeScript 编译器：${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
