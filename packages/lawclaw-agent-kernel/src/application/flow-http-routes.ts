import type { IncomingMessage, ServerResponse } from "node:http";
import { flowDigest } from "../contracts/flow-value.ts";
import type { AgentTurnRequest } from "../contracts/index.ts";
import { REACT_FLOW_STATE } from "../contracts/react-flow-values.ts";
import { FLOW_SCHEDULER_LIMITS, type FlowScheduler } from "../control/flow-scheduler.ts";
import { flowRunIdForAgentRun } from "../control/react-flow-host.ts";
import type { createFlowService } from "./flow-composition.ts";

type Service = Awaited<ReturnType<typeof createFlowService>>;

/** 输出JSON；诊断及结果不允许被代理缓存。 */
export function sendFlowResponse(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
	response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
	if (!request.headers["content-type"]?.startsWith("application/json")) throw new Error("FLOW_HTTP_BODY_INVALID");
	const chunks: Buffer[] = [];
	let bytes = 0;
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
		bytes += buffer.length;
		if (bytes > 16384) throw new Error("FLOW_HTTP_BODY_LIMIT");
		chunks.push(buffer);
	}
	const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("FLOW_HTTP_BODY_INVALID");
	return value as Record<string, unknown>;
}

/** HTTP用例处理器；方法各自处理一个路由，登记表只选择处理器。 */
export class FlowHttpRoutes {
	readonly #service: Service;
	readonly #scheduler: FlowScheduler;
	/** 绑定已装配服务与调度端口，不启动后台任务。 */
	constructor(service: Service, scheduler: FlowScheduler) {
		this.#service = service;
		this.#scheduler = scheduler;
	}
	async #submit(request: IncomingMessage, response: ServerResponse): Promise<void> {
		const service = this.#service;
		if (this.#scheduler.status.stopping) return sendFlowResponse(response, 503, { code: "FLOW_STOPPING" });
		const body = await readBody(request);
		const { runId: agentRunId, goal } = body;
		const duration = body.timeoutMs ?? service.maxDurationMs;
		if (
			Object.keys(body).some((key) => !["runId", "goal", "timeoutMs"].includes(key)) ||
			typeof agentRunId !== "string" ||
			!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(agentRunId) ||
			typeof goal !== "string" ||
			!goal.trim() ||
			Buffer.byteLength(goal) > 8192 ||
			typeof duration !== "number" ||
			!Number.isSafeInteger(duration) ||
			duration < 1 ||
			duration > service.maxDurationMs
		)
			throw new Error("FLOW_HTTP_BODY_INVALID");
		const now = service.time.now().epochMilliseconds;
		const prior = service.store.initial(agentRunId);
		if (!prior && service.store.listRunIds(FLOW_SCHEDULER_LIMITS.maxRuns).length >= FLOW_SCHEDULER_LIMITS.maxRuns)
			return sendFlowResponse(response, 503, { code: "FLOW_CAPACITY_EXCEEDED" });
		const input = service.frames.initial({ runId: agentRunId, goal: goal, nowMs: now, deadlineAtMs: now + duration });
		if (prior) {
			const oldFrame = service.artifacts.get(prior.context!.promptRef) as AgentTurnRequest;
			const newFrame = service.artifacts.get(input.context!.promptRef) as AgentTurnRequest;
			if (
				flowDigest(oldFrame.frame.messages) !== flowDigest(newFrame.frame.messages) ||
				prior.run.deadlineAtMs - prior.operation.nowMs !== duration ||
				prior.run.bindings.configVersion !== service.configVersion
			)
				return sendFlowResponse(response, 409, { code: "FLOW_ADMISSION_CONFLICT" });
		} else service.store.admit(input);
		this.#scheduler.schedule(agentRunId);
		sendFlowResponse(response, 202, { runId: agentRunId, statusUrl: `/runs/${agentRunId}` });
	}
	#status(_request: IncomingMessage, response: ServerResponse, agentRunId: string): void {
		const service = this.#service;
		const input = service.store.load(agentRunId);
		if (!input) {
			sendFlowResponse(response, 404, { code: "FLOW_RUN_NOT_FOUND" });
			return;
		}
		const agentRun = input.run;
		const flowRunId = flowRunIdForAgentRun(agentRunId);
		sendFlowResponse(response, 200, {
			runId: agentRunId,
			flowRun: service.journal.history(flowRunId).length ? service.journal.get(flowRunId) : null,
			position: agentRun.position,
			version: agentRun.version,
			attemptId: agentRun.attemptId,
			cancelEpoch: agentRun.cancelEpoch,
			usage: agentRun.usage,
			consumedSequence: agentRun.consumedSequence,
			error: this.#scheduler.status.failures.get(agentRunId) ?? null,
			commands: service.store.commands(agentRunId).map((record) => ({
				commandId: record.command.commandId,
				kind: record.command.payload.kind,
				status: record.status,
				effect: record.effect,
				childId: record.command.payload.kind === "CreateChildRun" ? record.command.payload.childId : undefined,
			})),
			output:
				agentRun.position.kind === REACT_FLOW_STATE.COMPLETED
					? service.artifacts.get(agentRun.position.outputRef)
					: null,
		});
	}
	#cancel(_request: IncomingMessage, response: ServerResponse, agentRunId: string): void {
		const service = this.#service;
		if (!service.store.load(agentRunId)) {
			sendFlowResponse(response, 404, { code: "FLOW_RUN_NOT_FOUND" });
			return;
		}
		service.store.cancel(agentRunId);
		service.driver.abort(agentRunId);
		this.#scheduler.schedule(agentRunId);
		const agentRun = service.store.load(agentRunId)!.run;
		sendFlowResponse(response, 202, { runId: agentRunId, cancellationRequested: agentRun.cancellationRequested });
	}
	#diagnoseRun(_request: IncomingMessage, response: ServerResponse, agentRunId: string): void {
		const service = this.#service;
		const input = service.store.load(agentRunId);
		if (!input) {
			sendFlowResponse(response, 404, { code: "FLOW_RUN_NOT_FOUND" });
			return;
		}
		sendFlowResponse(response, 200, {
			runId: agentRunId,
			depth: input.run.depth,
			configVersion: input.run.bindings.configVersion,
			deadlineAtMs: input.run.deadlineAtMs,
			incidents: service.maintenance.incidents(agentRunId),
			flowRunEvents: service.journal
				.history(flowRunIdForAgentRun(agentRunId))
				.map(({ sequence, kind }) => ({ sequence, kind })),
			...service.maintenance.history(agentRunId),
			error: this.#scheduler.status.failures.get(agentRunId) ?? null,
		});
	}
	#diagnoseService(_request: IncomingMessage, response: ServerResponse): void {
		const service = this.#service;
		const agentRunIds = service.store.listRunIds(FLOW_SCHEDULER_LIMITS.maxRuns);
		const states: Record<string, number> = {};
		for (const agentRunId of agentRunIds) {
			const kind = service.store.load(agentRunId)!.run.position.kind;
			states[kind] = (states[kind] ?? 0) + 1;
		}
		sendFlowResponse(response, 200, {
			model: service.model,
			configVersion: service.configVersion,
			running: this.#scheduler.status.running,
			maxConcurrentRoots: FLOW_SCHEDULER_LIMITS.maxConcurrentRoots,
			maxRuns: FLOW_SCHEDULER_LIMITS.maxRuns,
			storedRuns: agentRunIds.length,
			states,
			driverErrors: this.#scheduler.status.failures.size,
			storage: service.maintenance.storageStats(),
		});
	}
	/** 返回固定路由表；不复制用例逻辑或通过分支派发。 */
	entries() {
		const runPath = "([A-Za-z0-9][A-Za-z0-9._:-]{0,127})";
		return [
			{ method: "POST", path: /^\/runs$/, handler: this.#submit.bind(this) },
			{ method: "GET", path: new RegExp(`^/runs/${runPath}$`), handler: this.#status.bind(this) },
			{ method: "POST", path: new RegExp(`^/runs/${runPath}/cancel$`), handler: this.#cancel.bind(this) },
			{ method: "GET", path: new RegExp(`^/runs/${runPath}/diagnostics$`), handler: this.#diagnoseRun.bind(this) },
			{ method: "GET", path: /^\/diagnostics$/, handler: this.#diagnoseService.bind(this) },
		] as const;
	}
}
