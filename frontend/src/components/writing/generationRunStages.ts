import type { GenerationRun } from "./types";

export function getGenerationRunStage(type: string): string {
  if (type === "plan_chapter") return "plan";
  if (type === "chapter" || type === "chapter_stream") return "generate";
  if (type === "post_edit" || type === "post_edit_sanitize") return "post_edit";
  if (type === "content_optimize") return "content_optimize";
  if (type === "mcp_tool") return "mcp";
  if (type.startsWith("memory_update")) return "memory_update";
  return type || "unknown";
}

export function getMcpRunSummary(run: GenerationRun | null): {
  toolName: string;
  purpose: string | null;
  timeoutSeconds: string | null;
  maxOutputChars: string | null;
} | null {
  if (!run || run.type !== "mcp_tool" || !run.params || typeof run.params !== "object") return null;
  const params = run.params as Record<string, unknown>;
  return {
    toolName: String(params.tool_name ?? "").trim() || "unknown",
    purpose: typeof params.purpose === "string" ? params.purpose : null,
    timeoutSeconds:
      typeof params.timeout_seconds === "number" || typeof params.timeout_seconds === "string"
        ? String(params.timeout_seconds)
        : null,
    maxOutputChars:
      typeof params.max_output_chars === "number" || typeof params.max_output_chars === "string"
        ? String(params.max_output_chars)
        : null,
  };
}
