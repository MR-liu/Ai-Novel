import { describe, expect, it } from "vitest";

import { buildMarkdownExportUrl, getBundleExportPath } from "./exportPageModels";

describe("exportPageModels", () => {
  it("builds markdown export url with query params", () => {
    expect(
      buildMarkdownExportUrl("p1", {
        include_settings: true,
        include_characters: false,
        include_outline: true,
        chapters: "done",
      }),
    ).toBe(
      "/api/projects/p1/export/markdown?include_settings=1&include_characters=0&include_outline=1&chapters=done",
    );
  });

  it("builds bundle export path", () => {
    expect(getBundleExportPath("p1")).toBe("/api/projects/p1/export/bundle");
    expect(getBundleExportPath(undefined)).toBe("");
  });
});
