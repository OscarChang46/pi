import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourceRoot = path.resolve(import.meta.dirname, "../src");
const scanRoot = process.argv[2] ? path.resolve(process.argv[2]) : sourceRoot;
const definitions = ["contracts/flow-system-values.ts", "contracts/react-flow-values.ts"];
const values = new Set();
let suspendedState;
for (const file of definitions) {
	const source = ts.createSourceFile(file, fs.readFileSync(path.join(sourceRoot, file), "utf8"), ts.ScriptTarget.Latest, true);
	function collect(node) {
		if (ts.isStringLiteral(node) && ts.isPropertyAssignment(node.parent)) {
			values.add(node.text);
			if (node.parent.name.getText(source) === "SUSPENDED") suspendedState = node.text;
		}
		ts.forEachChild(node, collect);
	}
	collect(source);
}

// These words are also API member names; only system/graph values are governed here.
const contextual = new Set(["start", "yield", "resume", "recover", "terminate", "next", "exit"]);
function files(directory) {
	return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
		const file = path.join(directory, entry.name);
		return entry.isDirectory() ? files(file) : entry.name.endsWith(".ts") ? [file] : [];
	});
}

const failures = [];
for (const file of files(scanRoot)) {
	const relative = path.relative(scanRoot, file);
	if (!/flow/.test(relative) || definitions.includes(relative)) continue;
	const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
	const system = /flow-system|flow-graph|flow-journal/.test(relative);
	function inspect(node) {
		const key = ts.isIdentifier(node) && ts.isPropertyAssignment(node.parent) && node.parent.name === node;
		const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
		const fragment = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
		const value = key || literal || fragment ? node.text : "";
		const governed = values.has(value) && (!contextual.has(value) || (system && !key));
		const sql = (literal || fragment) && [...values].some(state => value.includes(`'${state}'`));
		const substate = (literal || fragment) && suspendedState && value.startsWith(`${suspendedState}.`);
		if (governed || sql || substate) {
			const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
			failures.push(`${relative}:${line} 状态值必须引用所属模块常量（包括类型、表键与SQL）。`);
		}
		ts.forEachChild(node, inspect);
	}
	inspect(source);
}
if (failures.length) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("Flow状态常量检查通过。");
