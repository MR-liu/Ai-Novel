import { describe, expect, it } from "vitest";

import { RESEARCH_WORKBENCH_COPY } from "./researchWorkbenchModels";

describe("researchWorkbenchModels", () => {
  it("defines stable research page keys", () => {
    expect(Object.keys(RESEARCH_WORKBENCH_COPY)).toEqual(["import-docs", "knowledge-base", "search", "graph"]);
  });

  it("defines complete author-facing guidance for each research page", () => {
    for (const summary of Object.values(RESEARCH_WORKBENCH_COPY)) {
      expect(summary.title.length).toBeGreaterThan(0);
      expect(summary.text.length).toBeGreaterThan(0);
      expect(summary.focusValue.length).toBeGreaterThan(0);
      expect(summary.focusCopy.length).toBeGreaterThan(0);
      expect(summary.nextValue.length).toBeGreaterThan(0);
      expect(summary.nextCopy.length).toBeGreaterThan(0);
      expect(summary.cautionValue.length).toBeGreaterThan(0);
      expect(summary.cautionCopy.length).toBeGreaterThan(0);
    }
  });

  it("keeps task-oriented framing for key pages", () => {
    expect(RESEARCH_WORKBENCH_COPY["import-docs"].cautionValue).toContain("已生效");
    expect(RESEARCH_WORKBENCH_COPY["knowledge-base"].nextValue).toContain("真实查询");
    expect(RESEARCH_WORKBENCH_COPY.graph.cautionValue).toContain("文本检索");
  });
});
