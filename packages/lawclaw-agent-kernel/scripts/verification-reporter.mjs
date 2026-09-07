// Only identifiers and failure categories leave the test process; never serialize assertion payloads.
export default async function* reporter(source) {
	for await (const event of source) {
		if (event.type !== "test:pass" && event.type !== "test:fail") continue;
		yield JSON.stringify({
			type: event.type,
			id: event.data.name.match(/^\[(AK-[A-Z0-9]+-\d{3})\] /u)?.[1],
			file: event.data.file,
			skip: Boolean(event.data.skip),
			todo: Boolean(event.data.todo),
			durationMs: event.data.details?.duration_ms,
			errorCode: event.data.details?.error?.code,
		}) + "\n";
	}
}
