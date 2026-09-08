export default async function* reporter(source) {
	for await (const event of source) {
		if (event.type !== "test:pass" && event.type !== "test:fail") continue;
		yield `${JSON.stringify({
			type: event.type,
			name: event.data.name,
			file: event.data.file,
			skip: Boolean(event.data.skip),
			todo: Boolean(event.data.todo),
			durationMs: event.data.details?.duration_ms,
			errorCode: event.data.details?.error?.code,
		})}\n`;
	}
}
