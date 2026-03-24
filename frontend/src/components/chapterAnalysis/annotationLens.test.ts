import { describe, expect, it } from "vitest";

import type { AnnotatedTextSegment } from "./annotatedTextSegments";
import { filterAnnotationsByLens, segmentMatchesLens } from "./annotationLens";
import type { MemoryAnnotation } from "./types";

function makeAnnotation(args: Partial<MemoryAnnotation> & { id: string; type: string }): MemoryAnnotation {
  return {
    id: args.id,
    type: args.type,
    title: args.title ?? null,
    content: args.content ?? "",
    importance: args.importance ?? 0.5,
    position: args.position ?? 0,
    length: args.length ?? 10,
    tags: args.tags ?? [],
    metadata: args.metadata ?? {},
  };
}

describe("annotationLens", () => {
  it("filters annotations by lens type", () => {
    const annotations = [
      makeAnnotation({ id: "a", type: "plot_point" }),
      makeAnnotation({ id: "b", type: "foreshadow" }),
    ];

    expect(filterAnnotationsByLens(annotations, "all").map((annotation) => annotation.id)).toEqual(["a", "b"]);
    expect(filterAnnotationsByLens(annotations, "foreshadow").map((annotation) => annotation.id)).toEqual(["b"]);
  });

  it("matches annotated segments against the current lens", () => {
    const segment: AnnotatedTextSegment = {
      kind: "annotated",
      text: "示例",
      start: 0,
      end: 2,
      groupAnnotations: [makeAnnotation({ id: "a", type: "plot_point" }), makeAnnotation({ id: "b", type: "foreshadow" })],
      activeAnnotations: [makeAnnotation({ id: "a", type: "plot_point" })],
      primary: makeAnnotation({ id: "a", type: "plot_point" }),
      overlapCount: 2,
      activeCount: 1,
      isOverlap: false,
      isBridge: false,
    };

    expect(segmentMatchesLens(segment, "all")).toBe(true);
    expect(segmentMatchesLens(segment, "foreshadow")).toBe(true);
    expect(segmentMatchesLens(segment, "character_state")).toBe(false);
  });
});
