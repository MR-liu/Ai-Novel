import { describe, expect, it } from "vitest";

import {
  applyContinuityRevisionSearchParams,
  clearContinuityRevisionSearchParams,
  parseContinuityRevisionSearchParams,
} from "./continuityRevisionBridge";

describe("continuityRevisionBridge", () => {
  it("applies and parses revision context from search params", () => {
    const next = applyContinuityRevisionSearchParams(new URLSearchParams("chapterId=c1"), {
      id: "ann-1",
      chapterId: "c1",
      title: "主角状态前后不一致",
      type: "character_state",
      excerpt: "她明明已经失眠三天，却在这里说自己精神很好。",
    });

    expect(parseContinuityRevisionSearchParams(next)).toEqual({
      source: "analysis",
      id: "ann-1",
      chapterId: "c1",
      title: "主角状态前后不一致",
      type: "character_state",
      excerpt: "她明明已经失眠三天，却在这里说自己精神很好。",
      hasExcerpt: true,
    });
  });

  it("falls back to excerpt when title is missing", () => {
    const next = applyContinuityRevisionSearchParams(new URLSearchParams(), {
      chapterId: "c2",
      excerpt: "旧承诺在这里被直接遗忘了。",
    });

    expect(parseContinuityRevisionSearchParams(next)).toEqual({
      source: "analysis",
      id: "c2:other:旧承诺在这里被直接遗忘了。",
      chapterId: "c2",
      title: "旧承诺在这里被直接遗忘了。",
      type: "other",
      excerpt: "旧承诺在这里被直接遗忘了。",
      hasExcerpt: true,
    });
  });

  it("clears only revision-related params", () => {
    const params = new URLSearchParams(
      "chapterId=c3&revision_source=analysis&revision_chapter_id=c3&revision_title=test&foo=bar",
    );

    const next = clearContinuityRevisionSearchParams(params);
    expect(next.get("foo")).toBe("bar");
    expect(next.get("revision_title")).toBeNull();
    expect(parseContinuityRevisionSearchParams(next)).toBeNull();
  });

  it("ignores incomplete or unsupported revision payloads", () => {
    expect(parseContinuityRevisionSearchParams(new URLSearchParams("revision_source=other"))).toBeNull();
    expect(
      parseContinuityRevisionSearchParams(
        new URLSearchParams("revision_source=analysis&revision_chapter_id=c1"),
      ),
    ).toBeNull();
  });
});
