import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, "../src"));
const failures = [];
const graph = new Map();
function files(directory) {
 return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? files(path.join(directory, entry.name)) : entry.name.endsWith(".ts") ? [path.join(directory, entry.name)] : []);
}
const core = new Set(["contracts", "control", "cognitive", "tools", "security", "observability"]);
const sourceFiles = files(root);
if (sourceFiles.length === 0) { console.error("源码扫描为空，不能判定边界通过。"); process.exit(1); }
for (const file of sourceFiles) {
 const relative = path.relative(root, file);
 const area = relative.split(path.sep)[0];
 const text = fs.readFileSync(file, "utf8");
 const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
 if (source.parseDiagnostics.length > 0) failures.push(`${relative}: 源码无法解析`);
 const adapter = relative.includes(`${path.sep}adapters${path.sep}`);
 const composition = area === "application" || area === "pi-cli" || relative === "cognitive/adapters/pi-adapter-factory.ts";
 const dependencies = [];
 graph.set(file, dependencies);
 for (const node of source.statements) {
  if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
  const specifier = node.moduleSpecifier.text;
  if (typeof specifier !== "string") continue;
  const typeOnly = node.isTypeOnly || node.importClause?.isTypeOnly ||
   (node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings) && node.importClause.namedBindings.elements.length > 0 && node.importClause.namedBindings.elements.every(element => element.isTypeOnly));
  if (specifier.startsWith(".")) {
   const target = path.resolve(path.dirname(file), specifier);
   if (!fs.existsSync(target)) failures.push(`${relative}: 不存在的依赖 ${specifier}`);
   const targetRelative = path.relative(root,target);
   const targetArea = targetRelative.split(path.sep)[0];
   if (targetRelative.startsWith("..")) failures.push(`${relative}: 禁止相对路径跨出上层包源码`);
   if (!typeOnly) dependencies.push(target);
   if (area !== targetArea && targetArea !== "contracts" && !composition && relative !== "index.ts") {
    if (!(adapter && targetArea === "config" && typeOnly)) failures.push(`${relative}: 跨职责直接依赖 ${specifier}`);
   }
   if (area === "contracts" && targetArea !== "contracts") failures.push(`${relative}: 契约反向依赖实现`);
  } else {
   if (specifier.startsWith("@earendil-works/pi-") && !(area === "pi-cli" || (area === "cognitive" && adapter))) failures.push(`${relative}: Pi 原生类型或能力越界`);
   if (core.has(area) && !adapter && /^(?:node:(?:fs|path|child_process|net|http|https|worker_threads)|bun:|express|fastify|yaml|.*sqlite)/u.test(specifier)) failures.push(`${relative}: 核心直接依赖机制 ${specifier}`);
  }
 }
 function visit(node) {
  if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) failures.push(`${relative}: 禁止动态导入绕过依赖检查`);
  if (ts.isImportTypeNode(node)) failures.push(`${relative}: 禁止内联类型导入`);
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && /(?:Adapter|Provider|Sandbox)$/u.test(node.expression.text) && !composition) {
   const ownClass = source.statements.some(statement => ts.isClassDeclaration(statement) && statement.name?.text === node.expression.text);
   if (!ownClass) failures.push(`${relative}: 装配边界外创建具体 Adapter`);
  }
  ts.forEachChild(node, visit);
 }
 visit(source);
 if (core.has(area) && /\b(?:WorkflowInstance|WorkflowStep|ApprovalCase|Conversation)\s*(?:\{|=)/u.test(text)) failures.push(`${relative}: 定义业务权威类型`);
 if (!relative.endsWith("system-time-adapter.ts") && /\b(?:new Date|Date\.now|Date\.parse)\b/u.test(text)) failures.push(`${relative}: 绕过 TimePort`);
}
const visiting = new Set(), visited = new Set();
function walk(file, chain) {
 if (visiting.has(file)) { failures.push(`运行时循环依赖: ${[...chain,file].map(item=>path.relative(root,item)).join(" → ")}`); return; }
 if (visited.has(file)) return;
 visiting.add(file);
 for (const target of graph.get(file) ?? []) walk(target,[...chain,file]);
 visiting.delete(file); visited.add(file);
}
for (const file of graph.keys()) walk(file,[]);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("职责依赖、装配边界、Pi 隔离与运行时无环检查通过。");
