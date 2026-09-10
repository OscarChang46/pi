import { checkContextCancellation } from "../contracts/control/context-engine/context-error.ts";
import type {
	EnsureSessionCommand,
	SessionCommandPort,
	SessionQueryPort,
} from "../contracts/control/session-manager/session-manager-contract.ts";
import type {
	PreparedRootSession,
	RootSessionCandidateAssemblerPort,
} from "../contracts/control/session-manager/session-preparation.ts";
import type { RequestContext } from "../contracts/types.ts";

export type {
	PreparedRootSession,
	RootSessionCandidateAssemblerPort,
} from "../contracts/control/session-manager/session-preparation.ts";

/** 编排 Root 首次访问；只协调 Port，不进入 SessionManager 本地事务。 */
export class RootSessionPreparationCoordinator {
	readonly #query: SessionQueryPort;
	readonly #command: SessionCommandPort;

	/** 注入分离的查询与命令端口，保持 lookup 无隐藏写入。 */
	constructor(query: SessionQueryPort, command: SessionCommandPort) {
		this.#query = query;
		this.#command = command;
	}

	/** 执行 lookup → candidate → ensure；竞争失败时丢弃旧候选并按赢家锚点重组。 */
	async prepare(
		context: RequestContext,
		command: EnsureSessionCommand,
		assembler: RootSessionCandidateAssemblerPort,
		signal: AbortSignal,
	): Promise<PreparedRootSession> {
		checkContextCancellation(signal);
		const lookup = this.#query.lookup(context, command.intent.logicalKey);
		if (lookup.state === "found") {
			const sessionInput = Object.freeze({ kind: "existing" as const, anchor: lookup.anchor });
			const candidate = await assembler.assemble(sessionInput, signal);
			return Object.freeze({ anchor: lookup.anchor, created: false, sessionInput, candidate });
		}

		const creationInput = Object.freeze({ kind: "create" as const, intent: command.intent });
		const creationCandidate = await assembler.assemble(creationInput, signal);
		checkContextCancellation(signal);
		const ensured = this.#command.ensure(context, command);
		if (ensured.created) {
			return Object.freeze({
				anchor: ensured.anchor,
				created: true,
				sessionInput: creationInput,
				candidate: creationCandidate,
			});
		}

		const winnerInput = Object.freeze({ kind: "existing" as const, anchor: ensured.anchor });
		const winnerCandidate = await assembler.assemble(winnerInput, signal);
		return Object.freeze({
			anchor: ensured.anchor,
			created: false,
			sessionInput: winnerInput,
			candidate: winnerCandidate,
		});
	}
}
