import { describe, expect, it } from "vitest";

import {
  APP_SHELL_FOCUS_NAV_SECTIONS,
  APP_SHELL_PROJECT_NAV_ITEMS,
  APP_SHELL_STUDIO_NAV_SECTIONS,
  getAppShellProjectNavItems,
} from "./appShellNavConfig";

describe("appShellNavConfig", () => {
  it("keeps deterministic section order for focus and studio modes", () => {
    expect(APP_SHELL_FOCUS_NAV_SECTIONS).toEqual(["core"]);
    expect(APP_SHELL_STUDIO_NAV_SECTIONS).toEqual(["core", "studio"]);
  });

  it("ensures each nav item id and route are unique", () => {
    const projectId = "demo-project";
    const ids = APP_SHELL_PROJECT_NAV_ITEMS.map((item) => item.id);
    const routes = APP_SHELL_PROJECT_NAV_ITEMS.map((item) => item.to(projectId));

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("keeps every section non-empty and includes critical entries", () => {
    const core = getAppShellProjectNavItems("core").map((item) => item.id);
    const studio = getAppShellProjectNavItems("studio").map((item) => item.id);

    expect(core.length).toBeGreaterThan(0);
    expect(studio.length).toBeGreaterThan(0);

    expect(core).toContain("projectHome");
    expect(core).toContain("storyBible");
    expect(core).toContain("write");
    expect(core).toContain("review");
    expect(studio).toContain("aiStudio");
    expect(studio).toContain("researchDesk");
    expect(studio).toContain("systemHub");
  });
});
