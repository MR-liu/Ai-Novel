import type { MemoryAnnotation } from "./types";

export type AnnotationMiniMapMarker = {
  annotation: MemoryAnnotation;
  leftPct: number;
  widthPct: number;
  lane: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildAnnotationMiniMap(args: {
  annotations: MemoryAnnotation[];
  contentLength: number;
  maxLanes?: number;
  minGapPct?: number;
  minWidthPct?: number;
  maxWidthPct?: number;
}): { markers: AnnotationMiniMapMarker[]; laneCount: number } {
  const contentLength = Math.max(1, args.contentLength);
  const maxLanes = Math.max(1, args.maxLanes ?? 4);
  const minGapPct = args.minGapPct ?? 0.8;
  const minWidthPct = args.minWidthPct ?? 1.2;
  const maxWidthPct = args.maxWidthPct ?? 10;

  const baseMarkers = [...(args.annotations ?? [])]
    .sort((a, b) => a.position - b.position || b.importance - a.importance || a.id.localeCompare(b.id))
    .map((annotation) => {
      const widthPct = clamp((Math.max(annotation.length, 1) / contentLength) * 100, minWidthPct, maxWidthPct);
      const centerPct = clamp(((annotation.position + Math.max(annotation.length, 1) / 2) / contentLength) * 100, 0, 100);
      const leftPct = clamp(centerPct - widthPct / 2, 0, 100 - widthPct);
      return { annotation, leftPct, widthPct };
    });

  const laneEnds = new Array<number>(maxLanes).fill(-Infinity);
  const markers: AnnotationMiniMapMarker[] = [];

  for (const marker of baseMarkers) {
    let lane = laneEnds.findIndex((end) => marker.leftPct - end >= minGapPct);
    if (lane < 0) {
      lane = laneEnds.reduce((bestLane, end, index) => (end < laneEnds[bestLane] ? index : bestLane), 0);
    }
    laneEnds[lane] = marker.leftPct + marker.widthPct;
    markers.push({ ...marker, lane });
  }

  const laneCount = Math.max(1, markers.reduce((max, marker) => Math.max(max, marker.lane + 1), 1));
  return { markers, laneCount };
}
