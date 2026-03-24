import { describe, expect, it } from "vitest";

import { parseProjectBundleText } from "./projectBundleImport";

describe("projectBundleImport", () => {
  it("parses a valid project bundle and extracts the project name", () => {
    const raw = JSON.stringify({
      schema_version: "project_bundle_v1",
      project: { name: "Bundle Project" },
    });

    const parsed = parseProjectBundleText(raw);
    expect(parsed).toEqual({
      ok: true,
      bundle: {
        schema_version: "project_bundle_v1",
        project: { name: "Bundle Project" },
      },
      projectName: "Bundle Project",
    });
  });

  it("rejects invalid schema versions", () => {
    const parsed = parseProjectBundleText(JSON.stringify({ schema_version: "unknown_v1" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("project_bundle_v1");
  });

  it("rejects malformed json", () => {
    const parsed = parseProjectBundleText("{broken");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("JSON");
  });
});
