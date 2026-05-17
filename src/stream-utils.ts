const ACP_DYNAMIC_TOOL = "acp.acp_provider_agent_dynamic_tool";

type StreamEvent = Record<string, unknown> & { type: string };

function extractToolCall(event: StreamEvent): { toolName: string; code: string; toolCallId: string } | null {
  if (event.type !== "tool-call") return null;
  if (event.toolName !== ACP_DYNAMIC_TOOL) return null;

  let inputData: Record<string, unknown>;
  try {
    if (typeof event.input === "string") {
      inputData = JSON.parse(event.input);
    } else if (event.input && typeof event.input === "object") {
      inputData = event.input as Record<string, unknown>;
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const toolCallId = String(event.toolCallId ?? inputData.toolCallId ?? "");
  const toolName = String(inputData.toolName ?? "");
  if (!toolName) return null;

  const args = inputData.args as Record<string, unknown> | undefined;
  let code = "";
  if (args) {
    if (typeof args.command === "string") code = args.command;
    else if (typeof args.filePath === "string") code = args.filePath;
    else if (typeof args.url === "string") code = args.url;
    else if (typeof args.name === "string") code = args.name;
    else {
      const entries = Object.entries(args).slice(0, 2);
      if (entries.length > 0) code = entries.map(([k, v]) => `${k}: ${String(v).slice(0, 80)}`).join("\n");
    }
  }

  return { toolName, code, toolCallId };
}

function isTextDelta(event: StreamEvent): boolean {
  return event.type === "text-delta";
}

export async function* streamWithToolCalls(fullStream: AsyncIterable<unknown>): AsyncIterable<string> {
  const seenToolCallIds = new Set<string>();
  let pendingToolCall: string | null = null;
  let hasYielded = false;

  for await (const event of fullStream) {
    if (typeof event === "string") {
      if (pendingToolCall) {
        yield pendingToolCall + `\n\`\`\`\n\n`;
        pendingToolCall = null;
        hasYielded = true;
      }
      yield event;
      hasYielded = true;
      continue;
    }
    if (!event || typeof event !== "object") continue;
    const e = event as StreamEvent;

    if (isTextDelta(e)) {
      const text = (e.textDelta ?? e.text ?? e.delta ?? "") as string;
      if (text) {
        if (pendingToolCall) {
          yield pendingToolCall + `\n\`\`\`\n\n`;
          pendingToolCall = null;
          hasYielded = true;
        }
        yield text;
        hasYielded = true;
      }
    } else if (e.type === "tool-call") {
      const info = extractToolCall(e);
      if (info) {
        if (seenToolCallIds.has(info.toolCallId)) continue;
        seenToolCallIds.add(info.toolCallId);

        if (pendingToolCall) {
          yield pendingToolCall;
          hasYielded = true;
        }
        pendingToolCall = `\n\n\`\`\`\n${info.toolName}`;
        if (info.code) pendingToolCall += `\n${info.code}`;
      }
    } else if (e.type === "tool-result" || e.type === "tool-error") {
      if (pendingToolCall) {
        pendingToolCall += `\n\`\`\`\n\n`;
        yield pendingToolCall;
        pendingToolCall = null;
        hasYielded = true;
      }
    }
  }

  if (pendingToolCall) {
    pendingToolCall += `\n\`\`\`\n\n`;
    yield pendingToolCall;
    hasYielded = true;
  }

  if (!hasYielded) {
    yield "...";
  }
}
