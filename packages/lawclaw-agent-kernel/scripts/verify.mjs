import { verify } from "./verification.mjs";

const options = { ids: [] };
try {
	for (let i = 2; i < process.argv.length; i++) {
		const argument = process.argv[i];
		if (argument === "--checks") options.checks = true;
		else if (argument === "--list") options.list = true;
		else if (["--level", "--id", "--root", "--manifest", "--report-dir"].includes(argument)) {
			const value = process.argv[++i];
			if (!value || value.startsWith("--")) throw new Error(`参数缺少值: ${argument}`);
			if (argument === "--id") options.ids.push(value);
			else
				options[
					{ "--level": "level", "--root": "root", "--manifest": "manifestPath", "--report-dir": "reportDirectory" }[
						argument
					]
				] = value;
		} else throw new Error(`未知参数: ${argument}`);
	}
	const result = await verify(options);
	if (options.list && result.success) console.log(JSON.stringify(result.cases, null, 2));
	else
		console.log(
			`验收${result.success ? "通过" : "失败"}；${result.cases.filter((c) => c.selected).length} 个选中用例。${result.problems.join("\n")}`,
		);
	process.exitCode = result.success ? 0 : 1;
} catch (error) {
	console.error(error.message);
	process.exitCode = 1;
}
