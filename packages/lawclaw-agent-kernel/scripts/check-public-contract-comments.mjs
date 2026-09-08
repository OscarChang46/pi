import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../src");
const failures = [];
function files(directory) {
 return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
  ? files(path.join(directory, entry.name)) : entry.name.endsWith(".ts") ? [path.join(directory, entry.name)] : []);
}
for (const file of files(root)) {
 const text = fs.readFileSync(file, "utf8");
 const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
 const privateMember = node => (node.name && ts.isPrivateIdentifier(node.name)) || node.modifiers?.some(modifier =>
  modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword);
 function check(node) {
  if (privateMember(node)) return;
  const leading = text.slice(node.getFullStart(), node.getStart(source));
  const doc = (leading.match(/\/\*\*[\s\S]*?\*\//gu) ?? []).at(-1);
  if (!doc || !/[\u3400-\u9fff]/u.test(doc)) failures.push(`${path.relative(root,file)}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line+1} 缺少中文 TSDoc`);
 }
 function nested(type) {
  if (ts.isTypeLiteralNode(type)) {
   for (const member of type.members) { check(member); if (member.type) nested(member.type); }
  } else ts.forEachChild(type, nested);
 }
 for (const statement of source.statements) {
  if (ts.isExportDeclaration(statement)) {
   if (!statement.exportClause) failures.push(`${path.relative(root,file)} 禁止通配导出`);
   continue;
  }
  if (!statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
  check(statement);
  if (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
   for (const member of statement.members) {
    if (privateMember(member)) continue;
    check(member); if (member.type) nested(member.type);
   }
  } else if (ts.isTypeAliasDeclaration(statement)) nested(statement.type);
 }
 if (path.basename(file) === "index.ts" && !/^\/\*\*[\s\S]*?[\u3400-\u9fff]/u.test(text)) failures.push(`${file} 缺少导出范围说明`);
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }
console.log("全部源码导出、公开成员、嵌套契约及显式导出注释检查通过。");
