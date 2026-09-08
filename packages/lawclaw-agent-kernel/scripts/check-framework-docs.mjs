import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];
const documents = [path.join(root,"README.md"),path.join(root,"docs/runtime/framework-boundaries.md")];
function visit(directory) {
 const readme = path.join(directory,"README.md");
 if (!fs.existsSync(readme)) failures.push(`${path.relative(root,directory)} 缺少 README.md`);
 else documents.push(readme);
 for (const entry of fs.readdirSync(directory,{withFileTypes:true})) if (entry.isDirectory() && !entry.name.startsWith(".")) visit(path.join(directory,entry.name));
}
for (const directory of ["src","test","config","scripts"]) visit(path.join(root,directory));
for (const file of documents) {
 const text = fs.readFileSync(file,"utf8");
 for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
  const target=match[1].split("#")[0];
  if (!target || /^[a-z]+:/iu.test(target)) continue;
  if (!fs.existsSync(path.resolve(path.dirname(file),target))) failures.push(`${path.relative(root,file)} 链接不存在: ${target}`);
 }
}
const readme=fs.readFileSync(path.join(root,"README.md"),"utf8");
const example=readme.match(/```ts\n([\s\S]*?)\n```/u)?.[1];
const tested=fs.readFileSync(path.join(root,"test/system/readme-example.test.ts"),"utf8").split("// README 示例开始\n")[1]?.split("\n// README 示例结束")[0]?.replace('"../../src/index.ts"','"./src/index.ts"');
if (!example || example!==tested) failures.push("README 示例与受类型检查、测试执行的示例不一致");
if (failures.length) {console.error(failures.join("\n"));process.exit(1);}
console.log(`目录 README、${documents.length} 份文档链接与可执行示例一致性检查通过。`);
