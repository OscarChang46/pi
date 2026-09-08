import { computeArgumentsDigest, computeToolDescriptorDigest } from "../contracts/authorization-digest.ts";
import type { FlowArtifactStore } from "../contracts/flow-artifacts.ts";
import type { FlowCommandHandler } from "../contracts/flow-dispatch.ts";
import type { AdvanceInput } from "../contracts/flow-engine.ts";
import type { FlowPermitStore } from "../contracts/flow-permits.ts";
import { flowDigest } from "../contracts/flow-value.ts";
import type { KernelToolCallBlock, RequestContext, TimePort, ToolDescriptor, ToolPolicy } from "../contracts/index.ts";
import type { PermissionApprovalPort } from "../contracts/permissions.ts";
import { FLOW_EFFECT } from "../contracts/react-flow-values.ts";
import type { ToolRuntimePort } from "../contracts/tool-runtime.ts";
import type { ToolExecutionScope } from "../contracts/tool-scope.ts";

/** Flow工具处理器的控制、安全与执行依赖。 */
export interface FlowToolDependencies {
	/** 现有PDP，负责权限交集。 */
	readonly permission: PermissionApprovalPort;
	/** 现有PEP及沙箱工具链。 */
	readonly tools: ToolRuntimePort;
	/** 耐久一次性消费目录。 */
	readonly permits: FlowPermitStore;
	/** 参数及结果存储。 */
	readonly artifacts: FlowArtifactStore;
	/** 当前可信调用上下文。 */
	readonly requestContext: () => RequestContext;
	/** 冻结Run权限投影。 */
	readonly scope: (input: AdvanceInput) => ToolExecutionScope;
	/** 当前受控策略。 */
	readonly policy: ToolPolicy;
	/** 统一时钟。 */
	readonly time: TimePort;
}

/** 为显式命令表创建权限判定处理器。 */
export function createFlowPermissionHandler(deps: FlowToolDependencies): FlowCommandHandler<"RequestPermission"> {
	return async (input, command, signal) => {
		const proposal = command.payload.proposal;
		const call = deps.artifacts.get(proposal.argumentsRef) as KernelToolCallBlock;
		const descriptor = deps.tools.list().find((item) => item.name === call.toolName);
		if (
			!descriptor ||
			descriptor.name !== proposal.toolDescriptorRef ||
			flowDigest(descriptor) !== proposal.toolDescriptorDigest
		)
			return {
				source: "security",
				payload: { kind: "PermissionResolved", proposalId: proposal.proposalId, result: { kind: "deny" } },
			};
		const context = deps.requestContext();
		const scope = deps.scope(input);
		const authorization = buildPermissionInput(context, scope, descriptor, call, deps.policy);
		const decision = await deps.permission.evaluate(context, authorization.request, authorization.intent, signal);
		const result =
			decision.kind === "DENY"
				? { kind: "deny" as const }
				: {
						kind: "allow" as const,
						permitRef: deps.permits.issue(input, proposal, decision.grant),
						expiresAtMs: deps.time.parseIsoUtc(decision.grant.expiresAt)!.epochMilliseconds,
					};
		return { source: "security", payload: { kind: "PermissionResolved", proposalId: proposal.proposalId, result } };
	};
}

/** 为显式命令表创建执行处理器；消费Permit后复用既有Grant再校验与沙箱。 */
export function createFlowToolHandler(deps: FlowToolDependencies): FlowCommandHandler<"DispatchTool"> {
	return async (input, command, signal) => {
		const proposal = command.payload.proposal;
		const call = deps.artifacts.get(proposal.argumentsRef) as KernelToolCallBlock;
		const grant = deps.permits.consume(input, command, command.payload.permitRef);
		const result = await deps.tools.execute(
			deps.requestContext(),
			{
				invocation: { toolCallId: call.toolCallId, toolName: call.toolName, arguments: call.arguments },
				scope: deps.scope(input),
				grant,
			},
			signal,
		);
		if (result.isError)
			return {
				source: "tool",
				payload: {
					kind: "ToolObserved",
					toolCommandId: command.commandId,
					proposalId: proposal.proposalId,
					effect: FLOW_EFFECT.NONE,
					outcome: "failed",
					resultRef: null,
				},
			};
		return {
			source: "tool",
			payload: {
				kind: "ToolObserved",
				toolCommandId: command.commandId,
				proposalId: proposal.proposalId,
				effect: FLOW_EFFECT.NONE,
				outcome: "success",
				resultRef: deps.artifacts.put({
					role: "tool",
					toolCallId: call.toolCallId,
					toolName: call.toolName,
					text: result.text,
					isError: false,
				}),
			},
		};
	};
}

function buildPermissionInput(
	context: RequestContext,
	scope: ToolExecutionScope,
	descriptor: ToolDescriptor,
	call: KernelToolCallBlock,
	policy: ToolPolicy,
) {
	return {
		request: {
			tenantId: context.tenant.tenantId,
			subjectId: context.tenant.subjectId,
			agentId: scope.agentId,
			sessionId: scope.sessionId,
			runId: scope.runId,
			policySnapshotId: scope.policySnapshotId,
			deadlineAt: context.operation.deadlineAt,
			descriptor,
			runtimeCeiling: scope.runtimeCeiling,
			sessionCeiling: scope.sessionCeiling,
			runCeiling: scope.runCeiling,
		},
		intent: {
			toolCallId: call.toolCallId,
			toolName: call.toolName,
			toolVersion: descriptor.version,
			toolDescriptorHash: computeToolDescriptorDigest(descriptor),
			argumentsHash: computeArgumentsDigest(call.arguments),
			resourceClaims: scope.resourceClaims,
			requestedEgress: scope.requestedEgress,
			requestedSecrets: scope.requestedSecrets,
			requestedBudget: { timeoutMs: policy.perCallTimeoutMs, maxResultBytes: descriptor.maxResultBytes },
		},
	};
}
