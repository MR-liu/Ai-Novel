import { describe, expect, it } from "vitest";

import { buildMcpResearchPayload, buildMcpResearchQuery, normalizeMcpToolSelection } from "./mcpResearch";

describe("mcpResearch", () => {
  it("prefers memory query text over instruction and chapter plan", () => {
    expect(
      buildMcpResearchQuery({
        instruction: "写出冲突升级",
        memoryQueryText: "关键词查询",
        chapterPlan: "章节计划",
      }),
    ).toBe("关键词查询");
  });

  it("builds the expected MCP payload for default tools", () => {
    const payload = buildMcpResearchPayload({
      enabled: true,
      toolNames: ["project.search", "project.vector_query"],
      instruction: "写出冲突升级",
      memoryQueryText: "",
      chapterPlan: "主角进入苍穹城",
    });

    expect(payload).toEqual({
      enabled: true,
      allowlist: ["project.search", "project.vector_query"],
      calls: [
        {
          tool_name: "project.search",
          args: {
            q: "写出冲突升级\n\n主角进入苍穹城",
            limit: 5,
            offset: 0,
          },
        },
        {
          tool_name: "project.vector_query",
          args: {
            query_text: "写出冲突升级\n\n主角进入苍穹城",
            sources: ["worldbook", "outline", "chapter", "story_memory"],
          },
        },
      ],
      timeout_seconds: 6,
      max_output_chars: 4000,
    });
  });

  it("normalizes selection against available tools", () => {
    expect(normalizeMcpToolSelection([], ["project.search", "project.graph_query"])).toEqual(["project.search"]);
    expect(
      normalizeMcpToolSelection(["project.graph_query", "project.search"], [
        "project.search",
        "project.vector_query",
        "project.graph_query",
      ]),
    ).toEqual(["project.graph_query", "project.search"]);
  });
});
