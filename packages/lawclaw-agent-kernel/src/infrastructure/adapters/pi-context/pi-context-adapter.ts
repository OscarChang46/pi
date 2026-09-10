import { type Context, type Message, Type } from "@earendil-works/pi-ai";
import { convertToLlm, estimateTokens, findCutPoint, type SessionEntry } from "@earendil-works/pi-coding-agent";
import type {
	ContextEstimatorPort,
	ContextMessage,
	ContextPayload,
	HistorySelectionRecord,
	RecentHistorySelectorPort,
} from "../../../contracts/control/context-engine/assembly-contract.ts";
import { requireContext } from "../../../contracts/control/context-engine/context-error.ts";
import { validateContextPayload } from "../../../contracts/control/context-engine/context-schema.ts";
import { canonicalize } from "../../../contracts/flow-value.ts";

function convertMessage(message: ContextMessage): Message {
	if (message.role === "user") return { role: "user", content: message.text, timestamp: 0 };
	if (message.role === "task_observation")
		return {
			role: "user",
			content: canonicalize({
				kind: "child_task_observation",
				childId: message.childId,
				childRunId: message.childRunId,
				outcome: message.outcome,
				text: message.text,
			}),
			timestamp: 0,
		};
	if (message.role === "tool")
		return {
			role: "toolResult",
			toolCallId: message.toolCallId,
			toolName: message.toolName,
			content: [{ type: "text", text: message.text }],
			isError: message.isError,
			timestamp: 0,
		};
	return {
		role: "assistant",
		content: message.content.map((block) => {
			if (block.type === "text") return { type: "text", text: block.text };
			if (block.type === "child_task")
				return {
					type: "text",
					text: canonicalize({
						kind: "child_task",
						childId: block.childId,
						childRunId: block.childRunId,
						task: block.task,
					}),
				};
			return {
				type: "toolCall",
				id: block.toolCallId,
				name: block.toolName,
				arguments: structuredClone(block.arguments),
			};
		}),
		api: "openai-completions",
		provider: "context-projection",
		model: "context-projection",
		timestamp: 0,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: message.stopReason === "tool_use" ? "toolUse" : message.stopReason,
	};
}

/** 真实Pi转换及估算适配器，不调用模型、Session或compact。 */
export class PiContextAdapter implements ContextEstimatorPort, RecentHistorySelectorPort {
	/** 实现或来源的冻结版本 */
	readonly version = "pi-estimate-1";
	/** 规范载荷格式版本 */
	readonly formatVersion = "ctx-input-1";
	/** 实际模型映射版本 */
	readonly modelAdapterVersion = "pi-context-1";
	/** 构造实际Pi Context；固定元数据只服务投影，不代表模型调用事实。 */
	toModelInput(payload: ContextPayload): Context {
		validateContextPayload(payload);
		const messages = payload.messages.map(convertMessage);
		messages.push({
			role: "user",
			timestamp: 0,
			content: [
				{ type: "text", text: payload.task },
				{
					type: "text",
					text: canonicalize({
						kind: "context_materials",
						items: payload.materials.map(({ sourceRef, version, text }) => ({ sourceRef, version, text })),
					}),
				},
				{
					type: "text",
					text: canonicalize({
						kind: "context_memory",
						items: payload.memory.map(({ spaceId, spaceVersion, entryId, entryVersion, text }) => ({
							spaceId,
							spaceVersion,
							entryId,
							entryVersion,
							text,
						})),
					}),
				},
			],
		});
		const converted = convertToLlm(messages);
		requireContext(converted.length === messages.length);
		return {
			systemPrompt: payload.system,
			messages: converted,
			tools: payload.tools.map((tool) => ({
				name: tool.name,
				description: tool.description,
				parameters: Type.Unsafe<Record<string, unknown>>(tool.inputSchema),
			})),
		};
	}
	/** 完整模型映射的字节及Pi软Token估算，不提供硬窗口保证。 */
	estimate(payload: ContextPayload): {
		/** 完整模型投影的Pi粗估Token数 */ inputTokens: number;
		/** 完整模型投影的UTF-8字节数 */
		inputBytes: number;
	} {
		const modelInput = this.toModelInput(payload);
		// TypeBox运行期符号不属于Provider JSON；显式取规范工具参数避免摘要函数序列化符号。
		const tools = payload.tools.map((tool) => ({
			name: tool.name,
			description: tool.description,
			parameters: tool.inputSchema,
		}));
		const envelope = { systemPrompt: payload.system, messages: modelInput.messages, tools };
		const baseline: Message = { role: "user", content: payload.system + canonicalize(tools), timestamp: 0 };
		return {
			inputTokens:
				estimateTokens(baseline) + modelInput.messages.reduce((sum, message) => sum + estimateTokens(message), 0),
			inputBytes: Buffer.byteLength(canonicalize(envelope)),
		};
	}
	/** 临时Entry与原recordRef一一映射，返回纯后缀建议。 */
	selectCut(input: { historyRecords: readonly HistorySelectionRecord[]; targetTokens: number }): {
		/** 协议字段firstKeptRecordRef，取值与空值语义遵循CTX-CON-1。 */
		firstKeptRecordRef: string | null;
	} {
		if (!input.historyRecords.length || input.targetTokens <= 0) return { firstKeptRecordRef: null };
		const entries: SessionEntry[] = input.historyRecords.map((record, index) => ({
			type: "message",
			id: `ctx_${index}`,
			parentId: index ? `ctx_${index - 1}` : null,
			timestamp: "1970-01-01T00:00:00.000Z",
			message: convertMessage(record.message),
		}));
		const result = findCutPoint(entries, 0, entries.length, input.targetTokens);
		const record = input.historyRecords[result.firstKeptEntryIndex];
		requireContext(record);
		return { firstKeptRecordRef: record.recordRef };
	}
}
