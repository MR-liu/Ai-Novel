import { describe, expect, it } from "vitest";

import {
  buildGlobalProjectImportPath,
  buildProjectHomePath,
  buildProjectOutlinePath,
  buildProjectPublishPath,
  buildProjectReviewPath,
  buildProjectWritePath,
  buildStoryBiblePath,
  buildStudioAiPath,
  buildStudioResearchPath,
  buildStudioSystemPath,
} from "./projectRoutes";

describe("projectRoutes", () => {
  it("builds canonical routes with default tabs", () => {
    expect(buildProjectHomePath("p1")).toBe("/projects/p1/home/overview");
    expect(buildStoryBiblePath("p1")).toBe("/projects/p1/story-bible/overview");
    expect(buildProjectReviewPath("p1")).toBe("/projects/p1/review/preview");
    expect(buildStudioAiPath("p1")).toBe("/projects/p1/studio/ai/models");
    expect(buildStudioResearchPath("p1")).toBe("/projects/p1/studio/research/import-docs");
    expect(buildStudioSystemPath("p1")).toBe("/projects/p1/studio/system/tasks");
  });

  it("builds fixed-page routes", () => {
    expect(buildProjectOutlinePath("p1")).toBe("/projects/p1/outline");
    expect(buildProjectWritePath("p1")).toBe("/projects/p1/write");
    expect(buildProjectPublishPath("p1")).toBe("/projects/p1/publish");
    expect(buildGlobalProjectImportPath()).toBe("/projects/import");
  });

  it("accepts explicit tabs", () => {
    expect(buildProjectHomePath("p1", "settings")).toBe("/projects/p1/home/settings");
    expect(buildStoryBiblePath("p1", "glossary")).toBe("/projects/p1/story-bible/glossary");
    expect(buildProjectReviewPath("p1", "analysis")).toBe("/projects/p1/review/analysis");
    expect(buildStudioAiPath("p1", "templates")).toBe("/projects/p1/studio/ai/templates");
    expect(buildStudioResearchPath("p1", "search")).toBe("/projects/p1/studio/research/search");
    expect(buildStudioSystemPath("p1", "fractal")).toBe("/projects/p1/studio/system/fractal");
  });
});
