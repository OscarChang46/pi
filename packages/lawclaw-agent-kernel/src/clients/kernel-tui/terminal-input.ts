const MIN_CONVERSATION_COLUMNS = 30;

const COMMAND_ARGUMENTS = {
	help: false,
	status: false,
	cancel: false,
	new: false,
	attach: true,
	quit: false,
	retry: false,
	content: true,
	next: false,
	back: false,
} as const;

/** 首期封闭命令；二/三期能力不注册到当前路径。 */
export type TuiCommand = keyof typeof COMMAND_ARGUMENTS;

/** 命令在宽度检查之前识别，但连接/Run/pending守卫仍由对应用例执行。 */
export type TuiInput =
	| {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "command";
			/** 首期已注册命令名。 */
			readonly name: TuiCommand;
			/** 单个不透明参数；无参数命令为null。 */
			readonly argument: string | null;
	  }
	| {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "conversation";
			/** 当前有界正文，保留用户空白；渲染前仍需清洗。 */
			readonly text: string;
	  }
	| {
			/** 封闭变体判别字段，不根据其他字段猜测类型。 */
			readonly kind: "invalid";
			/** 本地输入拒绝原因；拒绝不发送请求。 */
			readonly reason: "empty" | "narrow" | "command";
	  };

/** 保留正文空白；只将显式单行斜杠输入解释为命令，不支持shell语法。 */
export function parseTuiInput(text: string, columns: number): TuiInput {
	if (!text.trim()) return { kind: "invalid", reason: "empty" };
	const singleLine = !/[\r\n]/u.test(text);
	if (singleLine && text.startsWith("/") && !text.startsWith("//")) {
		const [name, ...arguments_] = text.slice(1).trim().split(/\s+/u);
		if (!isCommand(name)) return { kind: "invalid", reason: "command" };
		const expectedArguments = COMMAND_ARGUMENTS[name] ? 1 : 0;
		if (arguments_.length !== expectedArguments) return { kind: "invalid", reason: "command" };
		return { kind: "command", name, argument: arguments_[0] ?? null };
	}
	if (columns < MIN_CONVERSATION_COLUMNS) return { kind: "invalid", reason: "narrow" };
	return { kind: "conversation", text: singleLine && text.startsWith("//") ? text.slice(1) : text };
}

function isCommand(name: string | undefined): name is TuiCommand {
	return name !== undefined && Object.hasOwn(COMMAND_ARGUMENTS, name);
}
