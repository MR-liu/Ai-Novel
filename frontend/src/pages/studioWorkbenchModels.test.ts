import { describe, expect, it } from "vitest";

import {
  STUDIO_AI_TAB_COPY,
  STUDIO_AI_TABS,
  STUDIO_RESEARCH_TAB_COPY,
  STUDIO_RESEARCH_TABS,
  STUDIO_SYSTEM_TAB_COPY,
  STUDIO_SYSTEM_TABS,
} from "./studioWorkbenchModels";

describe("studioWorkbenchModels", () => {
  it("keeps studio tab order stable", () => {
    expect(STUDIO_AI_TABS).toEqual(["models", "prompts", "prompt-studio", "templates", "styles"]);
    expect(STUDIO_RESEARCH_TABS).toEqual(["import-docs", "knowledge-base", "search", "graph"]);
    expect(STUDIO_SYSTEM_TABS).toEqual(["tasks", "structured-memory", "fractal"]);
  });

  it("defines author-facing copy for every studio tab", () => {
    for (const tab of STUDIO_AI_TABS) {
      expect(STUDIO_AI_TAB_COPY[tab].title.length).toBeGreaterThan(0);
      expect(STUDIO_AI_TAB_COPY[tab].text.length).toBeGreaterThan(0);
      expect(STUDIO_AI_TAB_COPY[tab].bestFor.length).toBeGreaterThan(0);
      expect(STUDIO_AI_TAB_COPY[tab].nextStep.length).toBeGreaterThan(0);
      expect(STUDIO_AI_TAB_COPY[tab].caution.length).toBeGreaterThan(0);
    }

    for (const tab of STUDIO_RESEARCH_TABS) {
      expect(STUDIO_RESEARCH_TAB_COPY[tab].title.length).toBeGreaterThan(0);
      expect(STUDIO_RESEARCH_TAB_COPY[tab].text.length).toBeGreaterThan(0);
      expect(STUDIO_RESEARCH_TAB_COPY[tab].bestFor.length).toBeGreaterThan(0);
      expect(STUDIO_RESEARCH_TAB_COPY[tab].nextStep.length).toBeGreaterThan(0);
      expect(STUDIO_RESEARCH_TAB_COPY[tab].caution.length).toBeGreaterThan(0);
    }

    for (const tab of STUDIO_SYSTEM_TABS) {
      expect(STUDIO_SYSTEM_TAB_COPY[tab].title.length).toBeGreaterThan(0);
      expect(STUDIO_SYSTEM_TAB_COPY[tab].text.length).toBeGreaterThan(0);
      expect(STUDIO_SYSTEM_TAB_COPY[tab].bestFor.length).toBeGreaterThan(0);
      expect(STUDIO_SYSTEM_TAB_COPY[tab].nextStep.length).toBeGreaterThan(0);
      expect(STUDIO_SYSTEM_TAB_COPY[tab].caution.length).toBeGreaterThan(0);
    }
  });

  it("keeps task-oriented phrasing for key studio tabs", () => {
    expect(STUDIO_AI_TAB_COPY["prompt-studio"].bestFor).toContain("不同任务");
    expect(STUDIO_RESEARCH_TAB_COPY.search.nextStep).toContain("关系图");
    expect(STUDIO_SYSTEM_TAB_COPY["structured-memory"].caution).toContain("信息密度");
  });
});
