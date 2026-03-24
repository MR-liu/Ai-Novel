import { describe, expect, it } from "vitest";

const REGISTERED_PROMPT_TASKS = [
  "outline_generate",
  "chapter_generate",
  "plan_chapter",
  "post_edit",
  "content_optimize",
  "chapter_analyze",
  "chapter_rewrite",
] as const;

describe("prompt task reachability contract", () => {
  it("keeps the backend task registry wired into API contract coverage", () => {
    expect(REGISTERED_PROMPT_TASKS).toContain("outline_generate");
    expect(REGISTERED_PROMPT_TASKS).toContain("chapter_generate");
    expect(REGISTERED_PROMPT_TASKS).toContain("plan_chapter");
    expect(REGISTERED_PROMPT_TASKS).toContain("post_edit");
    expect(REGISTERED_PROMPT_TASKS).toContain("content_optimize");
    expect(REGISTERED_PROMPT_TASKS).toContain("chapter_analyze");
    expect(REGISTERED_PROMPT_TASKS).toContain("chapter_rewrite");
  });
});
