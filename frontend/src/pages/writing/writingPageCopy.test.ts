import { describe, expect, it } from "vitest";

import { getWritingAnalysisHref } from "./writingPageCopy";

describe("writingPageCopy", () => {
  it("builds the analysis link for the current chapter", () => {
    expect(getWritingAnalysisHref("project-1", "chapter-1")).toBe("/projects/project-1/review/analysis?chapterId=chapter-1");
  });

  it("includes annotationId when returning to a specific continuity item", () => {
    expect(getWritingAnalysisHref("project-1", "chapter-1", "ann 1")).toBe(
      "/projects/project-1/review/analysis?chapterId=chapter-1&annotationId=ann+1",
    );
  });

  it("includes revision status when returning after editing", () => {
    expect(getWritingAnalysisHref("project-1", "chapter-1", "ann-1", "saved")).toBe(
      "/projects/project-1/review/analysis?chapterId=chapter-1&annotationId=ann-1&revisionStatus=saved",
    );
  });
});
