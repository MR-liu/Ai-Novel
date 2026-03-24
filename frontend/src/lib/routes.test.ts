import { describe, expect, it } from "vitest";

import { resolveRouteMeta } from "./routes";
import { UI_COPY } from "./uiCopy";

describe("resolveRouteMeta", () => {
  it("resolves canonical route titles", () => {
    expect(resolveRouteMeta("/")).toEqual({
      title: UI_COPY.nav.home,
      layout: "landing",
    });
    expect(resolveRouteMeta("/projects/import")).toEqual({
      title: UI_COPY.nav.projectImport,
      layout: "author",
    });
    expect(resolveRouteMeta("/projects/demo/home/overview")).toEqual({
      title: UI_COPY.nav.projectHome,
      layout: "author",
    });
    expect(resolveRouteMeta("/projects/demo/story-bible/world")).toEqual({
      title: UI_COPY.nav.storyBible,
      layout: "author",
    });
    expect(resolveRouteMeta("/projects/demo/review/preview")).toEqual({
      title: UI_COPY.nav.review,
      layout: "author",
    });
    expect(resolveRouteMeta("/projects/demo/write")).toEqual({
      title: UI_COPY.nav.write,
      layout: "manuscript",
    });
    expect(resolveRouteMeta("/projects/demo/studio/research/search")).toEqual({
      title: UI_COPY.nav.researchDesk,
      layout: "studio",
    });
  });

  it("keeps legacy route titles as fallback during redirect window", () => {
    expect(resolveRouteMeta("/projects/demo/import")).toEqual({
      title: UI_COPY.nav.dataImport,
      layout: "studio",
    });
    expect(resolveRouteMeta("/projects/demo/prompt-templates")).toEqual({
      title: UI_COPY.nav.promptTemplates,
      layout: "studio",
    });
  });

  it("falls back to app name for unknown paths", () => {
    expect(resolveRouteMeta("/projects/demo/unknown")).toEqual({
      title: UI_COPY.brand.appName,
      layout: "studio",
    });
  });
});
