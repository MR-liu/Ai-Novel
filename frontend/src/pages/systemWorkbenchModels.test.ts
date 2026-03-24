import { describe, expect, it } from "vitest";

import { SYSTEM_WORKBENCH_COPY } from "./systemWorkbenchModels";

describe("systemWorkbenchModels", () => {
  it("defines stable system page keys", () => {
    expect(Object.keys(SYSTEM_WORKBENCH_COPY)).toEqual(["tasks", "structured-memory", "fractal"]);
  });

  it("defines complete author-facing guidance for each system page", () => {
    for (const summary of Object.values(SYSTEM_WORKBENCH_COPY)) {
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

  it("keeps system pages task-oriented", () => {
    expect(SYSTEM_WORKBENCH_COPY.tasks.focusValue).toContain("失败任务");
    expect(SYSTEM_WORKBENCH_COPY["structured-memory"].cautionValue).toContain("底层治理台");
    expect(SYSTEM_WORKBENCH_COPY.fractal.cautionCopy).toContain("模型波动");
  });
});
