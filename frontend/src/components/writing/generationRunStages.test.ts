import { describe, expect, it } from "vitest";

import { getGenerationRunStage, getMcpRunSummary } from "./generationRunStages";

describe("generationRunStages", () => {
  it("maps mcp_tool into the mcp stage", () => {
    expect(getGenerationRunStage("mcp_tool")).toBe("mcp");
    expect(getGenerationRunStage("chapter")).toBe("generate");
  });

  it("extracts MCP summary from generation run params", () => {
    expect(
      getMcpRunSummary({
        id: "run-1",
        project_id: "p1",
        type: "mcp_tool",
        params: {
          tool_name: "project.search",
          purpose: "research",
          timeout_seconds: 6,
          max_output_chars: 4000,
        },
        created_at: "2026-03-15T00:00:00Z",
      }),
    ).toEqual({
      toolName: "project.search",
      purpose: "research",
      timeoutSeconds: "6",
      maxOutputChars: "4000",
    });
  });
});
