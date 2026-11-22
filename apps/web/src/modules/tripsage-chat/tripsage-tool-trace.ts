/**
 * Operator-only record of the tools the planning assistant called in one turn and what they returned.
 * Stored as an extra `data-tool-trace` part on the assistant message: the user-facing read path drops it
 * (it is not a stored display part), and only the admin trace endpoint returns it.
 */
export const TOOL_TRACE_PART = "data-tool-trace";
const MAX_ENTRIES = 40;
const MAX_FIELD_CHARS = 3_000;

export type ToolTraceEntry = { tool: string; callId: string; input?: unknown; output?: unknown; error?: string };
export type ToolTrace = { v: 1; entries: ToolTraceEntry[] };

/** Bounded JSON copy: long values become a truncated string so one large tool result cannot bloat the row. */
function bounded(value: unknown): unknown {
  let text: string;
  try { text = JSON.stringify(value) ?? "null"; } catch { return "[unserializable]"; }
  return text.length <= MAX_FIELD_CHARS ? JSON.parse(text) : `${text.slice(0, MAX_FIELD_CHARS)}…[cắt bớt]`;
}

export function createToolTraceCollector(privateTools: readonly string[] = []) {
  const entries: ToolTraceEntry[] = [];
  const byCall = new Map<string, ToolTraceEntry>();
  const entryFor = (callId: string, tool: string) => {
    let entry = byCall.get(callId);
    if (!entry && entries.length < MAX_ENTRIES) { entry = { tool, callId }; byCall.set(callId, entry); entries.push(entry); }
    return entry;
  };
  return {
    input(callId: string, tool: string, input: unknown) {
      const entry = entryFor(callId, tool);
      if (entry) entry.input = privateTools.includes(tool) ? "[riêng tư]" : bounded(input);
    },
    output(callId: string, output: unknown) {
      const entry = byCall.get(callId);
      if (entry) entry.output = privateTools.includes(entry.tool) ? { ok: (output as { ok?: unknown } | null)?.ok === true } : bounded(output);
    },
    error(callId: string, message: string) {
      const entry = byCall.get(callId);
      if (entry) entry.error = message.slice(0, 500);
    },
    snapshot(): ToolTrace | null { return entries.length ? { v: 1, entries: entries.map(entry => ({ ...entry })) } : null; },
  };
}

type TraceDb = {
  assistantConversation: {
    findUnique(args: unknown): Promise<{ id: string; title: string; userId: string; messages: { role: string; createdAt: Date; parts: unknown }[] } | null>;
  };
};

/** Admin read: every turn of one conversation with its user text, assistant text and tool trace. */
export async function readConversationTrace(db: TraceDb, conversationId: string) {
  const row = await db.assistantConversation.findUnique({
    where: { id: conversationId },
    select: { id: true, title: true, userId: true, messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { role: true, createdAt: true, parts: true } } },
  });
  if (!row) return null;
  return {
    conversationId: row.id,
    title: row.title,
    turns: row.messages.map(message => {
      const parts = Array.isArray(message.parts) ? message.parts as { type?: string; text?: string; data?: unknown }[] : [];
      return {
        role: message.role,
        at: message.createdAt.toISOString(),
        text: parts.filter(part => part.type === "text").map(part => part.text ?? "").join("\n"),
        dataParts: parts.filter(part => typeof part.type === "string" && part.type.startsWith("data-") && part.type !== TOOL_TRACE_PART).map(part => part.type),
        tools: (parts.find(part => part.type === TOOL_TRACE_PART)?.data as ToolTrace | undefined)?.entries ?? null,
      };
    }),
  };
}
