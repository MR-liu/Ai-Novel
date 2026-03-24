import { describe, expect, it } from "vitest";

import { buildAnnotationMiniMap } from "./annotationMiniMap";
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

describe("buildAnnotationMiniMap", () => {
  it("builds stable marker positions from chapter annotations", () => {
    const { markers, laneCount } = buildAnnotationMiniMap({
      contentLength: 1000,
      annotations: [
        makeAnnotation({ id: "a", position: 50, length: 40 }),
        makeAnnotation({ id: "b", position: 500, length: 80 }),
        makeAnnotation({ id: "c", position: 900, length: 30 }),
      ],
    });

    expect(markers).toHaveLength(3);
    expect(markers[0].leftPct).toBeLessThan(markers[1].leftPct);
    expect(markers[1].leftPct).toBeLessThan(markers[2].leftPct);
    expect(laneCount).toBeGreaterThanOrEqual(1);
  });

  it("spreads dense markers across lanes but caps total lane count", () => {
    const annotations = Array.from({ length: 8 }, (_, index) =>
      makeAnnotation({ id: `ann-${index}`, position: 100 + index * 8, length: 30 }),
    );
    const { markers, laneCount } = buildAnnotationMiniMap({
      contentLength: 1000,
      annotations,
      maxLanes: 4,
      minGapPct: 2,
    });

    expect(markers.some((marker) => marker.lane > 0)).toBe(true);
    expect(laneCount).toBeLessThanOrEqual(4);
  });
});
