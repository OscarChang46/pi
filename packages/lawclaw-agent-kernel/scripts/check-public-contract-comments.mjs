import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const publicApiRoots = [
  path.join(projectRoot, "src", "contracts"),
  path.join(projectRoot, "src", "config"),
];
const chineseText = /[\u3400-\u9fff]/u;

async function listTypeScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listTypeScriptFiles(entryPath)));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(entryPath);
  }
  return files;
}

function hasChineseTsDoc(node, sourceFile) {
  const leading = sourceFile.text.slice(node.getFullStart(), node.getStart(sourceFile));
  const comments = leading.match(/\/\*\*[\s\S]*?\*\//gu) ?? [];
  const closest = comments.at(-1);
  return closest !== undefined && chineseText.test(closest);
}

function isExported(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function displayName(node, sourceFile) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  return node.getText(sourceFile).split(/[\s(:]/u, 1)[0] || "匿名成员";
}

const failures = [];
const publicApiFiles = (await Promise.all(publicApiRoots.map((root) => listTypeScriptFiles(root)))).flat();
for (const filePath of publicApiFiles) {
  const sourceText = await fs.readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);
  const relativePath = path.relative(projectRoot, filePath);

  for (const statement of sourceFile.statements) {
    const publicDeclaration =
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement);
    if (!publicDeclaration || !isExported(statement)) continue;

    if (!hasChineseTsDoc(statement, sourceFile)) {
      failures.push(`${relativePath}:${sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1} 导出声明 ${displayName(statement, sourceFile)} 缺少中文 TSDoc`);
    }

    if (ts.isInterfaceDeclaration(statement)) {
      for (const member of statement.members) {
        if (!hasChineseTsDoc(member, sourceFile)) {
          failures.push(`${relativePath}:${sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1} 接口成员 ${statement.name.text}.${displayName(member, sourceFile)} 缺少中文 TSDoc`);
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error("错误：公共契约中文注释门禁未通过：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("公共契约中文 TSDoc 覆盖检查通过。");
