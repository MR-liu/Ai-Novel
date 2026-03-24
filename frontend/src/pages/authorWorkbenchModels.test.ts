import { describe, expect, it } from "vitest";

import {
  getProjectHomeQuickLinks,
  getStoryBibleContinuityLinks,
  getStoryBibleOverviewCards,
  PROJECT_HOME_TAB_COPY,
  PROJECT_HOME_TABS,
  STORY_BIBLE_TAB_COPY,
  STORY_BIBLE_TABS,
} from "./authorWorkbenchModels";

describe("authorWorkbenchModels", () => {
  it("keeps project home and story bible tab order stable", () => {
    expect(PROJECT_HOME_TABS).toEqual(["overview", "setup", "settings"]);
    expect(STORY_BIBLE_TABS).toEqual(["overview", "characters", "world", "glossary", "continuity", "tables"]);
  });

  it("defines author-facing copy for every tab", () => {
    for (const tab of PROJECT_HOME_TABS) {
      expect(PROJECT_HOME_TAB_COPY[tab].title.length).toBeGreaterThan(0);
      expect(PROJECT_HOME_TAB_COPY[tab].focusValue.length).toBeGreaterThan(0);
    }
    for (const tab of STORY_BIBLE_TABS) {
      expect(STORY_BIBLE_TAB_COPY[tab].title.length).toBeGreaterThan(0);
      expect(STORY_BIBLE_TAB_COPY[tab].riskValue.length).toBeGreaterThan(0);
    }
  });

  it("builds stable quick links and dossier cards", () => {
    const quickLinks = getProjectHomeQuickLinks("p1");
    const overviewCards = getStoryBibleOverviewCards("p1");
    const continuityLinks = getStoryBibleContinuityLinks("p1");

    expect(quickLinks.map((item) => item.key)).toEqual(["setup", "settings", "outline", "write"]);
    expect(new Set(quickLinks.map((item) => item.to)).size).toBe(quickLinks.length);

    expect(overviewCards.map((item) => item.key)).toEqual([
      "characters",
      "world",
      "glossary",
      "tables",
      "continuity",
      "engine",
    ]);
    expect(continuityLinks.map((item) => item.key)).toEqual(["analysis", "foreshadows"]);
  });
});
