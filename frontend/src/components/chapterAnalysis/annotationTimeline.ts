import type { MemoryAnnotation } from "./types";

export type AnnotationTimelineZone = {
  key: "start" | "middle" | "end";
  label: string;
  count: number;
  importantCount: number;
  averageImportance: number;
  annotationIds: string[];
  leadAnnotation: MemoryAnnotation | null;
};

const ZONES: Array<{ key: AnnotationTimelineZone["key"]; label: string; startPct: number; endPct: number }> = [
  { key: "start", label: "章首", startPct: 0, endPct: 0.34 },
  { key: "middle", label: "中段", startPct: 0.34, endPct: 0.67 },
  { key: "end", label: "章末", startPct: 0.67, endPct: 1.01 },
];

export function buildAnnotationTimeline(args: {
  annotations: MemoryAnnotation[];
  contentLength: number;
}): AnnotationTimelineZone[] {
  const contentLength = Math.max(1, args.contentLength);
  const buckets = ZONES.map((zone) => ({
    ...zone,
    annotations: [] as MemoryAnnotation[],
  }));

  for (const annotation of args.annotations ?? []) {
    const centerPct = (annotation.position + Math.max(annotation.length, 1) / 2) / contentLength;
    const bucket = buckets.find((zone) => centerPct >= zone.startPct && centerPct < zone.endPct) ?? buckets[buckets.length - 1];
    bucket.annotations.push(annotation);
  }

  return buckets.map((bucket) => {
    const sorted = [...bucket.annotations].sort(
      (a, b) => b.importance - a.importance || a.position - b.position || a.id.localeCompare(b.id),
    );
    const importantCount = sorted.filter((annotation) => annotation.importance >= 0.75).length;
    const averageImportance =
      sorted.length > 0 ? sorted.reduce((sum, annotation) => sum + annotation.importance, 0) / sorted.length : 0;

    return {
      key: bucket.key,
      label: bucket.label,
      count: sorted.length,
      importantCount,
      averageImportance,
      annotationIds: sorted.map((annotation) => annotation.id),
      leadAnnotation: sorted[0] ?? null,
    };
  });
}
