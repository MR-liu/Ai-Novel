export type McpToolSpec = {
  name: string;
  description: string;
  args_schema?: Record<string, unknown>;
};

export type McpToolCallPayload = {
  tool_name: string;
  args: Record<string, unknown>;
};

export type McpResearchPayload = {
  enabled: boolean;
  allowlist: string[];
  calls: McpToolCallPayload[];
  timeout_seconds: number;
  max_output_chars: number;
};

export const DEFAULT_MCP_TOOL_NAMES = ["project.search", "project.vector_query"];

export function normalizeMcpToolSelection(selected: string[], availableNames?: string[]): string[] {
  const seed = selected.length > 0 ? selected : DEFAULT_MCP_TOOL_NAMES;
  const deduped = Array.from(new Set(seed.map((item) => String(item || "").trim()).filter(Boolean)));
  if (!availableNames || availableNames.length === 0) return deduped;

  const available = new Set(availableNames);
  const filtered = deduped.filter((item) => available.has(item));
  if (filtered.length > 0) return filtered;
  return DEFAULT_MCP_TOOL_NAMES.filter((item) => available.has(item));
}

export function buildMcpResearchQuery(args: {
  instruction: string;
  memoryQueryText: string;
  chapterPlan: string;
}): string {
  const memoryQueryText = args.memoryQueryText.trim();
  if (memoryQueryText) return memoryQueryText;
  return [args.instruction.trim(), args.chapterPlan.trim()].filter(Boolean).join("\n\n").trim();
}

export function buildMcpResearchPayload(args: {
  enabled: boolean;
  toolNames: string[];
  instruction: string;
  memoryQueryText: string;
  chapterPlan: string;
}): McpResearchPayload | null {
  if (!args.enabled) return null;

  const queryText = buildMcpResearchQuery({
    instruction: args.instruction,
    memoryQueryText: args.memoryQueryText,
    chapterPlan: args.chapterPlan,
  });
  if (!queryText) return null;

  const allowlist = normalizeMcpToolSelection(args.toolNames);
  if (allowlist.length === 0) return null;

  const calls = allowlist.map((toolName) => {
    switch (toolName) {
      case "project.search":
        return {
          tool_name: toolName,
          args: { q: queryText, limit: 5, offset: 0 },
        };
      case "project.vector_query":
        return {
          tool_name: toolName,
          args: {
            query_text: queryText,
            sources: ["worldbook", "outline", "chapter", "story_memory"],
          },
        };
      case "project.graph_query":
        return {
          tool_name: toolName,
          args: {
            query_text: queryText,
            hop: 1,
            max_nodes: 12,
            max_edges: 20,
          },
        };
      default:
        return {
          tool_name: toolName,
          args: {},
        };
    }
  });

  return {
    enabled: true,
    allowlist,
    calls,
    timeout_seconds: 6,
    max_output_chars: 4000,
  };
}
