import { mkdirSync, readFileSync } from "node:fs";
import { createFlowService } from "./flow-composition.ts";
import { createFlowHttpServer } from "./flow-http-server.ts";

async function main(): Promise<void> {
	const dataDirectory = process.env.FLOW_DATA_DIRECTORY ?? "/data";
	const modelsPath = process.env.FLOW_MODELS_PATH;
	const providerId = process.env.FLOW_MODEL_PROVIDER;
	const modelId = process.env.FLOW_MODEL_ID;
	const tokenFile = process.env.FLOW_TOKEN_FILE;
	const port = Number(process.env.FLOW_PORT ?? "8080");
	if (!modelsPath || !providerId || !modelId || !tokenFile || !Number.isInteger(port) || port < 1 || port > 65535)
		throw new Error("FLOW_SERVICE_CONFIG_INVALID");
	mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
	const token = readFileSync(tokenFile, "utf8").trim();
	const service = await createFlowService({
		dataDirectory,
		modelsPath,
		providerId,
		modelId,
		maxAdvanceSteps: Number(process.env.FLOW_MAX_ADVANCE_STEPS ?? "512"),
	});
	const http = createFlowHttpServer(service, token);
	await new Promise<void>((resolve, reject) => {
		http.server.once("error", reject);
		http.server.listen(port, process.env.FLOW_HOST ?? "127.0.0.1", resolve);
	});
	console.log(
		JSON.stringify({ event: "flow_ready", port, providerId, modelId, configVersion: service.configVersion }),
	);
	let shuttingDown = false;
	const shutdown = () => {
		if (shuttingDown) return;
		shuttingDown = true;
		void http.stop().catch(() => {
			process.exitCode = 1;
		});
	};
	process.once("SIGTERM", shutdown);
	process.once("SIGINT", shutdown);
}

main().catch(() => {
	console.error(JSON.stringify({ event: "flow_start_failed", code: "FLOW_SERVICE_START_FAILED" }));
	process.exitCode = 1;
});
