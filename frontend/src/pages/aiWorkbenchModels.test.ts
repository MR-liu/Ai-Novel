import { describe, expect, it } from "vitest";

import { AI_WORKBENCH_COPY } from "./aiWorkbenchModels";

describe("aiWorkbenchModels", () => {
  it("defines stable ai workbench keys", () => {
    expect(Object.keys(AI_WORKBENCH_COPY)).toEqual(["project-strategy", "prompt-studio", "templates", "styles"]);
  });

  it("defines complete author-facing guidance for each ai workbench page", () => {
    for (const summary of Object.values(AI_WORKBENCH_COPY)) {
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

  it("keeps ai workbench guidance task-oriented", () => {
    expect(AI_WORKBENCH_COPY["project-strategy"].focusValue).toContain("检索链路");
    expect(AI_WORKBENCH_COPY["prompt-studio"].cautionValue).toContain("很多片段");
    expect(AI_WORKBENCH_COPY.templates.cautionCopy).toContain("片段顺序");
    expect(AI_WORKBENCH_COPY.styles.cautionValue).toContain("越强越好");
  });
});
