import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { FlowScheduler } from "../control/flow-scheduler.ts";
import type { createFlowService } from "./flow-composition.ts";
import { FlowHttpRoutes, sendFlowResponse } from "./flow-http-routes.ts";

type Service = Awaited<ReturnType<typeof createFlowService>>;

/** 创建单租户HTTP宿主：统一鉴权、容量、后台调度与关闭；业务由路由表登记。 */
export function createFlowHttpServer(service: Service, token: string) {
	if (token.length < 32) throw new Error("FLOW_HTTP_TOKEN_REQUIRED");
	const authorization = Buffer.from(`Bearer ${token}`);
	const scheduler = new FlowScheduler(service.store, service.driver);
	const routes = new FlowHttpRoutes(service, scheduler).entries();
	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", "http://localhost");
			if (request.method === "GET" && url.pathname === "/healthz") {
				service.store.listRunIds(1);
				return sendFlowResponse(response, scheduler.status.stopping ? 503 : 200, {
					status: scheduler.status.stopping ? "stopping" : "ready",
				});
			}
			const supplied = Buffer.from(request.headers.authorization ?? "");
			if (supplied.length !== authorization.length || !timingSafeEqual(supplied, authorization))
				return sendFlowResponse(response, 401, { code: "FLOW_UNAUTHORIZED" });
			const route = routes.find(
				(candidate) => candidate.method === request.method && candidate.path.test(url.pathname),
			);
			if (!route) return sendFlowResponse(response, 404, { code: "FLOW_ROUTE_NOT_FOUND" });
			await route.handler(request, response, route.path.exec(url.pathname)?.[1] ?? "");
		} catch (error) {
			const invalid =
				error instanceof SyntaxError || (error instanceof Error && error.message.startsWith("FLOW_HTTP_BODY"));
			sendFlowResponse(response, invalid ? 400 : 503, {
				code: invalid ? "FLOW_HTTP_BODY_INVALID" : "FLOW_SERVICE_UNAVAILABLE",
			});
		}
	});
	server.requestTimeout = 10000;
	server.headersTimeout = 5000;
	server.maxHeadersCount = 32;
	scheduler.start();
	return {
		server,
		stop: async () => {
			await scheduler.stop();
			await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
			service.close();
		},
	};
}
