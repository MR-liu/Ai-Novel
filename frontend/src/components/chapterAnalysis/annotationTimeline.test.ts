import { describe, expect, it } from "vitest";

import { buildAnnotationTimeline } from "./annotationTimeline";
import type { MemoryAnnotation } from "./types";

function makeAnnotation(args: Partial<MemoryAnnotation> & { id: string; position: number; length: number }): MemoryAnnotation {
  return {
    id: args.id,
    type: args.type ?? "plot_point",
    title: args.title ?? null,
    content: args.content ?? "",
    importance: args.importance ?? 0.5,
    position: args.position,
    length: args.length,
    tags: args.tags ?? [],
    metadata: args.metadata ?? {},
  };
}

describe("buildAnnotationTimeline", () => {
  it("distributes annotations into start, middle and end zones", () => {
    const zones = buildAnnotationTimeline({
      contentLength: 900,
      annotations: [
        makeAnnotation({ id: "s", position: 10, length: 20 }),
        makeAnnotation({ id: "m", position: 360, length: 20 }),
        makeAnnotation({ id: "e", position: 760, length: 20 }),
      ],
    });

    expect(zones.map((zone) => zone.count)).toEqual([1, 1, 1]);
    expect(zones[0].label).toBe("章首");
    expect(zones[1].label).toBe("中段");
    expect(zones[2].label).toBe("章末");
  });

  it("selects the most important annotation as zone lead", () => {
    const zones = buildAnnotationTimeline({
      contentLength: 600,
      annotations: [
        makeAnnotation({ id: "a", position: 50, length: 15, importance: 0.4 }),
        makeAnnotation({ id: "b", position: 80, length: 15, importance: 0.9 }),
      ],
    });

    expect(zones[0].leadAnnotation?.id).toBe("b");
    expect(zones[0].importantCount).toBe(1);
  });
});
