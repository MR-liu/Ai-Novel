import { describe, expect, it } from "vitest";

import { buildAnnotationRevisionQueueSeed } from "./revisionQueueDrafts";
import type { MemoryAnnotation } from "./types";

function makeAnnotation(args: Partial<MemoryAnnotation> & { id: string }): MemoryAnnotation {
  return {
    id: args.id,
    type: args.type ?? "plot_point",
    title: args.title ?? null,
    content: args.content ?? "",
    importance: args.importance ?? 0.5,
    position: args.position ?? 0,
    length: args.length ?? 6,
    tags: args.tags ?? [],
    metadata: args.metadata ?? {},
  };
}

describe("revisionQueueDrafts", () => {
  it("builds a queue seed with exact excerpt when annotation is valid", () => {
    const annotation = makeAnnotation({
      id: "ann-1",
      type: "character_state",
      title: "人物状态冲突",
      position: 3,
      length: 4,
    });

    expect(buildAnnotationRevisionQueueSeed(annotation, "前文她彻夜未眠，后文却神采奕奕。", new Set(["ann-1"]))).toEqual({
      id: "ann-1",
      title: "人物状态冲突",
      type: "character_state",
      excerpt: "彻夜未眠",
      hasExcerpt: true,
    });
  });

  it("falls back to title/content only when annotation is not valid", () => {
    const annotation = makeAnnotation({
      id: "ann-2",
      content: "旧承诺在这里被直接遗忘了，需要回头修。",
    });

    expect(buildAnnotationRevisionQueueSeed(annotation, "正文内容", new Set())).toEqual({
      id: "ann-2",
      title: "旧承诺在这里被直接遗忘了，需要回头修。",
      type: "plot_point",
      excerpt: "",
      hasExcerpt: false,
    });
  });
});
